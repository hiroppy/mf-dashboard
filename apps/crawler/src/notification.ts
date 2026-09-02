import type { Group } from "@mf-dashboard/db/types";
import { formatUpdatedAt } from "./data-builder.js";
import { sendDiscordNotification, sendDiscordErrorNotification } from "./discord.js";
import { error, warn } from "./logger.js";
import type { GroupData } from "./scraper.js";
import { sendErrorNotification } from "./slack.js";
import type { ScrapedData } from "./types.js";

export function selectNotificationGroup(
  groupDataList: GroupData[],
  defaultGroup: Group | null,
): GroupData | undefined {
  return (
    groupDataList.find((groupData) => groupData.group.id === defaultGroup?.id) ?? groupDataList[0]
  );
}

export function buildNotificationPayload(groupData: GroupData, now = new Date()): ScrapedData {
  const accountIssues = groupData.registeredAccounts.accounts
    .filter((account) => account.status === "updating" || account.status === "error")
    .map((account) => ({
      name: account.name,
      status: account.status as "updating" | "error",
      errorMessage: account.errorMessage,
    }));

  return {
    summary: groupData.summary,
    items: groupData.items,
    updatedAt: formatUpdatedAt(now),
    groupName: groupData.group.name,
    accountIssues,
  };
}

export async function sendSuccessNotifications(
  groupDataList: GroupData[],
  defaultGroup: Group | null,
) {
  const notifyGroupData = selectNotificationGroup(groupDataList, defaultGroup);

  if (!notifyGroupData) {
    warn("No data available for notification");
    return;
  }

  await sendDiscordNotification(buildNotificationPayload(notifyGroupData));
}

export async function sendFailureNotifications(err: Error) {
  const results = await Promise.allSettled([
    sendErrorNotification(err),
    sendDiscordErrorNotification(err),
  ]);

  logNotificationFailures(results, "Failed to send error notification:");
}

function logNotificationFailures(results: PromiseSettledResult<void>[], message: string) {
  for (const result of results) {
    if (result.status === "rejected") {
      error(message, result.reason);
    }
  }
}
