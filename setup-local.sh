#!/bin/zsh
set -e
cd "${0:A:h}"

command -v brew >/dev/null 2>&1 || { echo "Homebrew is required."; exit 1; }
command -v uv >/dev/null 2>&1 || brew install uv
command -v ollama >/dev/null 2>&1 || brew install ollama

ollama serve > .ollama.log 2>&1 &
sleep 2
ollama pull qwen3:4b-instruct
(cd backend && uv sync)

echo "Setup complete. Run ./start-local.sh"
