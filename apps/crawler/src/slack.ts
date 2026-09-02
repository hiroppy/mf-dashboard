import { formatJstDateTimeForDisplay } from "@mf-dashboard/date-utils";
import type { KnownBlock } from "@slack/web-api";
import { WebClient } from "@slack/web-api";
import { log, error } from "./logger.js";

let client: WebClient | null = null;

function getClient(): WebClient | null {
  if (!client) {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) return null;
    client = new WebClient(token);
  }
  return client;
}

function getChannelId(): string | undefined {
  return process.env.SLACK_CHANNEL_ID;
}

export async function sendErrorNotification(err: Error): Promise<void> {
  const slack = getClient();
  const channelId = getChannelId();

  if (!slack || !channelId) {
    error("SLACK_BOT_TOKEN or SLACK_CHANNEL_ID is not set, cannot send error notification");
    return;
  }

  if (process.env.DRY_RUN === "true") {
    log("DRY_RUN mode: skipping error notification");
    return;
  }

  const timestamp = formatJstDateTimeForDisplay();

  await slack.chat.postMessage({
    channel: channelId,
    text: `⚠️ Money Forward 更新エラー: ${err.message}`,
    blocks: buildErrorBlocks(err.message, timestamp),
  });
}

function buildErrorBlocks(message: string, timestamp: string): KnownBlock[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "🚨 Money Forward スクレイピングエラー",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `\`\`\`${message}\`\`\``,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `発生日時: ${timestamp}`,
        },
      ],
    },
  ];
}
