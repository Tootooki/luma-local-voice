# Luma Local Voice Assistant

Luma has two editions. The Apple Silicon app uses Granite, Whisper, and Kokoro locally on the Mac. The GitHub Pages edition uses a smaller WebLLM model directly in the visitor's browser so it works from another computer without reaching the Mac.

Browser edition: https://tootooki.github.io/luma-local-voice/ — load the model once, then speak or type. The model is cached by the browser for later visits.

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

The hosted edition needs no Luma backend. It downloads SmolLM2 360M through WebLLM and runs generation with WebGPU on the computer opening the page. Chrome or Edge is recommended. Typed conversations stay in the browser; voice recognition and speech playback use the browser's built-in voice services and may follow that browser vendor's processing rules.

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
