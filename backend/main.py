import asyncio
import base64
import os
import subprocess
import tempfile
import time
from collections import deque
from pathlib import Path

import httpx
import numpy as np
import soundfile as sf
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

OLLAMA_URL = "http://127.0.0.1:11434"
LLM_MODEL = os.getenv("LUMA_LLM", "qwen3:4b-instruct")
STT_MODEL = os.getenv("LUMA_STT", "mlx-community/whisper-small.en-mlx-q4")
TTS_MODEL = os.getenv("LUMA_TTS", "mlx-community/Kokoro-82M-4bit")
TTS_VOICE = os.getenv("LUMA_VOICE", "af_heart")
MAX_UPLOAD = 12 * 1024 * 1024

app = FastAPI(title="Luma Local Voice", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://tootooki.github.io",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

history: deque[dict[str, str]] = deque(maxlen=8)
model_lock = asyncio.Lock()
tts_model = None


async def ollama_ready() -> bool:
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            response = await client.get(f"{OLLAMA_URL}/api/tags")
            names = [item["name"] for item in response.json().get("models", [])]
            return any(name == LLM_MODEL or name.startswith(f"{LLM_MODEL}:") for name in names)
    except Exception:
        return False


@app.get("/health")
async def health():
    if not await ollama_ready():
        raise HTTPException(503, f"Ollama or {LLM_MODEL} is not ready")
    return {"status": "ready", "models": [LLM_MODEL, "Whisper Small", "Kokoro 82M"]}


def normalize_audio(source: Path, destination: Path) -> None:
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(source), "-ac", "1", "-ar", "16000", str(destination)],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        raise ValueError("The recorded audio format could not be read.")


def transcribe(path: Path) -> str:
    import mlx_whisper

    result = mlx_whisper.transcribe(
        str(path), path_or_hf_repo=STT_MODEL, language="en", temperature=0.0
    )
    return result.get("text", "").strip()


async def answer(transcript: str) -> str:
    messages = [
        {
            "role": "system",
            "content": (
                "You are Luma, a warm, capable voice assistant. Answer in plain spoken English. "
                "Be concise: usually one to three sentences. Do not use markdown, lists, or emojis."
            ),
        },
        *list(history),
        {"role": "user", "content": transcript},
    ]
    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/chat",
            json={"model": LLM_MODEL, "messages": messages, "stream": False, "options": {"num_ctx": 4096, "temperature": 0.4, "num_predict": 120}},
        )
        response.raise_for_status()
    reply = response.json()["message"]["content"].strip()
    history.extend([{"role": "user", "content": transcript}, {"role": "assistant", "content": reply}])
    return reply


def synthesize(text: str, destination: Path) -> None:
    global tts_model
    from mlx_audio.tts.utils import load_model

    if tts_model is None:
        tts_model = load_model(TTS_MODEL)
    segments = []
    sample_rate = 24000
    for result in tts_model.generate(text=text, voice=TTS_VOICE, speed=1.0, lang_code="a"):
        audio = result.audio
        if hasattr(audio, "__array__"):
            segments.append(np.asarray(audio).squeeze())
        else:
            segments.append(np.array(audio).squeeze())
        sample_rate = getattr(result, "sample_rate", sample_rate)
    if not segments:
        raise RuntimeError("The voice model produced no audio.")
    sf.write(destination, np.concatenate(segments), sample_rate, subtype="PCM_16")


@app.post("/api/conversation")
async def conversation(audio: UploadFile = File(...)):
    payload = await audio.read(MAX_UPLOAD + 1)
    if not payload or len(payload) > MAX_UPLOAD:
        raise HTTPException(400, "The recording was empty or too large.")
    started = time.perf_counter()
    async with model_lock:
        with tempfile.TemporaryDirectory(prefix="luma-turn-") as directory:
            source = Path(directory) / "input"
            normalized = Path(directory) / "input.wav"
            output = Path(directory) / "reply.wav"
            source.write_bytes(payload)
            try:
                await asyncio.to_thread(normalize_audio, source, normalized)
                transcript = await asyncio.to_thread(transcribe, normalized)
                if len(transcript) < 2:
                    raise HTTPException(422, "I couldn’t hear speech clearly. Please try again.")
                reply = await answer(transcript)
                await asyncio.to_thread(synthesize, reply, output)
            except HTTPException:
                raise
            except Exception as error:
                raise HTTPException(500, f"Local processing failed: {error}") from error
            return {
                "transcript": transcript,
                "reply": reply,
                "audio_base64": base64.b64encode(output.read_bytes()).decode("ascii"),
                "processing_seconds": round(time.perf_counter() - started, 2),
            }
