#!/bin/zsh
set -e
cd "${0:A:h}"

if ! command -v ollama >/dev/null 2>&1; then
  echo "Ollama is not installed. Run ./setup-local.sh first."
  exit 1
fi

if ! curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  ollama serve > .ollama.log 2>&1 &
fi

(cd backend && uv run uvicorn main:app --host 127.0.0.1 --port 8787) > .backend.log 2>&1 &
npm run dev
