#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FRONTEND_PORT="${FRONTEND_PORT:-13137}"
BACKEND_PORT="${BACKEND_PORT:-18137}"
REDIS_PORT="${REDIS_PORT:-16379}"
APP_DATA_DIR="${APP_DATA_DIR:-data/dev}"
REDIS_URL="${REDIS_URL:-redis://localhost:${REDIS_PORT}/0}"
APP_ANALYSIS_FRAME_STRIDE="${APP_ANALYSIS_FRAME_STRIDE:-30}"
APP_ANALYSIS_MAX_FRAMES="${APP_ANALYSIS_MAX_FRAMES:-0}"
APP_JOB_TIMEOUT_SECONDS="${APP_JOB_TIMEOUT_SECONDS:-7200}"

cd "$ROOT_DIR"

REDIS_PORT="$REDIS_PORT" docker compose up -d redis

APP_QUEUE_MODE=rq \
APP_DATA_DIR="$APP_DATA_DIR" \
REDIS_URL="$REDIS_URL" \
APP_ANALYSIS_FRAME_STRIDE="$APP_ANALYSIS_FRAME_STRIDE" \
APP_ANALYSIS_MAX_FRAMES="$APP_ANALYSIS_MAX_FRAMES" \
APP_JOB_TIMEOUT_SECONDS="$APP_JOB_TIMEOUT_SECONDS" \
APP_ALLOWED_ORIGINS="http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT}" \
"$ROOT_DIR/.venv/bin/python" -m uvicorn app.main:app \
  --app-dir backend \
  --host 127.0.0.1 \
  --port "$BACKEND_PORT" &
BACKEND_PID=$!

PYTHONPATH=backend \
APP_QUEUE_MODE=rq \
APP_DATA_DIR="$APP_DATA_DIR" \
REDIS_URL="$REDIS_URL" \
APP_ANALYSIS_FRAME_STRIDE="$APP_ANALYSIS_FRAME_STRIDE" \
APP_ANALYSIS_MAX_FRAMES="$APP_ANALYSIS_MAX_FRAMES" \
APP_JOB_TIMEOUT_SECONDS="$APP_JOB_TIMEOUT_SECONDS" \
"$ROOT_DIR/.venv/bin/python" -m app.worker &
WORKER_PID=$!

(
  cd "$ROOT_DIR/frontend"
  NEXT_PUBLIC_API_BASE_URL="http://127.0.0.1:${BACKEND_PORT}" \
  NEXT_PUBLIC_WS_BASE_URL="ws://127.0.0.1:${BACKEND_PORT}" \
  npm run dev -- --hostname 127.0.0.1 --port "$FRONTEND_PORT"
) &
FRONTEND_PID=$!

cat <<EOF
Started Sewer Inspection AI stack:
  Frontend: http://127.0.0.1:${FRONTEND_PORT}
  Backend:  http://127.0.0.1:${BACKEND_PORT}/api/health
  Redis:    redis://localhost:${REDIS_PORT}/0
  Analysis: every ${APP_ANALYSIS_FRAME_STRIDE} frame(s), max_frames=${APP_ANALYSIS_MAX_FRAMES}
  Job timeout: ${APP_JOB_TIMEOUT_SECONDS}s

PIDs:
  Backend:  ${BACKEND_PID}
  Worker:   ${WORKER_PID}
  Frontend: ${FRONTEND_PID}

Press Ctrl+C to stop app processes, then run:
  bash scripts/stop-dev-local.sh
EOF

trap 'kill "$BACKEND_PID" "$WORKER_PID" "$FRONTEND_PID" 2>/dev/null || true' INT TERM EXIT
wait
