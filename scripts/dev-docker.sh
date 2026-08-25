#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FRONTEND_PORT="${FRONTEND_PORT:-13137}"
BACKEND_PORT="${BACKEND_PORT:-18137}"
REDIS_PORT="${REDIS_PORT:-16379}"

cd "$ROOT_DIR"

BACKEND_PORT="$BACKEND_PORT" \
REDIS_PORT="$REDIS_PORT" \
FRONTEND_PORT="$FRONTEND_PORT" \
  docker compose up -d --build redis backend worker

cat <<EOF
Backend stack (Docker):
  Backend:  http://127.0.0.1:${BACKEND_PORT}/api/health
  Redis:    redis://localhost:${REDIS_PORT}/0
  Logs:     docker compose logs -f backend worker

Starting frontend (lokal, Hot-Reload)...
EOF

cd "$ROOT_DIR/frontend"
NEXT_PUBLIC_API_BASE_URL="http://127.0.0.1:${BACKEND_PORT}" \
NEXT_PUBLIC_WS_BASE_URL="ws://127.0.0.1:${BACKEND_PORT}" \
  npm run dev -- --hostname 127.0.0.1 --port "$FRONTEND_PORT"
