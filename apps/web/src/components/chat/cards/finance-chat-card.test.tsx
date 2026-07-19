import type { FinanceChatCard as FinanceChatCardData } from "@mf-dashboard/analytics/chat/cards";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
    {
      type: "chart",
      title: "収支推移",
      chartType: "bar",
      series: [{ name: "支出", amountType: "expense" }],
      data: [{ label: "7月", values: [219894] }],
    },
    { type: "insight", title: "インサイト", description: "前月より改善しました" },
    {
      type: "action",
      title: "アクション",
      description: "詳細を確認できます",
      action: { label: "確認する", href: "/insights" },
    },
    {
      type: "empty",
      title: "支出が見つかりません",
      description: "期間を変えて確認してください",
      prompts: ["今月の支出を見たい"],
    },
  ])("renders the $type card", (card) => {
    render(<FinanceChatCard card={card} />);
    expect(screen.getByText(card.title)).not.toBeNull();
  });

  it("submits an alternative prompt from the empty state", () => {
    const onPromptSelect = vi.fn<(prompt: string) => void>();
    render(
      <FinanceChatCard
        allowedHrefs={["/group-a/cf/2026-07"]}
        card={{
          type: "empty",
          title: "見つかりません",
          description: "別の条件をお試しください",
          prompts: ["先月の支出を見たい"],
        }}
        onPromptSelect={onPromptSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "先月の支出を見たい" }));
    expect(onPromptSelect).toHaveBeenCalledWith("先月の支出を見たい");
  });

  it("uses semantic monetary colors and an allowed internal link", () => {
    render(
      <FinanceChatCard
        allowedHrefs={["/group-a/cf/2026-07"]}
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

  it("labels an insight amount and aligns it with the action", () => {
    render(
      <FinanceChatCard
        allowedHrefs={["/group-a/cf/2026-07"]}
        card={{
          type: "insight",
          title: "削減可能な支出の提案",
          description: "今月の特別な支出を、過去3か月の平均と比較しています。",
          amount: 199057,
          amountLabel: "見直し候補額",
          amountType: "balance",
          action: { label: "内訳を確認", href: "/group-a/cf/2026-07" },
        }}
      />,
    );

    expect(screen.getByText("見直し候補額")).not.toBeNull();
    expect(screen.getByText("199,057円").classList.contains("text-balance-positive")).toBe(true);
    expect(screen.getByRole("link", { name: /内訳を確認/ }).getAttribute("href")).toBe(
      "/group-a/cf/2026-07",
    );
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
    expect(screen.getByText("開く").classList.contains("text-muted-foreground")).toBe(true);
  });

  it("does not create a link for an unverified safe finance route", () => {
    render(
      <FinanceChatCard
        allowedHrefs={["/group-a/cf/2026-07"]}
        card={{
          type: "action",
          title: "別グループ",
          description: "未検証の遷移先",
          action: { label: "開く", href: "/group-b/cf/2026-07" },
        }}
      />,
    );

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("開く").classList.contains("text-muted-foreground")).toBe(true);
  });

  it("renders a visible legend for pie chart categories", () => {
    render(
      <FinanceChatCard
        card={{
          type: "chart",
          title: "支出内訳",
          chartType: "pie",
          series: [{ name: "支出", amountType: "expense" }],
          data: [
            { label: "食費", values: [3000] },
            { label: "日用品", values: [2000] },
          ],
        }}
      />,
    );

    const legend = screen.getByRole("list", { name: "支出内訳の凡例" });
    expect(legend.textContent).toContain("食費");
    expect(legend.textContent).toContain("日用品");
  });
});
