import { describe, expect, it } from "vitest";
import {
  createFinancePresentationInputSchema,
  createFinancePresentationTool,
} from "./presentation-tool";

describe("createFinancePresentationTool", () => {
  it("returns validated cards unchanged", async () => {
    const tool = createFinancePresentationTool("group-a");
    const cards = [
      {
        type: "summary" as const,
        title: "今月の収支",
        metrics: [{ label: "収支", amount: 12_000, amountType: "balance" as const }],
        href: "/group-a/cf/2026-07",
      },
    ];

    await expect(tool.execute!({ cards }, {} as never)).resolves.toEqual(cards);
  });

  it("requires at least one card and limits empty-state prompts", () => {
    const financePresentationInputSchema = createFinancePresentationInputSchema("group-a");

    expect(financePresentationInputSchema.safeParse({ cards: [] }).success).toBe(false);
    expect(
      financePresentationInputSchema.safeParse({
        cards: [
          {
            type: "empty",
            title: "見つかりません",
            description: "条件を変えてください",
            prompts: ["候補1", "候補2", "候補3", "候補4"],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires empty cards to be exclusive and non-empty responses to include a CTA", () => {
    const schema = createFinancePresentationInputSchema("group-a");
    const summary = {
      type: "summary" as const,
      title: "今月の収支",
      metrics: [{ label: "収支", amount: 12_000, amountType: "balance" as const }],
    };
    const empty = {
      type: "empty" as const,
      title: "見つかりません",
      description: "条件を変えてください",
      prompts: ["今月の支出は？"],
    };

    expect(schema.safeParse({ cards: [empty] }).success).toBe(true);
    expect(schema.safeParse({ cards: [empty, summary] }).success).toBe(false);
    expect(schema.safeParse({ cards: [summary] }).success).toBe(false);
  });

  it("rejects CTA routes outside the current group", () => {
    const schema = createFinancePresentationInputSchema("group-a");
    const card = {
      type: "action" as const,
      title: "詳細を確認",
      description: "収支ページで確認できます",
      action: { label: "収支を見る", href: "/group-b/cf/2026-07" },
    };

    expect(schema.safeParse({ cards: [card] }).success).toBe(false);
    expect(
      schema.safeParse({
        cards: [{ ...card, action: { ...card.action, href: "/group-a/cf/2026-07" } }],
      }).success,
    ).toBe(true);
  });

  it("requires CTA routes to come from the navigation tool when an allowlist is provided", () => {
    const allowedHrefs = new Set(["/group-a/cf/2026-07"]);
    const schema = createFinancePresentationInputSchema("group-a", allowedHrefs);
    const card = {
      type: "action" as const,
      title: "詳細を確認",
      description: "収支ページで確認できます",
      action: { label: "収支を見る", href: "/group-a/cf/2026-07" },
    };

    expect(schema.safeParse({ cards: [card] }).success).toBe(true);
    expect(
      schema.safeParse({
        cards: [{ ...card, action: { ...card.action, href: "/group-a/insights" } }],
      }).success,
    ).toBe(false);
  });
});
