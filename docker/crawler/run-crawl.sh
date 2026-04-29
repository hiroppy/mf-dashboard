#!/usr/bin/env bash
set -euo pipefail

cd /app

WEB_URL="${WEB_URL:-http://web:8765}"
REFRESH_URL="${WEB_URL}/api/refresh"
REFRESH_MAX_ATTEMPTS="${REFRESH_MAX_ATTEMPTS:-12}"
REFRESH_RETRY_DELAY="${REFRESH_RETRY_DELAY:-5}"

echo "[crawl] starting at $(date -Iseconds)"
pnpm --filter @mf-dashboard/crawler start

attempt=1
while [ "$attempt" -le "$REFRESH_MAX_ATTEMPTS" ]; do
  echo "[crawl] notifying ${REFRESH_URL} (attempt ${attempt}/${REFRESH_MAX_ATTEMPTS})"
  if curl -fsS --max-time 10 -X POST "${REFRESH_URL}" -o /dev/null; then
    echo "[crawl] refresh acknowledged at $(date -Iseconds)"
    exit 0
  fi
  echo "[crawl] refresh attempt ${attempt} failed; retrying in ${REFRESH_RETRY_DELAY}s" >&2
  sleep "${REFRESH_RETRY_DELAY}"
  attempt=$((attempt + 1))
done

echo "[crawl] gave up after ${REFRESH_MAX_ATTEMPTS} attempts; web cache is stale" >&2
exit 1
