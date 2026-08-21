#!/bin/zsh
set -e
cd "${0:A:h}"

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

if ! command -v ollama >/dev/null 2>&1; then
  echo "Ollama is not installed. Run ./setup-local.sh first."
  exit 1
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is not installed. Run ./setup-local.sh first."
  exit 1
fi

if ! curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 ollama serve > .ollama.log 2>&1 &
  for attempt in {1..30}; do
    curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break
    sleep 1
  done
fi

if ! curl -fsS http://127.0.0.1:8787/health >/dev/null 2>&1; then
  (cd backend && uv run uvicorn main:app --host 127.0.0.1 --port 8787) > .backend.log 2>&1 &
  for attempt in {1..30}; do
    curl -fsS http://127.0.0.1:8787/health >/dev/null 2>&1 && break
    sleep 1
  done
fi

curl -fsS http://127.0.0.1:8787/health >/dev/null 2>&1 || { echo "The local voice backend did not start. Check .backend.log"; exit 1; }
npm run dev
