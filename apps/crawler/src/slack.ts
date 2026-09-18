import { formatJstDateTimeForDisplay } from "@mf-dashboard/date-utils";
import type { KnownBlock } from "@slack/web-api";
import { WebClient } from "@slack/web-api";
import { getDashboardUrl } from "./dashboard-url.js";
import { log, info, error } from "./logger.js";
import type { ScrapedData } from "./types.js";

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

export async function sendSlackNotification(data: ScrapedData): Promise<void> {
  const slack = getClient();
  const channelId = getChannelId();

  if (!slack || !channelId) {
    log("SLACK_BOT_TOKEN or SLACK_CHANNEL_ID is not set, skipping Slack notification");
    return;
  }

  if (process.env.DRY_RUN === "true") {
    log("DRY_RUN mode: skipping Slack notification");
    log("Blocks would be:", JSON.stringify(buildSummaryBlocks(data), null, 2));
    return;
  }

  const groupLabel = data.groupName ? ` (${data.groupName})` : "";
  await slack.chat.postMessage({
    channel: channelId,
    text: `💰 Money Forward 更新完了${groupLabel} — 総資産: ${data.summary.totalAssets}`,
    blocks: buildSummaryBlocks(data),
  });

  info("Slack notification sent successfully!");
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

export function buildSummaryBlocks(data: ScrapedData): KnownBlock[] {
  const { summary, items, updatedAt, groupName } = data;

  // Extract "合計" from items to get daily change
  const totalItem = items.find((item) => item.name === "合計");
  const dailyChange = totalItem?.change || "-";
  const filteredItems = items.filter((item) => item.name !== "合計");

  const headerText = groupName
    ? `💰 Money Forward Me 更新レポート (${groupName})`
    : "💰 Money Forward Me 更新レポート";

  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: headerText,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*総資産*\n${summary.totalAssets}`,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*前日比*\n${dailyChange}`,
        },
        {
          type: "mrkdwn",
          text: `*今月比*\n${summary.monthlyChange} (${summary.monthlyChangePercent})`,
        },
      ],
    },
  ];

  if (filteredItems.length > 0) {
    blocks.push({ type: "divider" });

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*資産内訳*",
      },
    });

    const lines = filteredItems.map((item) => `${item.name}:  *${item.balance}*  (${item.change})`);

    // Block Kit の section text は 3000文字制限があるため分割
    const chunkSize = 10;
    for (let i = 0; i < lines.length; i += chunkSize) {
      const chunk = lines.slice(i, i + chunkSize);
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: chunk.join("\n"),
        },
      });
    }
  }

  if (data.accountIssues && data.accountIssues.length > 0) {
    blocks.push({ type: "divider" });

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*アカウント状態*",
      },
    });

    const lines = data.accountIssues.map((issue) => {
      const statusLabel = issue.status === "updating" ? "更新中" : "エラー";
      if (issue.status === "error" && issue.errorMessage) {
        return `• ${issue.name} (${statusLabel}: ${issue.errorMessage})`;
      }
      return `• ${issue.name} (${statusLabel})`;
    });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: lines.join("\n"),
      },
    });
  }

  const dashboardUrl = getDashboardUrl();
  const contextText = dashboardUrl
    ? `更新日時: ${updatedAt}  |  <${dashboardUrl}|📈 ダッシュボードを開く>`
    : `更新日時: ${updatedAt}`;

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: contextText,
      },
    ],
  });

  return blocks;
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
