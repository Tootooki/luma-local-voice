#!/bin/zsh
set -e
cd "${0:A:h}"

command -v brew >/dev/null 2>&1 || { echo "Homebrew is required."; exit 1; }
command -v uv >/dev/null 2>&1 || brew install uv
command -v ollama >/dev/null 2>&1 || brew install ollama

if ! curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 ollama serve > .ollama.log 2>&1 &
  for attempt in {1..30}; do
    curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break
    sleep 1
  done
fi

curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1 || { echo "Ollama did not start."; exit 1; }
ollama pull granite4.1:3b
(cd backend && uv sync)
(cd backend && uv run python warmup.py)

echo "Setup complete. Run ./start-local.sh"
