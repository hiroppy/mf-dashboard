import { describe, expect, it } from "vitest";
import { createFinancePresentationTool, financePresentationInputSchema } from "./presentation-tool";

describe("createFinancePresentationTool", () => {
  it("returns validated cards unchanged", async () => {
    const tool = createFinancePresentationTool();
    const cards = [
      {
        type: "summary" as const,
        title: "今月の収支",
        metrics: [{ label: "収支", amount: 12_000, amountType: "balance" as const }],
      },
    ];

    await expect(tool.execute!({ cards }, {} as never)).resolves.toEqual(cards);
  });

  it("requires at least one card and limits empty-state prompts", () => {
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
});
