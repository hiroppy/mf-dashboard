import type { RecurringCandidate } from "@mf-dashboard/analytics/recurring-candidates";
import { describe, expect, it } from "vitest";
import {
  buildBankCashFlowForecastViews,
  getBankForecastCurrentDate,
} from "./bank-cashflow-forecast-data";

const accounts = [
  {
    id: 1,
    name: "銀行 A",
    categoryName: "銀行",
    totalAssets: 100_000,
    lastUpdated: "2026-08-03T08:00:00",
  },
  {
    id: 2,
    name: "証券 A",
    categoryName: "証券",
    totalAssets: 500_000,
    lastUpdated: "2026-08-03T08:00:00",
  },
];

function transaction(
  id: number,
  overrides: Partial<{
    accountId: number | null;
    transferTargetAccountId: number | null;
    date: string;
    amount: number;
    type: string;
    description: string | null;
    category: string | null;
    subCategory: string | null;
    isTransfer: boolean;
    isExcludedFromCalculation: boolean;
  }> = {},
) {
  return {
    id,
    accountId: 1,
    transferTargetAccountId: null,
    date: "2026-08-02",
    amount: 5_000,
    type: "income",
    description: "給与振込",
    category: "収入",
    subCategory: "給与",
    isTransfer: false,
    isExcludedFromCalculation: false,
    ...overrides,
  };
}

function candidate(overrides: Partial<RecurringCandidate> = {}): RecurringCandidate {
  return {
    accountId: 1,
    type: "expense",
    classification: "rent",
    description: "家賃",
    predictedDate: "2026-08-20",
    predictedAmount: 10_000,
    evidence: {
      occurrenceCount: 3,
      dateRange: { from: "2026-05-20", to: "2026-07-20" },
      amountRange: { min: 10_000, max: 10_000 },
    },
    ...overrides,
  };
}

describe("buildBankCashFlowForecastViews", () => {
  it("銀行口座だけに当月実績と将来予測を反映する", () => {
    const forecasts = buildBankCashFlowForecastViews(accounts, [transaction(1)], "2026-08-03", [
      candidate(),
      candidate({ accountId: 2 }),
    ]);

    expect(forecasts).toHaveLength(1);
    expect(forecasts[0]).toMatchObject({
      accountId: 1,
      accountName: "銀行 A",
      currentBalance: 100_000,
      openingBalance: 95_000,
      forecastEndBalance: 90_000,
    });
    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { id: "actual-1", status: "actual", balanceAfter: 100_000 },
      { id: "forecast:1:expense:家賃:2026-08-20", status: "forecast", balanceAfter: 90_000 },
    ]);
  });

  it("2か月後の手入力予定まで期間を延長して一度だけ残高へ反映する", () => {
    const forecasts = buildBankCashFlowForecastViews(
      accounts,
      [],
      "2026-08-03",
      [],
      [],
      [],
      [
        {
          id: 10,
          accountId: 1,
          date: "2026-10-15",
          amount: 30_000,
          direction: "expense",
          description: "予定納税",
        },
      ],
    );

    expect(forecasts[0]).toMatchObject({
      forecastEndDate: "2026-10-15",
      forecastEndBalance: 70_000,
    });
    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toEqual([
      expect.objectContaining({
        id: "manual-10",
        date: "2026-10-15",
        amountSource: "manual",
        balanceAfter: 70_000,
      }),
    ]);
  });

  it("手入力予定までの中間月にも定期入出金を反映する", () => {
    const forecasts = buildBankCashFlowForecastViews(
      accounts,
      [],
      "2026-08-03",
      [candidate({ recurrenceIntervalMonths: 1 })],
      [],
      [],
      [
        {
          id: 10,
          accountId: 1,
          date: "2026-10-15",
          amount: 30_000,
          direction: "expense",
          description: "予定納税",
        },
      ],
    );

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { id: "forecast:1:expense:家賃:2026-08-20", date: "2026-08-20" },
      { id: "forecast:1:expense:家賃:2026-09-20", date: "2026-09-20" },
      { id: "manual-10", date: "2026-10-15" },
    ]);
    expect(forecasts[0]?.forecastEndBalance).toBe(50_000);
  });

  it("当日の一致する実績と手入力予定を1対1で照合する", () => {
    const forecasts = buildBankCashFlowForecastViews(
      accounts,
      [transaction(1, { date: "2026-08-03" })],
      "2026-08-03",
      [],
      [],
      [],
      [
        {
          id: 10,
          accountId: 1,
          date: "2026-08-03",
          amount: 5_000,
          direction: "income",
          description: "入金予定",
        },
        {
          id: 11,
          accountId: 1,
          date: "2026-08-03",
          amount: 5_000,
          direction: "income",
          description: "別の入金予定",
        },
      ],
    );

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { id: "actual-1", status: "actual" },
      { id: "manual-11", status: "forecast" },
    ]);
    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toHaveLength(2);
    expect(forecasts[0]?.forecastEndBalance).toBe(105_000);
  });

  it("定期候補が消費した実績を手入力予定との照合に再利用しない", () => {
    const forecasts = buildBankCashFlowForecastViews(
      accounts,
      [transaction(1, { date: "2026-08-03" })],
      "2026-08-03",
      [
        candidate({
          type: "income",
          classification: "salary",
          description: "給与振込",
          recurringIdentity: "給与振込",
          predictedDate: "2026-08-03",
          predictedAmount: 5_000,
        }),
      ],
      [],
      [],
      [
        {
          id: 10,
          accountId: 1,
          date: "2026-08-03",
          amount: 5_000,
          direction: "income",
          description: "別の入金予定",
        },
      ],
    );

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { id: "actual-1", status: "actual" },
      { id: "manual-10", status: "forecast" },
    ]);
    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toHaveLength(2);
    expect(forecasts[0]?.forecastEndBalance).toBe(105_000);
  });

  it("ミラー振替より通常明細を優先し、手入力予定とそれぞれ一度だけ反映する", () => {
    const mirroredTransfer = transaction(1, {
      accountId: 2,
      transferTargetAccountId: 1,
      amount: 5_000,
      type: "transfer",
      isTransfer: true,
      isExcludedFromCalculation: true,
    });
    const normalExpense = transaction(2, {
      accountId: 1,
      amount: 5_000,
      type: "expense",
      description: "通常明細",
    });
    const forecasts = buildBankCashFlowForecastViews(
      accounts,
      [mirroredTransfer, normalExpense],
      "2026-08-03",
      [],
      [],
      [],
      [
        {
          id: 10,
          accountId: 1,
          date: "2026-10-15",
          amount: 30_000,
          direction: "expense",
          description: "予定納税",
        },
      ],
    );

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { id: "actual-2", description: "通常明細" },
      { id: "manual-10", amountSource: "manual" },
    ]);
    expect(forecasts[0]?.forecastEndBalance).toBe(70_000);
  });

  it("振替のみの支出と手入力予定をそれぞれ一度だけ反映する", () => {
    const transfer = transaction(1, {
      accountId: 2,
      transferTargetAccountId: 1,
      amount: 5_000,
      type: "transfer",
      isTransfer: true,
      isExcludedFromCalculation: true,
    });
    const forecasts = buildBankCashFlowForecastViews(
      accounts,
      [transfer],
      "2026-08-03",
      [],
      [],
      [],
      [
        {
          id: 10,
          accountId: 1,
          date: "2026-10-15",
          amount: 30_000,
          direction: "expense",
          description: "予定納税",
        },
      ],
    );

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { id: "actual-1-source", direction: "expense" },
      { id: "manual-10", amountSource: "manual" },
    ]);
    expect(forecasts[0]?.forecastEndBalance).toBe(70_000);
  });

  it("当月に記録済みの候補を二重計上せず、未記録の期日超過候補は基準日に繰り越す", () => {
    const forecasts = buildBankCashFlowForecastViews(accounts, [transaction(1)], "2026-08-03", [
      candidate({
        type: "income",
        classification: "salary",
        description: "給与振込",
        predictedDate: "2026-08-03",
        predictedAmount: 5_000,
      }),
      candidate({ predictedDate: "2026-08-01" }),
    ]);

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { id: "actual-1", status: "actual" },
      { id: "forecast:1:expense:家賃:2026-08-03", status: "forecast", date: "2026-08-03" },
    ]);
    expect(forecasts[0]?.forecastEndBalance).toBe(90_000);
  });

  it("変動額の当月実績が同じ定期候補を二重計上しない", () => {
    const actual = transaction(1, {
      date: "2026-08-03",
      amount: 25_000,
      type: "expense",
      description: "電気料金",
      category: "光熱費",
      subCategory: null,
    });
    const forecasts = buildBankCashFlowForecastViews(accounts, [actual], "2026-08-03", [
      candidate({
        classification: "other",
        description: "電気料金",
        recurringIdentity: "電気料金",
        predictedDate: "2026-08-03",
        predictedAmount: 10_000,
        evidence: {
          occurrenceCount: 3,
          dateRange: { from: "2026-05-03", to: "2026-07-03" },
          amountRange: { min: 8_000, max: 15_000 },
        },
      }),
    ]);

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { id: "actual-1", status: "actual", amount: 25_000 },
    ]);
  });

  it("安定した identity の当月実績は予測日から四日以上ずれても二重計上しない", () => {
    const actual = transaction(1, {
      date: "2026-08-10",
      amount: 10_000,
      type: "expense",
      description: "定期サービス",
      category: "その他",
      subCategory: null,
    });
    const forecasts = buildBankCashFlowForecastViews(accounts, [actual], "2026-08-10", [
      candidate({
        classification: "other",
        description: "定期サービス",
        recurringIdentity: "定期サービス",
        predictedDate: "2026-08-05",
      }),
    ]);

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { id: "actual-1", status: "actual" },
    ]);
    expect(forecasts[0]?.forecastEndBalance).toBe(90_000);
  });

  it("却下時点までの候補を除外し、新しい同名実績があれば復帰する", () => {
    const recurringCandidate = candidate({ recurringIdentity: "investment transfer" });
    const dismissal = {
      accountId: 1,
      direction: "expense" as const,
      recurringIdentity: "investment transfer",
      dismissedThroughDate: "2026-07-20",
    };

    const dismissed = buildBankCashFlowForecastViews(
      accounts,
      [],
      "2026-08-03",
      [recurringCandidate],
      [],
      [dismissal],
    );
    const revived = buildBankCashFlowForecastViews(
      accounts,
      [],
      "2026-08-03",
      [
        candidate({
          recurringIdentity: "investment transfer",
          evidence: {
            ...recurringCandidate.evidence,
            dateRange: { from: "2026-06-20", to: "2026-08-01" },
          },
        }),
      ],
      [],
      [dismissal],
    );

    expect(dismissed[0]?.days).toEqual([]);
    expect(revived[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { recurringIdentity: "investment transfer", status: "forecast" },
    ]);
  });

  it("残高更新日より後の実績を月末予測に反映する", () => {
    const staleAccount = { ...accounts[0]!, lastUpdated: "2026-08-01T08:00:00" };

    const forecasts = buildBankCashFlowForecastViews(
      [staleAccount],
      [transaction(1)],
      "2026-08-03",
      [],
    );

    expect(forecasts[0]).toMatchObject({
      currentBalance: 105_000,
      openingBalance: 100_000,
      forecastEndBalance: 105_000,
    });
  });

  it("候補生成と同じ正規化 identity で説明の月次差分を照合する", () => {
    const actual = transaction(1, {
      date: "2026-08-03",
      amount: -10_000,
      type: "expense",
      description: "UTILITY INVOICE 1003",
      category: null,
      subCategory: null,
    });
    const forecasts = buildBankCashFlowForecastViews(accounts, [actual], "2026-08-03", [
      candidate({
        classification: "other",
        description: "UTILITY INVOICE 1002",
        recurringIdentity: "utility invoice",
        predictedDate: "2026-08-03",
      }),
    ]);

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { id: "actual-1", status: "actual" },
    ]);
  });

  it("説明なしの記録済み候補だけを一度だけ除外する", () => {
    const actual = transaction(1, {
      date: "2026-08-03",
      amount: 10_000,
      type: "expense",
      description: null,
      category: "家賃",
      subCategory: null,
    });
    const forecasts = buildBankCashFlowForecastViews(accounts, [actual], "2026-08-03", [
      candidate({
        description: null,
        recurringIdentity: "家賃categorysep",
        predictedDate: "2026-08-03",
      }),
      candidate({
        description: null,
        recurringIdentity: "家賃categorysep",
        predictedDate: "2026-08-03",
      }),
    ]);

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { id: "actual-1", status: "actual" },
      { id: "forecast:1:expense:家賃categorysep:2026-08-03", status: "forecast" },
    ]);
    expect(forecasts[0]?.forecastEndBalance).toBe(90_000);
  });

  it("同じ説明でも金額または予定日が異なる候補は残す", () => {
    const actual = transaction(1, {
      date: "2026-08-03",
      amount: -10_000,
      type: "expense",
      description: "口座振替",
      category: null,
      subCategory: null,
    });
    const forecasts = buildBankCashFlowForecastViews(accounts, [actual], "2026-08-03", [
      candidate({
        classification: "other",
        description: "口座振替",
        predictedDate: "2026-08-03",
      }),
      candidate({
        classification: "other",
        description: "口座振替",
        predictedDate: "2026-08-20",
        predictedAmount: 30_000,
      }),
    ]);

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { id: "actual-1", status: "actual" },
      { id: "forecast:1:expense:口座振替:2026-08-20", status: "forecast", amount: 30_000 },
    ]);
  });

  it("前月以前の残高しかない口座は予測対象から除外する", () => {
    const forecasts = buildBankCashFlowForecastViews(
      [{ ...accounts[0]!, lastUpdated: "2026-07-31" }],
      [transaction(1)],
      "2026-08-03",
      [],
    );

    expect(forecasts).toEqual([]);
  });

  it("記録済み判定は変わり得る分類ではなく定期候補 identity を使う", () => {
    const actual = transaction(1, {
      date: "2026-08-03",
      amount: 10_000,
      type: "expense",
      description: "定期支払",
      category: "家賃",
    });

    const forecasts = buildBankCashFlowForecastViews(accounts, [actual], "2026-08-03", [
      candidate({
        classification: "other",
        description: "定期支払",
        recurringIdentity: "定期支払",
        predictedDate: "2026-08-03",
      }),
    ]);

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { id: "actual-1", status: "actual" },
    ]);
  });

  it("最新月で分類と投稿日が変わっても同じ定期候補を重複生成しない", () => {
    const history = [
      transaction(1, {
        date: "2026-05-05",
        amount: 10_000,
        type: "expense",
        description: "定期サービス",
        category: "家賃",
        subCategory: null,
      }),
      transaction(2, {
        date: "2026-06-05",
        amount: 10_000,
        type: "expense",
        description: "定期サービス",
        category: "家賃",
        subCategory: null,
      }),
      transaction(3, {
        date: "2026-07-10",
        amount: 10_000,
        type: "expense",
        description: "定期サービス",
        category: "その他",
        subCategory: null,
      }),
    ];

    const forecasts = buildBankCashFlowForecastViews(accounts, history, "2026-08-03");
    const events = forecasts[0]?.days.flatMap(({ events }) => events) ?? [];

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      status: "forecast",
      description: "定期サービス",
      classification: "other",
    });
  });

  it("銀行を振替元とする定期的なカード引落しを支出として予測する", () => {
    const transfers = ["2026-05-20", "2026-06-20", "2026-07-20"].map((date, index) =>
      transaction(index + 1, {
        accountId: 2,
        transferTargetAccountId: 1,
        date,
        amount: 30_000,
        type: "transfer",
        description: "カード利用代金",
        category: null,
        subCategory: null,
        isTransfer: true,
        isExcludedFromCalculation: true,
      }),
    );

    const forecasts = buildBankCashFlowForecastViews(accounts, transfers, "2026-08-03");

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      {
        accountId: 1,
        direction: "expense",
        status: "forecast",
        date: "2026-08-20",
        amount: 30_000,
      },
    ]);
    expect(forecasts[0]?.forecastEndBalance).toBe(70_000);
  });

  it("前月の明細が未取得でも前々月まで継続した引落しを予測する", () => {
    const staleTransfers = ["2026-04-27", "2026-05-27", "2026-06-27"].map((date, index) =>
      transaction(index + 1, {
        accountId: 2,
        transferTargetAccountId: 1,
        date,
        amount: 30_000,
        type: "transfer",
        description: "カード利用代金",
        category: null,
        subCategory: null,
        isTransfer: true,
        isExcludedFromCalculation: true,
      }),
    );

    const forecasts = buildBankCashFlowForecastViews(accounts, staleTransfers, "2026-08-03");

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { accountId: 1, direction: "expense", status: "forecast", date: "2026-08-27" },
    ]);
  });

  it("当月の振替を振替元の銀行口座では支出実績として反映する", () => {
    const forecasts = buildBankCashFlowForecastViews(
      accounts,
      [
        transaction(1, {
          accountId: 2,
          transferTargetAccountId: 1,
          type: "transfer",
          isTransfer: true,
          isExcludedFromCalculation: true,
        }),
      ],
      "2026-08-03",
      [],
    );

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { id: "actual-1-source", accountId: 1, direction: "expense", status: "actual" },
    ]);
  });

  it("同じ振替行が重複しても銀行残高へ一度だけ反映する", () => {
    const duplicate = transaction(1, {
      accountId: 2,
      transferTargetAccountId: 1,
      type: "transfer",
      isTransfer: true,
      isExcludedFromCalculation: true,
    });
    const forecasts = buildBankCashFlowForecastViews(
      accounts,
      [duplicate, { ...duplicate, id: 2 }],
      "2026-08-03",
      [],
    );

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toHaveLength(1);
    expect(forecasts[0]?.currentBalance).toBe(100_000);
  });

  it("同日同額の通常明細がある振替は通常明細を優先して予測する", () => {
    const transactions = ["2026-05-25", "2026-06-25", "2026-07-25"].flatMap((date, index) => [
      transaction(index * 2 + 1, {
        accountId: 2,
        transferTargetAccountId: 1,
        date,
        amount: 36_000,
        type: "transfer",
        description: "振替明細",
        category: null,
        subCategory: null,
        isTransfer: true,
        isExcludedFromCalculation: true,
      }),
      transaction(index * 2 + 2, {
        accountId: 1,
        date,
        amount: 36_000,
        type: "expense",
        description: "通常明細",
        category: "その他",
        subCategory: "定期支払",
      }),
    ]);

    const forecasts = buildBankCashFlowForecastViews(accounts, transactions, "2026-08-03");
    const events = forecasts[0]?.days.flatMap(({ events }) => events) ?? [];

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      accountId: 1,
      direction: "expense",
      status: "forecast",
      description: "通常明細",
      amount: 36_000,
    });
  });

  it("同じ銀行口座内の振替を残高変動や予測として扱わない", () => {
    const selfTransfers = [
      transaction(1, {
        accountId: 1,
        transferTargetAccountId: 1,
        date: "2026-07-25",
        amount: 1_000_000,
        type: "transfer",
        description: "口座内振替",
        category: "振替",
        isTransfer: true,
        isExcludedFromCalculation: true,
      }),
    ];

    const forecasts = buildBankCashFlowForecastViews(accounts, selfTransfers, "2026-08-03");

    expect(forecasts[0]?.days).toEqual([]);
    expect(forecasts[0]?.forecastEndBalance).toBe(100_000);
  });

  it("カード口座の引き落とし予定額を過去金額より優先する", () => {
    const cardAccount = {
      id: 3,
      name: "カード A",
      categoryName: "カード",
      totalAssets: 0,
      lastUpdated: "2026-08-03T08:00:00",
      scheduledWithdrawalAmount: 42_000,
      scheduledWithdrawalConfirmed: true,
    };
    const transfers = ["2026-05-20", "2026-06-20", "2026-07-20"].map((date, index) =>
      transaction(index + 1, {
        accountId: 3,
        transferTargetAccountId: 1,
        date,
        amount: 30_000,
        type: "transfer",
        description: "カード利用代金",
        isTransfer: true,
        isExcludedFromCalculation: true,
      }),
    );

    const forecasts = buildBankCashFlowForecastViews(
      [...accounts, cardAccount],
      transfers,
      "2026-08-03",
    );

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      {
        accountId: 1,
        direction: "expense",
        status: "forecast",
        amount: 42_000,
        amountSource: "scheduled_withdrawal",
      },
    ]);
    expect(forecasts[0]?.forecastEndBalance).toBe(58_000);
  });

  it("確定カード引落しは手入力予定で延長された将来月へ反復しない", () => {
    const cardAccount = {
      id: 3,
      name: "カード A",
      categoryName: "カード",
      totalAssets: 0,
      lastUpdated: "2026-08-03T08:00:00",
      scheduledWithdrawalAmount: 20_000,
      scheduledWithdrawalConfirmed: true,
    };
    const transfers = ["2026-05-20", "2026-06-20", "2026-07-20"].map((date, index) =>
      transaction(index + 1, {
        accountId: 3,
        transferTargetAccountId: 1,
        date,
        amount: 20_000,
        type: "transfer",
        description: "カード利用代金",
        isTransfer: true,
        isExcludedFromCalculation: true,
      }),
    );

    const forecasts = buildBankCashFlowForecastViews(
      [...accounts, cardAccount],
      transfers,
      "2026-08-03",
      undefined,
      [],
      [],
      [
        {
          id: 10,
          accountId: 1,
          date: "2026-10-15",
          amount: 10_000,
          direction: "expense",
          description: "予定納税",
        },
      ],
    );

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { date: "2026-08-20", amountSource: "scheduled_withdrawal" },
      { id: "manual-10", date: "2026-10-15" },
    ]);
    expect(forecasts[0]?.forecastEndBalance).toBe(70_000);
  });

  it("カード通常明細とミラー振替の履歴があっても確定予測を一度だけ追加する", () => {
    const cardAccount = {
      id: 3,
      name: "カード A",
      categoryName: "カード",
      totalAssets: 0,
      lastUpdated: "2026-08-03T08:00:00",
      scheduledWithdrawalAmount: 42_000,
      scheduledWithdrawalConfirmed: true,
    };
    const transactions = ["2026-05-20", "2026-06-20", "2026-07-20"].flatMap((date, index) => [
      transaction(index * 2 + 1, {
        accountId: 3,
        transferTargetAccountId: 1,
        date,
        amount: 30_000,
        type: "transfer",
        description: "カード利用代金",
        category: null,
        subCategory: null,
        isTransfer: true,
        isExcludedFromCalculation: true,
      }),
      transaction(index * 2 + 2, {
        accountId: 1,
        date,
        amount: 30_000,
        type: "expense",
        description: "カード利用代金",
        category: "カード",
        subCategory: null,
      }),
    ]);

    const forecasts = buildBankCashFlowForecastViews(
      [...accounts, cardAccount],
      transactions,
      "2026-08-03",
    );
    const events = forecasts[0]?.days.flatMap(({ events }) => events) ?? [];

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      status: "forecast",
      amount: 42_000,
      amountSource: "scheduled_withdrawal",
    });
  });

  it("一部の月だけ通常明細があるカード履歴でも確定予測を一度だけ追加する", () => {
    const cardAccount = {
      id: 3,
      name: "カード A",
      categoryName: "カード",
      totalAssets: 0,
      lastUpdated: "2026-08-03T08:00:00",
      scheduledWithdrawalAmount: 42_000,
      scheduledWithdrawalConfirmed: true,
    };
    const transactions = ["2026-05-20", "2026-06-20", "2026-07-20"].flatMap((date, index) => [
      transaction(index * 2 + 1, {
        accountId: 3,
        transferTargetAccountId: 1,
        date,
        amount: 30_000,
        type: "transfer",
        description: "カード利用代金",
        isTransfer: true,
        isExcludedFromCalculation: true,
      }),
      ...(index === 0
        ? []
        : [
            transaction(index * 2 + 2, {
              accountId: 1,
              date,
              amount: 30_000,
              type: "expense",
              description: "カード利用代金",
              category: "カード",
              subCategory: null,
            }),
          ]),
    ]);

    const forecasts = buildBankCashFlowForecastViews(
      [...accounts, cardAccount],
      transactions,
      "2026-08-03",
    );
    const events = forecasts[0]?.days.flatMap(({ events }) => events) ?? [];

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      status: "forecast",
      amount: 42_000,
      amountSource: "scheduled_withdrawal",
    });
  });

  it("一般カテゴリの銀行明細がカード振替のミラーでも確定予測と二重計上しない", () => {
    const cardAccount = {
      id: 3,
      name: "カード A",
      categoryName: "カード",
      totalAssets: 0,
      lastUpdated: "2026-08-03T08:00:00",
      scheduledWithdrawalAmount: 42_000,
      scheduledWithdrawalConfirmed: true,
    };
    const transactions = ["2026-05-20", "2026-06-20", "2026-07-20"].flatMap((date, index) => [
      transaction(index * 2 + 1, {
        accountId: 3,
        transferTargetAccountId: 1,
        date,
        amount: 30_000,
        type: "transfer",
        description: "カード利用代金",
        category: null,
        subCategory: null,
        isTransfer: true,
        isExcludedFromCalculation: true,
      }),
      transaction(index * 2 + 2, {
        accountId: 1,
        date,
        amount: 30_000,
        type: "expense",
        description: "口座振替",
        category: "その他",
        subCategory: "定期支払",
      }),
    ]);

    const forecasts = buildBankCashFlowForecastViews(
      [...accounts, cardAccount],
      transactions,
      "2026-08-03",
    );
    const events = forecasts[0]?.days.flatMap(({ events }) => events) ?? [];

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      status: "forecast",
      amount: 42_000,
      amountSource: "scheduled_withdrawal",
    });
  });

  it("同じ銀行から引き落とす別カードの定期予測を確定カードと混同しない", () => {
    const confirmedCard = {
      id: 3,
      name: "カード A",
      categoryName: "カード",
      totalAssets: 0,
      lastUpdated: "2026-08-03T08:00:00",
      scheduledWithdrawalAmount: 42_000,
      scheduledWithdrawalConfirmed: true,
    };
    const recurringCard = {
      id: 4,
      name: "カード B",
      categoryName: "カード",
      totalAssets: 0,
      lastUpdated: "2026-08-03T08:00:00",
      scheduledWithdrawalAmount: 0,
      scheduledWithdrawalConfirmed: false,
    };
    const transactions = ["2026-05", "2026-06", "2026-07"].flatMap((month, index) => [
      transaction(index * 3 + 1, {
        accountId: 3,
        transferTargetAccountId: 1,
        date: `${month}-20`,
        amount: 30_000,
        type: "transfer",
        description: "カード A 利用代金",
        category: null,
        subCategory: null,
        isTransfer: true,
        isExcludedFromCalculation: true,
      }),
      transaction(index * 3 + 2, {
        accountId: 1,
        date: `${month}-20`,
        amount: 30_000,
        type: "expense",
        description: "カード A 利用代金",
        category: "カード",
        subCategory: null,
      }),
      transaction(index * 3 + 3, {
        accountId: 4,
        transferTargetAccountId: 1,
        date: `${month}-25`,
        amount: 20_000,
        type: "transfer",
        description: "カード B 利用代金",
        category: null,
        subCategory: null,
        isTransfer: true,
        isExcludedFromCalculation: true,
      }),
    ]);

    const forecasts = buildBankCashFlowForecastViews(
      [...accounts, confirmedCard, recurringCard],
      transactions,
      "2026-08-03",
    );
    const events = forecasts[0]?.days.flatMap(({ events }) => events) ?? [];

    expect(events).toHaveLength(2);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ amount: 42_000, amountSource: "scheduled_withdrawal" }),
        expect.objectContaining({ amount: 20_000, description: "カード B 利用代金" }),
      ]),
    );
  });

  it("カードの引落銀行変更後は最新銀行の支払日を使う", () => {
    const newBank = {
      id: 4,
      name: "銀行 B",
      categoryName: "銀行",
      totalAssets: 200_000,
      lastUpdated: "2026-08-03T08:00:00",
    };
    const cardAccount = {
      id: 3,
      name: "カード A",
      categoryName: "カード",
      totalAssets: 0,
      lastUpdated: "2026-08-03T08:00:00",
      scheduledWithdrawalAmount: 42_000,
      scheduledWithdrawalConfirmed: true,
    };
    const transfers = [
      transaction(1, {
        accountId: 3,
        transferTargetAccountId: 1,
        date: "2026-05-10",
        amount: 30_000,
        type: "transfer",
        isTransfer: true,
      }),
      transaction(2, {
        accountId: 3,
        transferTargetAccountId: 1,
        date: "2026-06-10",
        amount: 30_000,
        type: "transfer",
        isTransfer: true,
      }),
      transaction(3, {
        accountId: 3,
        transferTargetAccountId: 4,
        date: "2026-07-25",
        amount: 30_000,
        type: "transfer",
        isTransfer: true,
      }),
    ];

    const forecasts = buildBankCashFlowForecastViews(
      [...accounts, newBank, cardAccount],
      transfers,
      "2026-08-03",
    );
    const newBankEvents = forecasts
      .find(({ accountId }) => accountId === 4)
      ?.days.flatMap(({ events }) => events);

    expect(newBankEvents).toMatchObject([
      { date: "2026-08-25", amountSource: "scheduled_withdrawal" },
    ]);
  });

  it("予測月より未来のカード振替を現在月の確定予測に使わない", () => {
    const cardAccount = {
      id: 3,
      name: "カード A",
      categoryName: "カード",
      totalAssets: 0,
      lastUpdated: "2026-08-03T08:00:00",
      scheduledWithdrawalAmount: 42_000,
      scheduledWithdrawalConfirmed: true,
    };
    const transfers = ["2026-05-25", "2026-06-25", "2026-07-25", "2026-09-10"].map((date, index) =>
      transaction(index + 1, {
        accountId: 3,
        transferTargetAccountId: 1,
        date,
        amount: 30_000,
        type: "transfer",
        isTransfer: true,
      }),
    );

    const forecasts = buildBankCashFlowForecastViews(
      [...accounts, cardAccount],
      transfers,
      "2026-08-03",
    );

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { date: "2026-08-25", amountSource: "scheduled_withdrawal" },
    ]);
  });

  it("カードの引落先が対象外銀行へ変わった場合は旧銀行に確定予測を出さない", () => {
    const cardAccount = {
      id: 3,
      name: "カード A",
      categoryName: "カード",
      totalAssets: 0,
      lastUpdated: "2026-08-03T08:00:00",
      scheduledWithdrawalAmount: 42_000,
      scheduledWithdrawalConfirmed: true,
    };
    const transfers = [
      transaction(1, {
        accountId: 3,
        transferTargetAccountId: 1,
        date: "2026-05-10",
        amount: 30_000,
        type: "transfer",
        isTransfer: true,
      }),
      transaction(2, {
        accountId: 3,
        transferTargetAccountId: 1,
        date: "2026-06-10",
        amount: 30_000,
        type: "transfer",
        isTransfer: true,
      }),
      transaction(3, {
        accountId: 3,
        transferTargetAccountId: 4,
        date: "2026-07-25",
        amount: 30_000,
        type: "transfer",
        isTransfer: true,
      }),
    ];

    const forecasts = buildBankCashFlowForecastViews(
      [...accounts, cardAccount],
      transfers,
      "2026-08-03",
    );

    expect(forecasts[0]?.days).toEqual([]);
    expect(forecasts[0]?.forecastEndBalance).toBe(100_000);
  });

  it("確定カード引落しが当月実績済みなら予測を追加しない", () => {
    const cardAccount = {
      id: 3,
      name: "カード A",
      categoryName: "カード",
      totalAssets: 0,
      lastUpdated: "2026-08-03T08:00:00",
      scheduledWithdrawalAmount: 42_000,
      scheduledWithdrawalConfirmed: true,
    };
    const transfers = ["2026-06-20", "2026-07-20", "2026-08-02"].map((date, index) =>
      transaction(index + 1, {
        accountId: 3,
        transferTargetAccountId: 1,
        date,
        amount: 42_000,
        type: "transfer",
        description: "カード利用代金",
        isTransfer: true,
        isExcludedFromCalculation: true,
      }),
    );

    const forecasts = buildBankCashFlowForecastViews(
      [...accounts, cardAccount],
      transfers,
      "2026-08-03",
    );
    const events = forecasts[0]?.days.flatMap(({ events }) => events) ?? [];

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: "actual", amount: 42_000 });
    expect(forecasts[0]?.forecastEndBalance).toBe(100_000);
  });

  it("基準日より後の当月カード振替は確定予測を抑止しない", () => {
    const cardAccount = {
      id: 3,
      name: "カード A",
      categoryName: "カード",
      totalAssets: 0,
      lastUpdated: "2026-08-03T08:00:00",
      scheduledWithdrawalAmount: 42_000,
      scheduledWithdrawalConfirmed: true,
    };
    const transfers = ["2026-06-20", "2026-07-20", "2026-08-20"].map((date, index) =>
      transaction(index + 1, {
        accountId: 3,
        transferTargetAccountId: 1,
        date,
        amount: 42_000,
        type: "transfer",
        description: "カード利用代金",
        isTransfer: true,
        isExcludedFromCalculation: true,
      }),
    );

    const forecasts = buildBankCashFlowForecastViews(
      [...accounts, cardAccount],
      transfers,
      "2026-08-03",
    );

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { status: "forecast", date: "2026-08-20", amount: 42_000 },
    ]);
  });

  it("引き落とし予定額が未定ならカード利用残高を参考額にする", () => {
    const cardAccount = {
      id: 3,
      name: "カード A",
      categoryName: "カード",
      totalAssets: 0,
      lastUpdated: "2026-08-03T08:00:00",
      scheduledWithdrawalAmount: 0,
      scheduledWithdrawalConfirmed: false,
    };
    const transfers = ["2026-05-27", "2026-06-27", "2026-07-27"].map((date, index) =>
      transaction(index + 1, {
        accountId: 3,
        transferTargetAccountId: 1,
        date,
        amount: 30_000 + index * 20_000,
        type: "transfer",
        description: "カード利用代金",
        isTransfer: true,
        isExcludedFromCalculation: true,
      }),
    );

    const forecasts = buildBankCashFlowForecastViews(
      [...accounts, cardAccount],
      transfers,
      "2026-08-03",
      undefined,
      [{ accountId: 3, amount: 84_000 }],
    );

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      {
        accountId: 1,
        direction: "expense",
        date: "2026-08-27",
        amount: 84_000,
        amountSource: "liability",
      },
    ]);
    expect(forecasts[0]?.forecastEndBalance).toBe(16_000);
  });

  it("0円で確定したカードは利用残高や過去実績から予測しない", () => {
    const cardAccount = {
      id: 3,
      name: "カード A",
      categoryName: "カード",
      totalAssets: 0,
      lastUpdated: "2026-08-03T08:00:00",
      scheduledWithdrawalAmount: 0,
      scheduledWithdrawalConfirmed: true,
    };
    const transfers = ["2026-05-27", "2026-06-27", "2026-07-27"].map((date, index) =>
      transaction(index + 1, {
        accountId: 3,
        transferTargetAccountId: 1,
        date,
        amount: 30_000,
        type: "transfer",
        description: "カード利用代金",
        isTransfer: true,
      }),
    );

    const forecasts = buildBankCashFlowForecastViews(
      [...accounts, cardAccount],
      transfers,
      "2026-08-03",
      undefined,
      [{ accountId: 3, amount: 84_000 }],
    );

    expect(forecasts[0]?.days).toEqual([]);
    expect(forecasts[0]?.forecastEndBalance).toBe(100_000);
  });

  it("銀行口座がなければ予測を返さない", () => {
    expect(
      buildBankCashFlowForecastViews([accounts[1]!], [transaction(1)], "2026-08-03", []),
    ).toEqual([]);
  });
});

describe("getBankForecastCurrentDate", () => {
  it("通常表示では当日を使う", () => {
    expect(getBankForecastCurrentDate("2026-08-28", false)).toBe("2026-08-28");
  });

  it("demo 表示では代表候補を再現できる月初の基準日を使う", () => {
    expect(getBankForecastCurrentDate("2026-08-28", true)).toBe("2026-08-03");
  });
});
