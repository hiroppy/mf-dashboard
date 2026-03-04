import { log, info, error } from "./logger.js";
import type { ScrapedData } from "./types.js";

const DISCORD_WEBHOOK_PREFIX = "https://discord.com/api/webhooks/";
const DISCORD_MAX_CONTENT_LENGTH = 2000;
const SECTION_DIVIDER = "────────────────";

type DiscordWebhookPayload = {
  content: string;
  avatar_url?: string;
};

function getWebhookUrl(): string | undefined {
  return process.env.DISCORD_WEBHOOK_URL;
}

function getAvatarUrl(): string | undefined {
  return process.env.DISCORD_AVATAR_URL;
}

export async function sendDiscordNotification(data: ScrapedData): Promise<void> {
  const webhookUrl = getWebhookUrl();
  const avatarUrl = getAvatarUrl();

  if (!webhookUrl) {
    log("DISCORD_WEBHOOK_URL is not set, skipping Discord notification");
    return;
  }

  if (!webhookUrl.startsWith(DISCORD_WEBHOOK_PREFIX)) {
    error(`DISCORD_WEBHOOK_URL is invalid, expected prefix: ${DISCORD_WEBHOOK_PREFIX}`);
    return;
  }

  const content = buildSummaryContent(data);
  const payloads = buildPayloads(content, avatarUrl);

  if (process.env.DRY_RUN === "true") {
    log("DRY_RUN mode: skipping Discord notification");
    log("Payloads would be:", JSON.stringify(payloads, null, 2));
    return;
  }

  await postPayloads(webhookUrl, payloads);
  info("Discord notification sent successfully!");
}

export async function sendDiscordErrorNotification(err: Error): Promise<void> {
  const webhookUrl = getWebhookUrl();
  const avatarUrl = getAvatarUrl();

  if (!webhookUrl) {
    error("DISCORD_WEBHOOK_URL is not set, cannot send error notification");
    return;
  }

  if (!webhookUrl.startsWith(DISCORD_WEBHOOK_PREFIX)) {
    error(`DISCORD_WEBHOOK_URL is invalid, expected prefix: ${DISCORD_WEBHOOK_PREFIX}`);
    return;
  }

  const now = new Date();
  const timestamp = now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const content = buildErrorContent(err.message, timestamp);
  const payloads = buildPayloads(content, avatarUrl);

  if (process.env.DRY_RUN === "true") {
    log("DRY_RUN mode: skipping Discord error notification");
    log("Payloads would be:", JSON.stringify(payloads, null, 2));
    return;
  }

  await postPayloads(webhookUrl, payloads);
  info("Discord error notification sent successfully!");
}

function buildPayloads(content: string, avatarUrl: string | undefined): DiscordWebhookPayload[] {
  const chunks = splitContentByLine(content, DISCORD_MAX_CONTENT_LENGTH);

  return chunks.map((chunk) => ({
    content: chunk,
    ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
  }));
}

async function postPayloads(webhookUrl: string, payloads: DiscordWebhookPayload[]): Promise<void> {
  for (const payload of payloads) {
    await postWebhook(webhookUrl, payload);
  }
}

async function postWebhook(webhookUrl: string, payload: DiscordWebhookPayload): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "<no body>");
    throw new Error(
      `Discord Webhook request failed with status ${response.status} ${response.statusText}: ${bodyText}`,
    );
  }
}

function buildSummaryContent(data: ScrapedData): string {
  const { summary, items, updatedAt, groupName } = data;

  const totalItem = items.find((item) => item.name === "合計");
  const dailyChange = totalItem?.change || "-";
  const filteredItems = items.filter((item) => item.name !== "合計");

  const headerText = groupName
    ? `**💰 Money Forward Me 更新レポート (${groupName})**`
    : "**💰 Money Forward Me 更新レポート**";

  const lines: string[] = [
    headerText,
    "",
    "**総資産**",
    summary.totalAssets,
    "",
    `**前日比** ${dailyChange}`,
    `**今月比** ${summary.monthlyChange} (${summary.monthlyChangePercent})`,
  ];

  if (filteredItems.length > 0) {
    lines.push("", SECTION_DIVIDER, "", "**資産内訳**");

    for (const item of filteredItems) {
      lines.push(`${item.name}: **${item.balance}** (${item.change})`);
    }
  }

  if (data.accountIssues && data.accountIssues.length > 0) {
    lines.push("", SECTION_DIVIDER, "", "**アカウント状態**");

    const issueLines = data.accountIssues.map((issue) => {
      const statusLabel = issue.status === "updating" ? "更新中" : "エラー";
      if (issue.errorMessage) {
        return `• ${issue.name} (${statusLabel}: ${issue.errorMessage})`;
      }
      return `• ${issue.name} (${statusLabel})`;
    });

    lines.push(...issueLines);
  }

  const dashboardUrl = process.env.DASHBOARD_URL;
  if (dashboardUrl) {
    lines.push(
      "",
      SECTION_DIVIDER,
      "",
      `更新日時: ${updatedAt}`,
      `ダッシュボード: ${dashboardUrl}`,
    );
  } else {
    lines.push("", SECTION_DIVIDER, "", `更新日時: ${updatedAt}`);
  }

  return lines.join("\n");
}

function buildErrorContent(message: string, timestamp: string): string {
  return [
    "**🚨 Money Forward スクレイピングエラー**",
    "",
    "```text",
    message || "Unknown error",
    "```",
    "",
    `発生日時: ${timestamp}`,
  ].join("\n");
}

function splitContentByLine(content: string, chunkSize: number): string[] {
  if (content.length <= chunkSize) {
    return [content];
  }

  const chunks: string[] = [];
  const lines = content.split("\n");
  let current = "";

  for (const line of lines) {
    if (line.length > chunkSize) {
      if (current) {
        chunks.push(current);
        current = "";
      }

      for (let i = 0; i < line.length; i += chunkSize) {
        chunks.push(line.slice(i, i + chunkSize));
      }
      continue;
    }

    if (!current) {
      current = line;
      continue;
    }

    const candidate = `${current}\n${line}`;
    if (candidate.length <= chunkSize) {
      current = candidate;
    } else {
      chunks.push(current);
      current = line;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}
