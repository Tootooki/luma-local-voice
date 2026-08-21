# Luma Local Voice Assistant

Luma is a private push-to-talk assistant for Apple Silicon Macs. Microphone audio, transcription, language generation, and speech synthesis stay on the machine.

Hosted interface (requires the local service): https://tootooki.github.io/luma-local-voice/

## Stack

- IBM Granite 4.1 3B through Ollama
- Whisper Small English Q4 through MLX Whisper
- Kokoro 82M bf16 through MLX-Audio
- FastAPI backend on `127.0.0.1:8787`
- Browser interface on `http://localhost:3000`

## Setup and launch

Make sure at least 8–12 GB of disk space is free. Then run `chmod +x setup-local.sh start-local.sh`, `./setup-local.sh`, and finally `./start-local.sh`. Setup downloads and verifies all three local models, so the first conversation is not also an installation step.

Open `http://localhost:3000`, allow microphone access, press **Start conversation**, speak, and press **Finish speaking**.

## Privacy boundary

The app binds to loopback and uses no cloud AI API. Temporary turn audio is deleted after each response. Ollama is never exposed publicly. The browser frontend allows requests only to the local backend.

## Troubleshooting

- “Local service is offline”: run `./start-local.sh` and press **Check connection**.
- Microphone denied: allow microphone access for localhost in browser settings.
- Model unavailable: rerun `./setup-local.sh` and allow model downloads to finish.
- Slow first turn: model loading is cold; later turns should be faster.

## Later telephony phase

After the browser MVP is accepted, the same conversation pipeline can be connected to Plivo Zentrunk through a self-hosted SIP/agent layer. Telephony, public tunnels, calls, recordings, and carrier purchases are intentionally outside this milestone.
