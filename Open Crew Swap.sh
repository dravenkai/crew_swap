#!/usr/bin/env bash
cd "$(dirname "$0")"
PORT="${PORT:-43730}"
if ! curl -fsS "http://127.0.0.1:${PORT}" >/dev/null 2>&1; then
  nohup node server.cjs >/tmp/crew-swap-server.log 2>&1 &
  sleep 0.6
fi
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://127.0.0.1:${PORT}"
elif command -v open >/dev/null 2>&1; then
  open "http://127.0.0.1:${PORT}"
else
  echo "Open http://127.0.0.1:${PORT} in your browser"
fi
