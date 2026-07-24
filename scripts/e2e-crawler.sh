#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$PROJECT_DIR/data/e2e-crawler.log"
MISE_SHIMS="$HOME/.local/share/mise/shims"

export PATH="$MISE_SHIMS:$PATH"

cd "$PROJECT_DIR"

exec > >(tee -a "$LOG_FILE") 2>&1

echo "=========================================="
echo "$(date '+%Y-%m-%d %H:%M:%S') Starting e2e-crawler"
echo "=========================================="

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

post_slack_message() {
  local text="$1"
  local payload
  local response

  if [ -z "${SLACK_BOT_TOKEN:-}" ] || [ -z "${SLACK_CHANNEL_ID:-}" ]; then
    return 0
  fi

  payload=$(jq -n \
    --arg channel "$SLACK_CHANNEL_ID" \
    --arg text "$text" \
    '{channel: $channel, text: $text}')

  if ! response=$(curl -sS -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$payload"); then
    echo "$(date '+%Y-%m-%d %H:%M:%S') Failed to send Slack notification"
    return 0
  fi

  if [[ "$response" != *'"ok":true'* ]]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') Slack API returned an error: $response"
  fi
}

build_failure_summary() {
  local run_log="$1"

  perl -pe 's/\e\[[0-9;]*[A-Za-z]//g' "$run_log" |
    awk '
      function emit(line) {
        remaining = 2500 - output_length
        if (remaining <= 0) {
          return
        }
        line = substr(line, 1, remaining)
        print line
        output_length += length(line) + 1
      }
      /^ FAIL / {
        emit($0)
        capture_error = 1
        next
      }
      capture_error && /^(AssertionError|TimeoutError|[A-Za-z]+Error:|Error:)/ {
        emit($0)
        capture_error = 0
        next
      }
      /^ Test Files / || /^      Tests / || /^   Duration / {
        emit($0)
      }
    '
}

RUN_LOG=$(mktemp "${TMPDIR:-/tmp}/mf-dashboard-e2e.XXXXXX")
trap 'rm -f "$RUN_LOG"' EXIT

if pnpm --filter @mf-dashboard/crawler test:e2e 2>&1 | tee "$RUN_LOG"; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') E2E tests passed"
  post_slack_message "Crawler E2E テストが成功しました"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') E2E tests failed"

  failure_summary=$(build_failure_summary "$RUN_LOG")
  if [ -z "$failure_summary" ]; then
    failure_summary="失敗内容を抽出できませんでした。ローカルログを確認してください。"
  fi

  post_slack_message "$(printf 'Crawler E2E テストが失敗しました\n```%s```' "$failure_summary")"

  if [ -n "${DISCORD_WEBHOOK_URL:-}" ]; then
    payload=$(jq -n --arg avatar_url "${DISCORD_AVATAR_URL:-}" '
      if ($avatar_url | length) > 0 then
        {content: "Crawler E2E テストが失敗しました", avatar_url: $avatar_url}
      else
        {content: "Crawler E2E テストが失敗しました"}
      end
    ')
    curl -sS -X POST "$DISCORD_WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "$payload"
  fi

  exit 1
fi
