import { describe, expect, test } from "vitest";
import assertFinanceChatOutput from "./assertions";

function output(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    text: "2026年7月の収入は313,235円、支出は219,894円、収支は93,341円です。",
    charts: [],
    databaseQueries: [
      {
        input: { sql: "SELECT income, expense FROM transactions" },
        output: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
      },
    ],
    textLinkLabels: [],
    toolRoutes: [],
    textLinks: [],
    ...overrides,
  });
}

describe("assertFinanceChatOutput", () => {
  test("accepts matching facts, label/value pairs, and empty structured output", () => {
    expect(
      assertFinanceChatOutput(output(), {
        config: {
          expectedCharts: [],
          expectedTextFacts: ["2026年7月"],
          expectedTextLinks: [],
          expectedTextPairs: [
            ["収入", "313235"],
            ["支出", "219894"],
            ["収支", "93341"],
          ],
          expectedToolRoutes: [],
        },
      }),
    ).toMatchObject({ pass: true, score: 1 });
    expect(
      assertFinanceChatOutput(
        output({
          text: "収入は `313,235円`、支出は `219,894円`、収支は `93,341円`です。",
        }),
        {
          config: {
            expectedTextPairs: [
              ["収入", "313235"],
              ["支出", "219894"],
              ["収支", "93341"],
            ],
          },
        },
      ),
    ).toMatchObject({ pass: true });
  });

  test("rejects a missing label/value pair", () => {
    expect(
      assertFinanceChatOutput(output(), {
        config: { expectedTextPairs: [["収入", "999999"]] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("収入=999999") });
  });

  test("does not use image alt text or struck-through text as factual evidence", () => {
    const config = {
      expectedTextFacts: ["2026年7月"],
      expectedTextPairs: [["収入", "313235"]] as Array<[string, string]>,
    };
    expect(
      assertFinanceChatOutput(output({ text: "![2026年7月の収入は313,235円です。](x)" }), {
        config,
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(output({ text: "~~2026年7月の収入は313,235円です。~~" }), {
        config,
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          text: '<span title="2026年7月の収入は313,235円です。"></span>',
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          text: "<span hidden>2026年7月の収入は313,235円です。</span>",
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          text: "<span hidden><span>無視</span>2026年7月の収入は313,235円です。</span>",
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          text: "<script>2026年7月の収入は313,235円です。</script>",
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          text: '[収入]: x "313,235円"\n[支出]: x "219,894円"\n[収支]: x "93,341円"',
        }),
        {
          config: {
            expectedTextPairs: [
              ["収入", "313235"],
              ["支出", "219894"],
              ["収支", "93341"],
            ],
          },
        },
      ),
    ).toMatchObject({ pass: false });
  });

  test("requires expected facts to be backed by database results", () => {
    expect(
      assertFinanceChatOutput(output({ databaseQueries: [] }), {
        config: { expectedDatabaseValues: ["313235", "219894"] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("DB結果") });
  });

  test("binds database facts to a scoped query and the same result row", () => {
    const config = {
      expectedDatabaseRows: [{ income: "313235", expense: "219894" }],
      expectedDatabaseValues: ["313235", "219894"],
      requiredDatabaseQueryPatterns: ["transactions", "2026-07", ":groupId", "\\bsum\\s*\\("],
    };

    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT 313235 AS income, 219894 AS expense, SUM(amount) FROM transactions WHERE date LIKE '2026-07%' AND group_id = :groupId",
              },
              output: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT 313_235 AS income, 219_894 AS expense, SUM(amount) FROM transactions WHERE date LIKE '2026-07%' AND group_id = :groupId",
              },
              output: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT SUM(amount) - SUM(amount) + 313000 + 235 AS income, SUM(amount) - SUM(amount) + 219000 + 894 AS expense FROM transactions WHERE date LIKE '2026-07%' AND group_id = :groupId",
              },
              output: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT SUM(amount * 0 + 0x4C793) AS income, 0x35AF6 AS expense FROM transactions WHERE date LIKE '2026-07%' AND group_id = :groupId",
              },
              output: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    for (const sql of [
      "SELECT printf('%d%d', 313, 235) AS income, printf('%d%d', 219, 894) AS expense, SUM(amount) FROM transactions WHERE date LIKE '2026-07%' AND group_id = :groupId",
      "SELECT 313 || 235 AS income, 219 || 894 AS expense, SUM(amount) FROM transactions WHERE date LIKE '2026-07%' AND group_id = :groupId",
      "SELECT 626470 / 2 AS income, 439788 / 2 AS expense, SUM(amount) FROM transactions WHERE date LIKE '2026-07%' AND group_id = :groupId",
    ]) {
      expect(
        assertFinanceChatOutput(
          output({
            databaseQueries: [
              {
                input: { sql },
                output: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
              },
            ],
          }),
          { config },
        ),
      ).toMatchObject({ pass: false });
    }
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT SUM(income), SUM(expense) FROM transactions WHERE date LIKE '2026-07%' AND group_id = :groupId",
              },
              output: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    for (const sql of [
      'SELECT SUM("income"), SUM("expense") FROM "transactions" WHERE "date" LIKE \'2026-07%\' AND "group_id" = :groupId',
      "SELECT SUM(`income`), SUM(`expense`) FROM `transactions` WHERE `date` LIKE '2026-07%' AND `group_id` = :groupId",
      "SELECT SUM([income]), SUM([expense]) FROM [transactions] WHERE [date] LIKE '2026-07%' AND [group_id] = :groupId",
    ]) {
      expect(
        assertFinanceChatOutput(
          output({
            databaseQueries: [
              {
                input: { sql },
                output: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
              },
            ],
          }),
          { config },
        ),
      ).toMatchObject({ pass: true });
    }
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income, SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense FROM transactions WHERE date LIKE '2026-07%' AND group_id = :groupId",
              },
              output: { rows: [{ income: 313_235, expense: 219_894 }], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT SUM(income), SUM(expense) FROM transactions WHERE date LIKE '2026-07%' AND group_id = :groupId",
              },
              output: { rows: [{ income: 313_235, expense: 219_894 }], truncated: true },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT SUM(income), SUM(expense) FROM transactions WHERE date LIKE '2026-07%' AND group_id = :groupId",
              },
              output: { rows: [{ income: 219_894, expense: 313_235 }], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("DB結果") });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT SUM(amount) FROM transactions WHERE date LIKE '2026-07%' AND group_id = :groupId",
              },
              output: {
                rows: [{ income: 313_235 }, { expense: 219_894 }],
                truncated: false,
              },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
  });

  test("requires no-data answers to be backed by an empty database result", () => {
    const config = {
      forbiddenNoDataQueryPatterns: [
        "\\b1\\s*=\\s*0\\b",
        "\\blimit\\b",
        "\\bamount\\b\\s*(?:<=|<|=|>|>=|between|in|like)",
        "\\bdate\\b\\s+like\\s*['\"]2030-01['\"]",
      ],
      requiredNoDataQueryPatterns: [
        "\\btransactions\\b",
        "(?:\\bdate\\b|\\b(?:substr|strftime)\\s*\\([^)]*\\bdate\\b[^)]*\\))\\s*(?:>=|>|=|like|between)\\s*['\"]?2030-01",
        "\\bcategory\\b\\s*(?:=|like|in)[^;]{0,80}食費",
        "\\btype\\b\\s*=\\s*['\"]?expense",
        "\\bgroup_id\\b\\s*=\\s*:groupId",
      ],
      requireNoDataEvidence: true,
    };

    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount FROM transactions WHERE date >= '2030-01-01' AND category = '食費' AND type = 'expense' AND is_internal_transfer = 0 AND group_id = :groupId",
              },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    for (const hiddenPredicate of [
      "length(category) < 0",
      "substr(category, 1, 1) = 'X'",
      "length(substr(date, 1, 7)) < 0",
      "type <> 'expense'",
      "category IS NULL",
      "NOT category = '食費'",
    ]) {
      expect(
        assertFinanceChatOutput(
          output({
            databaseQueries: [
              {
                input: {
                  sql: `SELECT amount FROM transactions WHERE date >= '2030-01-01' AND category = '食費' AND type = 'expense' AND group_id = :groupId AND ${hiddenPredicate}`,
                },
                output: { rows: [], truncated: false },
              },
            ],
          }),
          { config },
        ),
      ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
    }
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT category, COUNT(*) AS count FROM transactions WHERE date >= '2030-01-01' AND category = '食費' AND type = 'expense' AND group_id = :groupId GROUP BY category HAVING 0",
              },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount FROM transactions JOIN group_accounts ga ON ga.account_id = transactions.account_id WHERE date >= '2030-01-01' AND category = '食費' AND type = 'expense' AND ga.group_id = :groupId",
              },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount FROM transactions blocker JOIN transactions ON blocker.id IS NULL WHERE date >= '2030-01-01' AND category = '食費' AND type = 'expense' AND group_id = :groupId",
              },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount FROM transactions WHERE date >= '2030-01-01' AND category = '食費' AND type = 'expense' AND category = '不存在' AND group_id = :groupId",
              },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount FROM transactions WHERE date LIKE '2030-01' AND category = '食費' AND type = 'expense' AND group_id = :groupId",
              },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount FROM transactions WHERE date >= '2030-01-01' AND category = '食費' AND type = 'income' AND group_id = :groupId",
              },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount FROM transactions WHERE date >= '2030-01-01' AND category = '食費' AND type = 'expense' AND group_id = :groupId AND id IS NULL",
              },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount FROM transactions WHERE date >= '2026-07-01' AND '2030-01' = '2030-01' AND category = '食費' AND type = 'expense' AND group_id = :groupId",
              },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount FROM transactions WHERE date >= '2030-01-01' AND category = '食費' AND type = 'expense' AND group_id = :groupId AND amount < 0",
              },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount FROM transactions WHERE date >= '2030-01-01' AND date < '2030-01-01' AND category = '食費' AND type = 'expense' AND group_id = :groupId",
              },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
    expect(
      assertFinanceChatOutput(
        output({
          text: "2030年1月の食費データはありません。",
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount FROM transactions WHERE date >= '2030-01-01' AND category = '食費' AND type = 'expense' AND group_id = :groupId",
              },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config: { ...config, expectedNoDataTextFacts: ["2030年1月", "食費"] } },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT SUM(amount) AS total FROM transactions WHERE date >= '2030-01-01' AND category = '食費' AND type = 'expense' AND group_id = :groupId",
              },
              output: { rows: [{ total: null }], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT 0 AS count, COUNT(*) AS actual_count FROM transactions WHERE date >= '2030-01-01' AND category = '食費' AND type = 'expense' AND group_id = :groupId",
              },
              output: { rows: [{ count: 0, actual_count: 1 }], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
    expect(
      assertFinanceChatOutput(
        output({
          text: "2029年12月の住宅費データはありません。",
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount FROM transactions WHERE date >= '2030-01-01' AND category = '食費' AND type = 'expense' AND group_id = :groupId",
              },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config: { ...config, expectedNoDataTextFacts: ["2030年1月", "食費"] } },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("期間") });
    expect(
      assertFinanceChatOutput(
        output({
          text: "2030年1月の食費データはありません。ただし実際には取引があります。",
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount FROM transactions WHERE date >= '2030-01-01' AND category = '食費' AND type = 'expense' AND group_id = :groupId",
              },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config: { ...config, expectedNoDataTextFacts: ["2030年1月", "食費"] } },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("矛盾") });
    expect(
      assertFinanceChatOutput(
        output({
          text: "2030年1月の食費データはありません。2030年1月の食費取引は存在します。",
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount FROM transactions WHERE date >= '2030-01-01' AND category = '食費' AND type = 'expense' AND group_id = :groupId",
              },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config: { ...config, expectedNoDataTextFacts: ["2030年1月", "食費"] } },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("矛盾") });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount FROM transactions WHERE date >= '2030-01-01' AND category = '食費' AND type = 'expense' AND group_id = :groupId",
              },
              output: { rows: [], truncated: true },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT COUNT(*) AS count FROM transactions WHERE substr(date, 1, 7) = '2030-01' AND category = '食費' AND type = 'expense' AND group_id = :groupId",
              },
              output: { rows: [{ count: 0 }], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    expect(assertFinanceChatOutput(output({ databaseQueries: [] }), { config })).toMatchObject({
      pass: false,
      reason: expect.stringContaining("データなし"),
    });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: { sql: "SELECT * FROM accounts WHERE 1 = 0" },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount FROM transactions WHERE date >= '2030-01-01' AND category = '食費' AND type = 'expense' AND group_id = :groupId AND 0",
              },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        {
          config: {
            ...config,
            forbiddenNoDataQueryPatterns: [
              ...config.forbiddenNoDataQueryPatterns,
              "\\b(?:where|and)\\s+(?:0|null|false)\\b",
            ],
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT NULL AS amount FROM transactions WHERE date >= '2030-01-01' AND category = '食費' AND type = 'expense' AND group_id = :groupId",
              },
              output: { rows: [{ amount: null }], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT NULL AS amount FROM transactions WHERE group_id = :groupId AND '2030-01' = '2030-01' AND '食費' = '食費'",
              },
              output: { rows: [{ amount: null }], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount FROM transactions WHERE date >= '2030-01-01' AND category = '食費' AND type = 'expense' AND group_id = :groupId LIMIT 0",
              },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT amount FROM transactions WHERE date >= '2026-07-01' AND group_id = :groupId /* date >= '2030-01-01' AND category = '食費' */",
              },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
    expect(
      assertFinanceChatOutput(
        output({
          databaseQueries: [
            {
              input: {
                sql: "SELECT 'date >= 2030-01 category = 食費' FROM transactions WHERE group_id = :groupId",
              },
              output: { rows: [], truncated: false },
            },
          ],
        }),
        { config },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("データなし") });
  });

  test("does not bind a value to a neighboring label", () => {
    expect(
      assertFinanceChatOutput(
        output({ text: "2026年7月の収入は219,894円、支出は313,235円、収支は93,341円です。" }),
        {
          config: {
            expectedTextPairs: [
              ["収入", "313235"],
              ["支出", "219894"],
            ],
          },
        },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          text: "収入は313,235円、支出は219,894円、収支は93,341円です。収入は219,894円です。",
        }),
        {
          config: {
            expectedTextPairs: [
              ["収入", "313235"],
              ["支出", "219894"],
              ["収支", "93341"],
            ],
          },
        },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({ text: "収入は313,235円、支出は219,894円、収支は▲93,341円です。" }),
        { config: { expectedTextPairs: [["収支", "93341"]] } },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          text: "2026年7月の収入は313,235円ではなく、支出は219,894円ではなく、収支は93,341円ではありません。",
        }),
        {
          config: {
            expectedTextPairs: [
              ["収入", "313235"],
              ["支出", "219894"],
              ["収支", "93341"],
            ],
          },
        },
      ),
    ).toMatchObject({ pass: false });
  });

  test("binds monthly values to the requested period", () => {
    const config = {
      expectedScopedTextPairs: {
        scopeFact: "2026年7月",
        pairs: [
          ["収入", "313235"],
          ["支出", "219894"],
          ["収支", "93341"],
        ] as Array<[string, string]>,
      },
    };

    expect(
      assertFinanceChatOutput(
        output({
          text: "2026年7月について確認しました。2026年6月の収入は313,235円、支出は219,894円、収支は93,341円です。",
        }),
        { config },
      ),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          text: ["## 2026年7月", "収入は313,235円、支出は219,894円、収支は93,341円です。"].join(
            "\n",
          ),
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          text: ["2026年7月", "- 収入は313,235円", "- 支出は219,894円", "- 収支は93,341円"].join(
            "\n",
          ),
        }),
        { config },
      ),
    ).toMatchObject({ pass: true });
  });

  test("accepts a value after a repeated heading label", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "## 収入・支出・収支\n収入は313,235円、支出は219,894円、収支は93,341円です。",
        }),
        {
          config: {
            expectedTextPairs: [
              ["収入", "313235"],
              ["支出", "219894"],
              ["収支", "93341"],
            ],
          },
        },
      ),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({
          text: [
            "## 2026年7月",
            "| 収入 | 支出 | 収支 |",
            "| ---: | ---: | ---: |",
            "| 313,235円 | 219,894円 | 93,341円 |",
          ].join("\n"),
        }),
        {
          config: {
            expectedTextPairs: [
              ["収入", "313235"],
              ["支出", "219894"],
              ["収支", "93341"],
            ],
          },
        },
      ),
    ).toMatchObject({ pass: true });
  });

  test("rejects displayed amounts that are not expected or database-backed", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "2026年7月の収入は313,235円、支出は219,894円、収支は93,341円、予算は999,999円です。",
          databaseQueries: [
            {
              input: { sql: "SELECT 999999 AS budget" },
              output: {
                rows: [{ budget: 999_999, expense: 219_894, income: 313_235 }],
                truncated: false,
              },
            },
          ],
        }),
        {
          config: {
            allowOnlyGroundedAmounts: true,
            expectedDatabaseValues: ["313235", "219894"],
            expectedTextPairs: [
              ["収入", "313235"],
              ["支出", "219894"],
              ["収支", "93341"],
            ],
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("999999") });
    expect(
      assertFinanceChatOutput(output({ text: "収入は313,235円、予算は999999です。" }), {
        config: {
          allowOnlyGroundedAmounts: true,
          expectedTextPairs: [["収入", "313235"]],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("999999") });
  });

  test("compares chart values by label without requiring data order", () => {
    const chart = {
      title: "2026年7月の食費",
      chartType: "pie",
      unit: "currency",
      series: [{ name: "支出", amountType: "expense" as const }],
      data: [
        { label: "外食", values: [12_214] },
        { label: "食料品", values: [24_833] },
      ],
    };

    expect(
      assertFinanceChatOutput(output({ charts: [chart] }), {
        config: {
          expectedCharts: [
            {
              title: "2026年7月の食費",
              chartType: "pie",
              unit: "currency",
              series: [{ name: "支出", amountType: "expense" }],
              data: [
                { label: "食料品", values: [24_833] },
                { label: "外食", values: [12_214] },
              ],
            },
          ],
        },
      }),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(output({ charts: [{ ...chart, title: "2025年6月の食費" }] }), {
        config: {
          expectedCharts: [
            {
              title: "2026年7月の食費",
              chartType: "pie",
              unit: "currency",
              series: [{ name: "支出", amountType: "expense" }],
              data: chart.data,
            },
          ],
        },
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({ charts: [chart], text: "食費は41,837円で、外食は99%です。" }),
        {
          config: {
            expectedCharts: [
              {
                title: "2026年7月の食費",
                chartType: "pie",
                unit: "currency",
                series: chart.series,
                data: chart.data,
              },
            ],
            groundPercentagesInCharts: true,
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("割合") });
    expect(
      assertFinanceChatOutput(
        output({ charts: [chart], text: "食費は41,837円で、外食は67%です。" }),
        {
          config: {
            expectedCharts: [
              {
                title: "2026年7月の食費",
                chartType: "pie",
                unit: "currency",
                series: chart.series,
                data: chart.data,
              },
            ],
            groundPercentagesInCharts: true,
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("label") });
    expect(
      assertFinanceChatOutput(
        output({ charts: [chart], text: "食費は41,837円です。24,833円は外食です。" }),
        {
          config: {
            expectedCharts: [
              {
                title: "2026年7月の食費",
                chartType: "pie",
                unit: "currency",
                series: chart.series,
                data: chart.data,
              },
            ],
            validateChartAmounts: true,
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("label") });
    expect(
      assertFinanceChatOutput(
        output({ charts: [chart], text: "食費は41,837円で、外食は24,833円です。" }),
        {
          config: {
            expectedCharts: [
              {
                title: "2026年7月の食費",
                chartType: "pie",
                unit: "currency",
                series: chart.series,
                data: chart.data,
              },
            ],
            validateChartAmounts: true,
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("label") });
    expect(
      assertFinanceChatOutput(
        output({ charts: [chart], text: "食費は41,837円で、外食が最も多いです。" }),
        {
          config: {
            expectedCharts: [
              {
                title: "2026年7月の食費",
                chartType: "pie",
                unit: "currency",
                series: chart.series,
                data: chart.data,
              },
            ],
            validateChartComparisons: true,
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("比較") });
    expect(
      assertFinanceChatOutput(
        output({ charts: [chart], text: "食費は41,837円です。最も多いのは外食です。" }),
        {
          config: {
            expectedCharts: [
              {
                title: "2026年7月の食費",
                chartType: "pie",
                unit: "currency",
                series: chart.series,
                data: chart.data,
              },
            ],
            validateChartComparisons: true,
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("比較") });
  });

  test("requires expected cells to appear in the same Markdown row", () => {
    const text = [
      "| 日付 | 内容 | 金額 |",
      "| --- | --- | ---: |",
      "| 2026-07-03 | サンマルクカフェ | 761円 |",
    ].join("\n");

    expect(
      assertFinanceChatOutput(output({ text }), {
        config: {
          expectedMarkdownHeader: ["日付", "内容", "金額"],
          expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "761"]],
        },
      }),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(
        output({ text: text.replace("| 日付 | 内容 | 金額 |", "| 金額 | 内容 | 日付 |") }),
        {
          config: {
            expectedMarkdownHeader: ["日付", "内容", "金額"],
            expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "761"]],
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("header") });
    expect(
      assertFinanceChatOutput(output({ text }), {
        config: {
          expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "999"]],
          requireExactMarkdownRows: true,
        },
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          text: `${text}\n| 2026-07-04 | 架空店舗 | 999円 |`,
        }),
        {
          config: {
            expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "761"]],
            requireExactMarkdownRows: true,
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("想定外") });
    expect(
      assertFinanceChatOutput(output({ text: ["```markdown", text, "```"].join("\n") }), {
        config: {
          expectedMarkdownHeader: ["日付", "内容", "金額"],
          expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "761"]],
        },
      }),
    ).toMatchObject({ pass: false });
    expect(
      assertFinanceChatOutput(
        output({
          text: [
            "| 日付 | 内容 | 金額 |",
            "| --- | --- | --- |",
            "",
            "| 金額 | 内容 | 日付 |",
            "| --- | --- | --- |",
            "| 761円 | サンマルクカフェ | 2026-07-03 |",
          ].join("\n"),
        }),
        {
          config: {
            expectedMarkdownHeader: ["日付", "内容", "金額"],
            expectedMarkdownRows: [["2026-07-03", "サンマルクカフェ", "761"]],
            requireExactMarkdownRows: true,
          },
        },
      ),
    ).toMatchObject({ pass: false });
  });

  test("rejects links that were not returned by the route tool", () => {
    expect(
      assertFinanceChatOutput(
        output({
          text: "[収支を見る](/0/cf/2026-07)",
          textLinks: ["/0/cf/2026-07"],
        }),
        { config: { expectedTextLinks: ["/0/cf/2026-07"] } },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("route tool") });
  });

  test("binds a dashboard route to its visible Markdown label", () => {
    const href = "/0/cf/2026-07";
    expect(
      assertFinanceChatOutput(
        output({
          text: "2026年7月はこちら: [2025年6月の収支](/0/cf/2026-07)",
          textLinkLabels: [{ href, label: "2025年6月の収支" }],
          textLinks: [href],
          toolRoutes: [href],
        }),
        {
          config: {
            expectedTextLinkLabels: [{ href, pattern: "2026年7月.*収支" }],
            expectedTextLinks: [href],
            expectedToolRoutes: [href],
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("label") });
    expect(
      assertFinanceChatOutput(
        output({
          textLinkLabels: [
            { href, label: "2026年7月の収支" },
            { href, label: "2025年6月の収支" },
          ],
          textLinks: [href],
          toolRoutes: [href],
        }),
        {
          config: {
            expectedTextLinkLabels: [{ href, pattern: "2026年7月.*収支" }],
            expectedTextLinks: [href],
            expectedToolRoutes: [href],
          },
        },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("label") });
  });

  test("rejects internal terms and invented no-data amounts", () => {
    expect(
      assertFinanceChatOutput(output({ text: "transactionsを確認しました。" }), {
        config: { forbiddenTextTerms: ["transactions"] },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("禁止用語") });
    expect(
      assertFinanceChatOutput(output({ text: "amountカラムをSUMしました。" }), {}),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("DB内部用語") });
    expect(
      assertFinanceChatOutput(output({ text: "データはありませんが、1,000円です。" }), {
        config: { forbidAmounts: true },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("金額") });
    expect(
      assertFinanceChatOutput(output({ text: "データはありませんが、食費は-1.5万円程度です。" }), {
        config: { forbidAmounts: true },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("金額") });
    expect(
      assertFinanceChatOutput(output({ text: "データはありませんが、目安は1万くらいです。" }), {
        config: { forbidAmounts: true },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("金額") });
    expect(
      assertFinanceChatOutput(output({ text: "データはありませんが、目安は一万円です。" }), {
        config: { forbidAmounts: true },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("金額") });
    expect(
      assertFinanceChatOutput(output({ text: "データはありませんが、目安は999999です。" }), {
        config: { forbidAmounts: true },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("金額") });
    expect(
      assertFinanceChatOutput(
        output({ text: "2030年1月の食費データはありません。食費は999999です。" }),
        { config: { forbidAmounts: true } },
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("金額") });
  });

  test("normalizes compact yen units for grounded amount checks", () => {
    expect(
      assertFinanceChatOutput(output({ text: "食費は1.5万円です。" }), {
        config: {
          allowOnlyGroundedAmounts: true,
          expectedTextPairs: [["食費", "15000"]],
        },
      }),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(output({ text: "食費は1.5万円、予算は2万円です。" }), {
        config: {
          allowOnlyGroundedAmounts: true,
          expectedTextPairs: [["食費", "15000"]],
        },
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("20000") });
    expect(
      assertFinanceChatOutput(output({ text: "食費は4万1,837円です。" }), {
        config: {
          allowOnlyGroundedAmounts: true,
          expectedTextPairs: [["食費", "41837"]],
        },
      }),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(output({ text: "資産は1億2,500万円です。" }), {
        config: {
          allowOnlyGroundedAmounts: true,
          expectedTextPairs: [["資産", "125000000"]],
        },
      }),
    ).toMatchObject({ pass: true });
  });

  test("accepts natural no-data wording while rejecting internal terms", () => {
    const config = {
      expectedTextPatterns: ["(?:データ|明細|記録|取引).*(?:ありません|ない|見つかりません)"],
      forbiddenTextTerms: ["transactions"],
    };

    expect(
      assertFinanceChatOutput(output({ text: "該当する食費の記録はありません。" }), { config }),
    ).toMatchObject({ pass: true });
    expect(
      assertFinanceChatOutput(output({ text: "transactionsテーブルにデータはありません。" }), {
        config,
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("禁止用語") });
  });

  test("rejects advice to share household data externally", () => {
    expect(
      assertFinanceChatOutput(
        output({ text: "家計データを外部サービスへアップロードしてください。" }),
        {},
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("外部共有") });
    for (const text of [
      "家計データを外部へ共有するとよいでしょう。",
      "個人情報を第三者へ共有することをおすすめします。",
    ]) {
      expect(assertFinanceChatOutput(output({ text }), {})).toMatchObject({
        pass: false,
        reason: expect.stringContaining("外部共有"),
      });
    }
    expect(
      assertFinanceChatOutput(
        output({ text: "~~家計データを外部サービスへアップロードしてください。~~" }),
        {},
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("外部共有") });
    expect(
      assertFinanceChatOutput(
        output({
          text: "収入は313,235円、支出は219,894円、収支は93,341円です。全財産を株式へ投入してください。",
        }),
        {},
      ),
    ).toMatchObject({ pass: false, reason: expect.stringContaining("高リスク") });
    expect(assertFinanceChatOutput(output({ text: "借金を返済してください。" }), {})).toMatchObject(
      { pass: true },
    );
    expect(
      assertFinanceChatOutput(output({ text: "投資は慎重に検討してください。" }), {}),
    ).toMatchObject({ pass: true });
  });

  test("rejects malformed provider output", () => {
    expect(assertFinanceChatOutput("not json", {})).toMatchObject({ pass: false });
    expect(assertFinanceChatOutput(JSON.stringify({ text: "missing fields" }), {})).toMatchObject({
      pass: false,
    });
  });
});
