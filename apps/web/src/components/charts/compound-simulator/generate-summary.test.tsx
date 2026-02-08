import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { generateSummary, type SummaryInput } from "./generate-summary";

const baseInput: SummaryInput = {
  initialAmount: 3_500_000,
  monthlyContribution: 50_000,
  annualReturnRate: 5,
  contributionYears: 20,
  withdrawalStartYear: 20,
  withdrawalYears: 0,
  finalTotal: 18_500_000,
  finalPrincipal: 15_500_000,
  finalInterest: 3_000_000,
};

function renderText(input: SummaryInput) {
  const { container } = render(<div>{generateSummary(input)}</div>);
  return container.textContent ?? "";
}

describe("generateSummary", () => {
  test("generates full summary with all fields", () => {
    const text = renderText(baseInput);
    expect(text).toContain("350万円をスタートに");
    expect(text).toContain("毎月5万円を年利5%で積み立てた場合");
    expect(text).toContain("20年後には税引後で約1,850万円になる見込み");
    expect(text).toContain("約300万円が税引後の運用益");
    expect(text).toContain("約19%の利益");
  });

  test("renders total amount in bold", () => {
    const { container } = render(<div>{generateSummary(baseInput)}</div>);
    const strong = container.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toContain("1,850万円");
  });

  test("omits initial amount when zero", () => {
    const text = renderText({ ...baseInput, initialAmount: 0 });
    expect(text).not.toContain("スタートに");
    expect(text).toContain("毎月5万円");
  });

  test("omits monthly contribution when zero", () => {
    const text = renderText({ ...baseInput, monthlyContribution: 0 });
    expect(text).not.toContain("毎月");
    expect(text).toContain("年利5%で運用した場合");
  });

  test("handles large amounts with oku format", () => {
    const text = renderText({
      ...baseInput,
      finalTotal: 150_000_000,
      finalInterest: 100_000_000,
    });
    expect(text).toContain("税引後で約1.5億円になる見込み");
  });

  test("omits interest breakdown when interest is zero", () => {
    const text = renderText({
      ...baseInput,
      finalInterest: 0,
    });
    expect(text).not.toContain("運用益");
  });

  describe("withdrawal summary", () => {
    test("generates withdrawal summary with low depletion risk", () => {
      const text = renderText({
        ...baseInput,
        withdrawalYears: 25,
        monthlyWithdrawal: 150_000,
        drawdownFinalTotal: 5_000_000,
        depletionProbability: 0.02,
      });
      expect(text).toContain("毎月手取り15万円ずつ25年間取り崩した場合");
      expect(text).toContain("約500万円（税引後）が残る見込み");
      expect(text).toContain("枯渇リスクは約2.0%と低水準");
    });

    test("generates withdrawal summary with moderate depletion risk", () => {
      const text = renderText({
        ...baseInput,
        withdrawalYears: 25,
        monthlyWithdrawal: 150_000,
        drawdownFinalTotal: 5_000_000,
        depletionProbability: 0.123,
      });
      expect(text).toContain("約500万円（税引後）が残る見込み");
      expect(text).toContain("約12.3%の確率で枯渇するリスク");
    });

    test("generates withdrawal summary with high depletion risk and withdrawal rate", () => {
      const text = renderText({
        ...baseInput,
        withdrawalYears: 25,
        monthlyWithdrawal: 150_000,
        drawdownFinalTotal: 3_000_000,
        depletionProbability: 0.39,
      });
      expect(text).toContain("中央値では約300万円（税引後）が残る見込みですが");
      expect(text).toContain("約39.0%の確率で資金が枯渇するリスク");
      expect(text).toContain("年間引出率は");
      expect(text).toContain("税引後の実効利回り");
    });

    test("shows depletion message with withdrawal rate explanation", () => {
      const text = renderText({
        ...baseInput,
        withdrawalYears: 30,
        monthlyWithdrawal: 300_000,
        drawdownFinalTotal: 0,
        depletionProbability: 0.85,
      });
      expect(text).toContain("約85.0%の確率で資金が枯渇する見込みです");
      expect(text).toContain("年間引出率は");
      expect(text).toContain("税引後の実効利回り");
      expect(text).toContain("元本が");
    });

    test("generates withdrawal summary with zero depletion risk", () => {
      const text = renderText({
        ...baseInput,
        withdrawalYears: 10,
        monthlyWithdrawal: 50_000,
        drawdownFinalTotal: 10_000_000,
        depletionProbability: 0,
      });
      expect(text).toContain("約1,000万円（税引後）が残る見込み");
      expect(text).not.toContain("枯渇");
    });

    test("does not show withdrawal summary when withdrawalYears is 0", () => {
      const text = renderText({
        ...baseInput,
        withdrawalYears: 0,
        monthlyWithdrawal: 150_000,
        drawdownFinalTotal: 5_000_000,
        depletionProbability: 0.1,
      });
      expect(text).not.toContain("取り崩し");
      expect(text).not.toContain("枯渇");
    });
  });

  describe("expense ratio", () => {
    test("includes expense ratio in return description", () => {
      const text = renderText({ ...baseInput, expenseRatio: 0.5 });
      expect(text).toContain("信託報酬0.5%控除後");
    });

    test("does not mention expense ratio when zero", () => {
      const text = renderText({ ...baseInput, expenseRatio: 0 });
      expect(text).not.toContain("信託報酬");
    });
  });

  describe("rate-based withdrawal summary", () => {
    test("generates rate mode summary text with effective rate", () => {
      const text = renderText({
        ...baseInput,
        withdrawalYears: 25,
        withdrawalMode: "rate",
        withdrawalRate: 4,
        monthlyWithdrawal: 50_000,
        drawdownFinalTotal: 5_000_000,
        depletionProbability: 0.02,
      });
      expect(text).toContain("開始時の資産から年4%を25年間取り崩した場合");
      expect(text).toContain("初年度は手取り年額約60万円");
      expect(text).toContain("実質引出率は約");
      expect(text).toContain("以降インフレ率に応じて増額します");
    });

    test("generates rate mode summary text without effective rate when taxFree", () => {
      const text = renderText({
        ...baseInput,
        withdrawalYears: 25,
        withdrawalMode: "rate",
        withdrawalRate: 4,
        monthlyWithdrawal: 50_000,
        drawdownFinalTotal: 5_000_000,
        depletionProbability: 0.02,
        taxFree: true,
      });
      expect(text).toContain("初年度は年額約60万円");
      expect(text).toContain("以降インフレ率に応じて増額します");
      expect(text).not.toContain("実質引出率");
    });

    test("generates rate mode summary with overlap", () => {
      const text = renderText({
        ...baseInput,
        contributionYears: 20,
        withdrawalStartYear: 10,
        withdrawalYears: 20,
        withdrawalMode: "rate",
        withdrawalRate: 4,
        monthlyWithdrawal: 50_000,
        drawdownFinalTotal: 5_000_000,
        depletionProbability: 0.05,
      });
      expect(text).toContain("積み立てながら");
      expect(text).toContain("年目から");
      expect(text).toContain("年4%");
    });

    test("generates rate mode with gap period", () => {
      const text = renderText({
        ...baseInput,
        contributionYears: 10,
        withdrawalStartYear: 15,
        withdrawalYears: 20,
        withdrawalMode: "rate",
        withdrawalRate: 4,
        drawdownFinalTotal: 5_000_000,
        depletionProbability: 0.05,
      });
      expect(text).toContain("10年間積み立て、さらに5年間運用を続けた場合");
      expect(text).toContain("開始時の資産から年4%を");
    });
  });

  test("handles summaryYear=0 and initialAmount=0", () => {
    const text = renderText({
      ...baseInput,
      initialAmount: 0,
      monthlyContribution: 0,
      contributionYears: 0,
      withdrawalStartYear: 0,
      withdrawalYears: 10,
      finalTotal: 0,
      finalPrincipal: 0,
      finalInterest: 0,
      monthlyWithdrawal: 100_000,
      drawdownFinalTotal: 0,
      depletionProbability: 1.0,
    });
    expect(text).toContain("初期資産");
    expect(text).toContain("運用を開始");
  });

  describe("summary year (BUG-1 fix)", () => {
    test("shows summaryYear instead of contributionYears when idle period exists", () => {
      const text = renderText({
        ...baseInput,
        contributionYears: 20,
        withdrawalStartYear: 30,
        withdrawalYears: 25,
        finalTotal: 30_000_000,
        monthlyWithdrawal: 100_000,
        drawdownFinalTotal: 5_000_000,
        depletionProbability: 0.05,
      });
      // Should say "30年後" (summaryYear), not "20年後" (contributionYears)
      expect(text).toContain("30年後には");
      expect(text).not.toContain("20年後には");
    });

    test("shows contributionYears when no withdrawal", () => {
      const text = renderText({
        ...baseInput,
        contributionYears: 20,
        withdrawalStartYear: 20,
        withdrawalYears: 0,
      });
      expect(text).toContain("20年後には");
    });
  });

  describe("currentAge", () => {
    test("shows age-based label when currentAge is provided", () => {
      const text = renderText({
        ...baseInput,
        currentAge: 30,
      });
      expect(text).toContain("50歳時点（20年後）には");
    });

    test("does not show age label when currentAge is undefined", () => {
      const text = renderText(baseInput);
      expect(text).toContain("20年後には");
      expect(text).not.toContain("歳時点");
    });
  });

  describe("new timeline patterns", () => {
    test("generates gap (idle) period summary", () => {
      const text = renderText({
        ...baseInput,
        contributionYears: 10,
        withdrawalStartYear: 15,
        withdrawalYears: 20,
        monthlyWithdrawal: 100_000,
        drawdownFinalTotal: 5_000_000,
        depletionProbability: 0.05,
      });
      expect(text).toContain("10年間積み立て、さらに5年間運用を続けた場合");
      expect(text).toContain("毎月手取り10万円ずつ20年間取り崩した場合");
    });

    test("generates overlap period summary", () => {
      const text = renderText({
        ...baseInput,
        contributionYears: 20,
        withdrawalStartYear: 10,
        withdrawalYears: 20,
        monthlyWithdrawal: 100_000,
        drawdownFinalTotal: 5_000_000,
        depletionProbability: 0.05,
      });
      expect(text).toContain("積み立てながら");
      expect(text).toContain("10年目から");
    });

    test("generates immediate withdrawal summary", () => {
      const text = renderText({
        ...baseInput,
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        contributionYears: 0,
        withdrawalStartYear: 0,
        withdrawalYears: 30,
        finalTotal: 10_000_000,
        finalPrincipal: 10_000_000,
        finalInterest: 0,
        monthlyWithdrawal: 100_000,
        drawdownFinalTotal: 2_000_000,
        depletionProbability: 0.1,
      });
      expect(text).toContain("1,000万円をスタートに");
      expect(text).toContain("毎月手取り10万円ずつ30年間取り崩した場合");
      expect(text).not.toContain("から運用を開始");
    });
  });
});
