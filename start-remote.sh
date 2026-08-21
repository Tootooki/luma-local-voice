#!/bin/zsh
set -e
cd "${0:A:h}"

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

for command_name in ollama uv cloudflared; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name is not installed. Run ./setup-local.sh and install cloudflared first."
    exit 1
  fi
done

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

curl -fsS http://127.0.0.1:8787/health >/dev/null 2>&1 || {
  echo "The local voice backend did not start. Check .backend.log"
  exit 1
}

frontend_pid=""
if ! curl -fsS http://localhost:3000/api/health >/dev/null 2>&1; then
  npm run build
  npm run start > .frontend.log 2>&1 &
  frontend_pid=$!
  for attempt in {1..30}; do
    curl -fsS http://localhost:3000/api/health >/dev/null 2>&1 && break
    sleep 1
  done
fi

cleanup() {
  [[ -n "$frontend_pid" ]] && kill "$frontend_pid" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

curl -fsS http://localhost:3000/api/health >/dev/null 2>&1 || {
  echo "The Luma production interface did not start. Check .frontend.log"
  exit 1
}

if [[ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]]; then
  cloudflared tunnel run --token "$CLOUDFLARE_TUNNEL_TOKEN"
else
  cloudflared tunnel --url http://localhost:3000 --no-autoupdate
fi
