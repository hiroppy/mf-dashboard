import { describe, expect, test } from "vitest";
import { buildSummaryBlocks } from "./slack.js";
import type { ScrapedData } from "./types.js";

function buildData(accountIssues: ScrapedData["accountIssues"]): ScrapedData {
  return {
    summary: {
      totalAssets: "10,000",
      dailyChange: "+100",
      dailyChangePercent: "+1.0%",
      monthlyChange: "+500",
      monthlyChangePercent: "+5.0%",
    },
    items: [],
    updatedAt: "2026-07-17 08:00",
    accountIssues,
  };
}

function getAccountStatusText(data: ScrapedData): string | undefined {
  const block = buildSummaryBlocks(data).find(
    (candidate) =>
      candidate.type === "section" &&
      candidate.text?.type === "mrkdwn" &&
      candidate.text.text.startsWith("•"),
  );

  return block?.type === "section" ? block.text?.text : undefined;
}

describe("buildSummaryBlocks", () => {
  test("更新中の詳細が更新中でも状態を重複表示しない", () => {
    const text = getAccountStatusText(
      buildData([{ name: "Account A", status: "updating", errorMessage: "更新中" }]),
    );

    expect(text).toBe("• Account A (更新中)");
  });

  test("エラーの詳細は状態とともに表示する", () => {
    const text = getAccountStatusText(
      buildData([{ name: "Account A", status: "error", errorMessage: "接続失敗" }]),
    );

    expect(text).toBe("• Account A (エラー: 接続失敗)");
  });
});
