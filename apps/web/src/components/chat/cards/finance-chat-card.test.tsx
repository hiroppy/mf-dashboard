import type { FinanceChatCard as FinanceChatCardData } from "@mf-dashboard/analytics/chat/cards";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinanceChatCard } from "./finance-chat-card";

describe("FinanceChatCard", () => {
  it.each<FinanceChatCardData>([
    {
      type: "summary",
      title: "収支サマリー",
      href: "/cf/2026-07",
      metrics: [{ label: "収支", amount: 1000, amountType: "balance" }],
    },
    {
      type: "transactionList",
      title: "取引一覧",
      transactions: [
        {
          id: "transaction-a",
          date: "2026-07-01",
          description: "店舗 A",
          amount: -1000,
          amountType: "expense",
        },
      ],
    },
    {
      type: "categoryBreakdown",
      title: "カテゴリ内訳",
      categories: [{ name: "食費", amount: -1000, amountType: "expense", percentage: 50 }],
    },
    { type: "insight", title: "インサイト", description: "前月より改善しました" },
    {
      type: "action",
      title: "アクション",
      description: "詳細を確認できます",
      action: { label: "確認する", href: "/insights" },
    },
  ])("renders the $type card", (card) => {
    render(<FinanceChatCard card={card} />);
    expect(screen.getByText(card.title)).not.toBeNull();
  });

  it("uses semantic monetary colors and an allowed internal link", () => {
    render(
      <FinanceChatCard
        card={{
          type: "summary",
          title: "収支",
          href: "/group-a/cf/2026-07",
          metrics: [
            { label: "収入", amount: 2000, amountType: "income" },
            { label: "支出", amount: -1500, amountType: "expense" },
            { label: "差額", amount: 500, amountType: "balance" },
          ],
        }}
      />,
    );

    expect(screen.getByText("2,000円").classList.contains("text-income")).toBe(true);
    expect(screen.getByText("-1,500円").classList.contains("text-expense")).toBe(true);
    expect(screen.getByText("500円").classList.contains("text-balance-positive")).toBe(true);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/group-a/cf/2026-07");
  });

  it("does not create a link for an unsafe runtime action", () => {
    const card = {
      type: "action",
      title: "不正なアクション",
      description: "外部 URL は開きません",
      action: { label: "開く", href: "https://example.com" },
    } as FinanceChatCardData;

    render(<FinanceChatCard card={card} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("開く")).not.toBeNull();
  });
});
