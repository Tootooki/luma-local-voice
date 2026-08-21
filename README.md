# Dolce Voice

Dolce Voice has two editions. The Apple Silicon app uses Granite, Whisper, and Kokoro locally on the Mac. The hosted edition uses GitHub Pages for the interface and a Cloudflare `workers.dev` API for speech recognition, language generation, and voice playback.

Hosted edition: https://tootooki.github.io/luma-local-voice/ — open it on another computer and start a continuous live call. Alex automatically detects each pause, answers aloud, and resumes listening until the visitor ends the call. Visitors do not install or download an AI model.

## Stack

- IBM Granite 4.1 3B through Ollama
- Optional Meta Muse Spark 1.2 through Meta Model API
- Whisper Small English Q4 through MLX Whisper
- Kokoro 82M bf16 through MLX-Audio
- FastAPI backend on `127.0.0.1:8787`
- Browser interface on `http://localhost:3000`

## Setup and launch

Make sure at least 8–12 GB of disk space is free. Then run `chmod +x setup-local.sh start-local.sh`, `./setup-local.sh`, and finally `./start-local.sh`. Setup downloads and verifies all three local models, so the first conversation is not also an installation step.

Open `http://localhost:3000`, allow microphone access, press **Start conversation**, speak, and press **Finish speaking**.

## GitHub Pages browser edition

The hosted edition calls the Luma API at `https://luma-voice-api.luma-voice-svlad92.workers.dev`. Cloudflare Workers AI runs Whisper Large V3 Turbo, Llama 3.1 8B Instruct Fast, and Aura speech synthesis. The API accepts requests only from the GitHub Pages origin and applies a per-client rate limit. Microphone audio and recent conversation text are processed in Cloudflare's service to produce each answer; the page stores no model and requires no model download.

The Worker configuration and source live in `cloudflare-worker/`. It has `workers_dev` enabled and defines no custom route, so deployment does not attach it to a purchased domain.

## Optional Meta Frontier mode

Granite Local works without any account or API key. To enable Muse Frontier, create a Meta Model API key at `dev.meta.ai`, copy `.env.example` to `.env`, and set the key with quotes because Meta keys contain pipe characters:

```zsh
MODEL_API_KEY='LLM|your-id|your-secret'
META_MODEL=muse-spark-1.2
```

Restart `./start-local.sh`. The Muse Frontier selector becomes available automatically. Meta mode keeps microphone audio, Whisper transcription, and Kokoro speech local; it sends the transcript and only Meta-mode conversation history to Meta Model API.

## Privacy boundary

The app binds to loopback. Granite Local uses no cloud AI API. Temporary turn audio is deleted after each response, and Ollama is never exposed publicly. Muse Frontier is opt-in and clearly labeled; it sends transcript text to Meta, never the recorded audio. Local and Meta histories are isolated so switching modes cannot upload an earlier private Granite conversation.

## Troubleshooting

- “Local service is offline”: run `./start-local.sh` and press **Check connection**.
- Microphone denied: allow microphone access for localhost in browser settings.
- Model unavailable: rerun `./setup-local.sh` and allow model downloads to finish.
- Muse Frontier unavailable: add `MODEL_API_KEY` to `.env`, then restart the local service.
- Slow first turn: model loading is cold; later turns should be faster.

## Later telephony phase

After the browser MVP is accepted, the same conversation pipeline can be connected to Plivo Zentrunk through a self-hosted SIP/agent layer. Telephony, public tunnels, calls, recordings, and carrier purchases are intentionally outside this milestone.
