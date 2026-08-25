#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for port in "${FRONTEND_PORT:-13137}" "${BACKEND_PORT:-18137}"; do
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN -n -P 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    kill $pids 2>/dev/null || true
  fi
done

worker_pids="$(pgrep -f 'app.worker' 2>/dev/null || true)"
if [[ -n "$worker_pids" ]]; then
  kill $worker_pids 2>/dev/null || true
fi

cd "$ROOT_DIR"
docker compose down
