#!/usr/bin/env bash
set -euo pipefail
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 &
python_pid=$!
node gateway/dist/main.js &
node_pid=$!
shutdown() {
  kill -TERM "$python_pid" "$node_pid" 2>/dev/null || true
  wait "$python_pid" "$node_pid" 2>/dev/null || true
}
trap shutdown TERM INT EXIT
wait -n "$python_pid" "$node_pid"
