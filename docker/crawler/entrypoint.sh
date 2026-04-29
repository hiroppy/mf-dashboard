#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${DB_PATH:-/app/data/moneyforward.db}"

if [ ! -f "$DB_PATH" ]; then
  echo "[init] DB not found at $DB_PATH; running initial crawl"
  if ! /app/docker/crawler/run-crawl.sh; then
    echo "[init] initial crawl failed; supercronic will retry on schedule" >&2
  fi
fi

echo "[init] starting supercronic (TZ=${TZ:-unset})"
exec supercronic /app/docker/crawler/crontab
