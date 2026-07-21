#!/usr/bin/env bash

set -uo pipefail

(
  cd /app/apps/crawler
  exec node --import tsx src/server.ts
) &
server_pid=$!

supercronic /app/docker/crawler/crontab &
cron_pid=$!

shutdown() {
  trap - INT TERM
  kill -TERM "$server_pid" "$cron_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
  wait "$cron_pid" 2>/dev/null || true
}

trap 'shutdown; exit 130' INT
trap 'shutdown; exit 143' TERM

wait -n "$server_pid" "$cron_pid"
status=$?
shutdown
exit "$status"
