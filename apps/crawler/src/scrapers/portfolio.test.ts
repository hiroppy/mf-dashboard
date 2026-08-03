import type { RegisteredAccounts } from "@mf-dashboard/db/types";
import type { Page } from "playwright";
import { describe, test, expect, vi } from "vitest";
import { createManualHoldingKey } from "./manual-holding-accounts.js";
import {
  attachManualHoldingReference,
  createLinkedPnsRowFingerprint,
  getLinkedAccountDetailSource,
  hasRequiredPnsColumns,
  haveSamePnsRowMultiset,
  identifyTableTypeFromTitle,
  isPointCategory,
  parseDepositPortfolioItem,
  parseFundPortfolioItem,
  parseOptionalJapaneseNumber,
  parsePnsPortfolioItem,
  parseStockPortfolioItem,
  resolveDepositTableCategory,
  selectLinkedPnsAccounts,
  selectLinkedPnsPortfolioItems,
} from "./portfolio.js";

describe("linked insurance and pension completeness", () => {
  test("主要列が5列なら不完全、6列以上なら完全と判定する", () => {
    expect(hasRequiredPnsColumns(["1", "2", "3", "4", "5"])).toBe(false);
    expect(hasRequiredPnsColumns(["1", "2", "3", "4", "5", "6"])).toBe(true);
    expect(hasRequiredPnsColumns(["1", "2", "3", "4", "5", "6", "7"])).toBe(true);
  });

  test("カテゴリと主要6列だけを正規化してfingerprintにする", () => {
    expect(
      createLinkedPnsRowFingerprint("年金", [
        " Pension A ",
        "1,000",
        "3,000",
        "200",
        "10%",
        "2026-07-01",
        "変更",
        "削除",
      ]),
    ).toBe('["年金","Pension A","1,000","3,000","200","10%","2026-07-01"]');
    expect(createLinkedPnsRowFingerprint("保険", ["Asset A", "1", "2", "3", "4", "5"])).not.toBe(
      createLinkedPnsRowFingerprint("年金", ["Asset A", "1", "2", "3", "4", "5"]),
    );
  });

  test("順序に依存せず重複数を含めてmultisetを比較する", () => {
    expect(haveSamePnsRowMultiset(["row-a", "row-b"], ["row-b", "row-a"])).toBe(true);
    expect(haveSamePnsRowMultiset(["row-a", "row-a"], ["row-a"])).toBe(false);
    expect(haveSamePnsRowMultiset(["row-a", "row-a"], ["row-a", "row-b"])).toBe(false);
  });

  test.each([
    ["完全一致", true, ["row-a"], true],
    ["取得不完全", false, ["row-a"], false],
    ["行不一致", true, ["row-b"], false],
  ] as const)(
    "%sの分岐で通常口座詳細を採用するか決定する",
    (_label, complete, detailFingerprints, usesDetail) => {
      const globalItems = [{ name: "Pension A", type: "年金", institution: "", balance: 1000 }];
      const detailItems = [
        {
          accountMfId: "account-a",
          name: "Pension A",
          type: "年金",
          institution: "",
          balance: 1000,
        },
      ];
      const selected = selectLinkedPnsPortfolioItems(globalItems, ["row-a"], {
        complete,
        fingerprints: detailFingerprints,
        items: detailItems,
      });

      expect(selected).toEqual(usesDetail ? detailItems : globalItems);
    },
  );

  test("手動の解決済み行を保持し、未解決の自動連携行だけを詳細行へ置換する", () => {
    const manualItem = {
      accountMfId: "manual-account-a",
      name: "Manual Pension",
      type: "年金",
      institution: "",
      balance: 1000,
    };
    const unresolvedItem = {
      name: "Linked Pension",
      type: "年金",
      institution: "",
      balance: 2000,
    };
    const linkedItem = { ...unresolvedItem, accountMfId: "linked-account-a" };

    expect(
      selectLinkedPnsPortfolioItems([manualItem, unresolvedItem], ["manual-row", "linked-row"], {
        complete: true,
        fingerprints: ["linked-row"],
        items: [linkedItem],
      }),
    ).toEqual([manualItem, linkedItem]);
  });

  test("明示キーを持つ未解決の手動行を比較対象から除外する", () => {
    const unresolvedManualItem = {
      mfId: "manual-holding-a",
      subAccountMfId: "manual-sub-account-a",
      name: "Manual Pension",
      type: "年金",
      institution: "",
      balance: 1000,
    };
    const unresolvedLinkedItem = {
      name: "Linked Pension",
      type: "年金",
      institution: "",
      balance: 2000,
    };
    const linkedItem = { ...unresolvedLinkedItem, accountMfId: "linked-account-a" };

    expect(
      selectLinkedPnsPortfolioItems(
        [unresolvedManualItem, unresolvedLinkedItem],
        ["manual-row", "linked-row"],
        {
          complete: true,
          fingerprints: ["linked-row"],
          items: [linkedItem],
        },
      ),
    ).toEqual([unresolvedManualItem, linkedItem]);
  });

  test("同一fingerprintが複数口座に属する場合は口座を推測せず未解決のままにする", () => {
    const globalItems = [
      { name: "Pension A", type: "年金", institution: "", balance: 1000 },
      { name: "Pension A", type: "年金", institution: "", balance: 1000 },
    ];
    const detailItems = [
      { ...globalItems[0]!, accountMfId: "linked-account-a" },
      { ...globalItems[1]!, accountMfId: "linked-account-b" },
    ];

    expect(
      selectLinkedPnsPortfolioItems(globalItems, ["duplicate-row", "duplicate-row"], {
        complete: true,
        fingerprints: ["duplicate-row", "duplicate-row"],
        items: detailItems,
      }),
    ).toEqual(globalItems);
  });
});

describe("linked insurance and pension candidates", () => {
  const registeredAccounts: RegisteredAccounts = {
    accounts: [
      {
        mfId: "pension-a",
        name: "Institution A",
        type: "自動連携",
        status: "ok",
        lastUpdated: "",
        url: "/accounts/show/pension-a",
        totalAssets: 0,
      },
      {
        mfId: "insurance-a",
        name: "Institution B",
        type: "自動連携",
        status: "ok",
        lastUpdated: "",
        url: "/accounts/show/insurance-a",
        totalAssets: 0,
      },
      {
        mfId: "bank-a",
        name: "Institution C",
        type: "自動連携",
        status: "ok",
        lastUpdated: "",
        url: "/accounts/show/bank-a",
        totalAssets: 0,
      },
      {
        mfId: "manual-a",
        name: "Institution D",
        type: "手動",
        status: "ok",
        lastUpdated: "",
        url: "/accounts/show_manual/manual-a",
        totalAssets: 0,
      },
      {
        mfId: "stale-a",
        name: "Institution E",
        type: "自動連携",
        status: "ok",
        lastUpdated: "",
        url: "/accounts/show/other-a",
        totalAssets: 0,
      },
    ],
  };

  test("正規の詳細URLを持つ全自動連携口座を候補にする", () => {
    expect(selectLinkedPnsAccounts(registeredAccounts).map(({ mfId }) => mfId)).toEqual([
      "pension-a",
      "insurance-a",
      "bank-a",
    ]);
  });

  test("手動口座とURL不整合口座だけなら候補0件にする", () => {
    expect(
      selectLinkedPnsAccounts({
        accounts: registeredAccounts.accounts.filter(({ mfId }) =>
          ["manual-a", "stale-a"].includes(mfId),
        ),
      }),
    ).toEqual([]);
  });

  test("候補詳細の取得失敗は不完全としてfail closedにする", async () => {
    const goto = vi.fn<() => Promise<{ ok: () => boolean }>>().mockResolvedValue({
      ok: () => false,
    });
    const page = {
      goto,
      url: vi.fn<() => string>().mockReturnValue("https://moneyforward.com/"),
    } as unknown as Page;

    await expect(
      getLinkedAccountDetailSource(page, { accounts: [registeredAccounts.accounts[0]!] }),
    ).resolves.toEqual({
      complete: false,
      fingerprints: [],
      items: [],
      scheduledWithdrawals: new Map(),
    });
    expect(goto).toHaveBeenCalledOnce();
  });
});

describe("attachManualHoldingReference", () => {
  const item = {
    name: "Asset A",
    type: "保険",
    institution: "",
    balance: 1000,
  };
  const accountMap = new Map([
    [createManualHoldingKey("holding-a", "sub-account-a"), "manual-account-a"],
  ]);

  test("両方の明示キーが完全一致した場合だけ口座IDを付与する", () => {
    expect(attachManualHoldingReference(item, "holding-a", "sub-account-a", accountMap)).toEqual({
      ...item,
      mfId: "holding-a",
      subAccountMfId: "sub-account-a",
      accountMfId: "manual-account-a",
    });
  });

  test.each([
    ["候補なし", "holding-a", "sub-account-a", new Map()],
    ["片キー不一致", "holding-a", "sub-account-b", accountMap],
  ] as const)("%sでは口座IDを付与しない", (_label, holdingMfId, subAccountMfId, map) => {
    const result = attachManualHoldingReference(item, holdingMfId, subAccountMfId, map);

    expect(result).toMatchObject({ mfId: holdingMfId, subAccountMfId });
    expect(result).not.toHaveProperty("accountMfId");
  });

  test.each([
    ["保有IDなし", "", "sub-account-a"],
    ["sub-account IDなし", "holding-a", ""],
  ] as const)("%sでは明示キー自体を付与しない", (_label, holdingMfId, subAccountMfId) => {
    expect(attachManualHoldingReference(item, holdingMfId, subAccountMfId, accountMap)).toBe(item);
  });
});

describe("identifyTableTypeFromTitle", () => {
  test("「ポイント・マイル」はそのまま返す", () => {
    expect(identifyTableTypeFromTitle("ポイント・マイル")).toBe("ポイント・マイル");
  });

  test("「年金」はそのまま返す", () => {
    expect(identifyTableTypeFromTitle("年金")).toBe("年金");
  });

  test("「保険」はそのまま返す", () => {
    expect(identifyTableTypeFromTitle("保険")).toBe("保険");
  });

  test("現在の分離済み流動資産カテゴリはそのまま返す", () => {
    expect(identifyTableTypeFromTitle("預金・現金")).toBe("預金・現金");
    expect(identifyTableTypeFromTitle("暗号資産")).toBe("暗号資産");
    expect(identifyTableTypeFromTitle("電子マネー・プリペイド")).toBe("電子マネー・プリペイド");
    expect(identifyTableTypeFromTitle("ポイント")).toBe("ポイント");
  });

  test("「株式(現物)」はそのまま返す", () => {
    expect(identifyTableTypeFromTitle("株式(現物)")).toBe("株式(現物)");
  });

  test("「投資信託」はそのまま返す", () => {
    expect(identifyTableTypeFromTitle("投資信託")).toBe("投資信託");
  });

  test("不明なタイトルは「不明」を返す", () => {
    expect(identifyTableTypeFromTitle("")).toBe("不明");
    expect(identifyTableTypeFromTitle("不明なカテゴリ")).toBe("不明");
  });
});

describe("resolveDepositTableCategory", () => {
  test("現在の分離済み流動資産カテゴリを返す", () => {
    expect(resolveDepositTableCategory("預金・現金")).toBe("預金・現金");
    expect(resolveDepositTableCategory("暗号資産")).toBe("暗号資産");
    expect(resolveDepositTableCategory("電子マネー・プリペイド")).toBe("電子マネー・プリペイド");
  });

  test("未知のタイトルは預金カテゴリとして扱う", () => {
    expect(resolveDepositTableCategory("")).toBe("預金・現金");
    expect(resolveDepositTableCategory("その他")).toBe("預金・現金");
  });
});

describe("parseDepositPortfolioItem", () => {
  test("section title由来のsplitカテゴリと明示口座IDを保持する", () => {
    const item = parseDepositPortfolioItem(
      "暗号資産",
      "Crypto Asset A",
      "Institution A",
      "1,234",
      "account-a",
    );

    expect(item).toEqual({
      accountMfId: "account-a",
      name: "Crypto Asset A",
      type: "暗号資産",
      institution: "Institution A",
      balance: 1234,
    });
  });

  test("名前が空の行は無視する", () => {
    expect(parseDepositPortfolioItem("預金・現金", " ", "Institution A", "1,234")).toBeNull();
  });
});

describe("isPointCategory", () => {
  test("現在とlegacyのポイントカテゴリを判定する", () => {
    expect(isPointCategory("ポイント")).toBe(true);
    expect(isPointCategory("ポイント・マイル")).toBe(true);
    expect(isPointCategory("年金")).toBe(false);
  });
});

describe("parsePnsPortfolioItem", () => {
  test("現在の「ポイント」カテゴリはポイント用カラムでパースする", () => {
    const item = parsePnsPortfolioItem("ポイント", [
      "Point Service A",
      "not used",
      "999",
      "not used",
      "1,234",
      "not used",
      "Institution A",
    ]);

    expect(item).toEqual({
      name: "Point Service A",
      type: "ポイント",
      institution: "Institution A",
      balance: 1234,
    });
  });

  test("legacyの「ポイント・マイル」カテゴリもポイント用カラムでパースする", () => {
    const item = parsePnsPortfolioItem("ポイント・マイル", [
      "Point Service B",
      "not used",
      "999",
      "not used",
      "2,345",
      "not used",
      "Institution B",
    ]);

    expect(item).toEqual({
      name: "Point Service B",
      type: "ポイント・マイル",
      institution: "Institution B",
      balance: 2345,
    });
  });

  test("保険カテゴリは保険・年金用カラムでパースする", () => {
    const item = parsePnsPortfolioItem("保険", [
      "Insurance A",
      "1,000",
      "3,000",
      "200",
      "10%",
      "not used",
      "not used",
    ]);

    expect(item).toEqual({
      name: "Insurance A",
      type: "保険",
      institution: "",
      balance: 3000,
      avgCostPrice: 1000,
      unrealizedGain: 200,
      unrealizedGainPct: 10,
    });
  });
});

describe("parseOptionalJapaneseNumber", () => {
  test("0 は有効な数値として保持する", () => {
    expect(parseOptionalJapaneseNumber("0")).toBe(0);
    expect(parseOptionalJapaneseNumber("¥0")).toBe(0);
  });

  test("空文字は undefined を返す", () => {
    expect(parseOptionalJapaneseNumber("")).toBeUndefined();
    expect(parseOptionalJapaneseNumber("   ")).toBeUndefined();
  });

  test("プレースホルダーは undefined を返す", () => {
    expect(parseOptionalJapaneseNumber("-")).toBeUndefined();
    expect(parseOptionalJapaneseNumber("−")).toBeUndefined();
    expect(parseOptionalJapaneseNumber("—")).toBeUndefined();
  });
});

describe("parseStockPortfolioItem", () => {
  test("株式の全詳細カラムをPortfolioItemへ変換する", () => {
    expect(
      parseStockPortfolioItem({
        name: "Stock A",
        code: "1234",
        institution: "Institution A",
        balance: "1,234,500円",
        quantity: "100",
        avgCost: "10,000",
        unitPrice: "12,345",
        dailyChange: "+120円",
        unrealizedGain: "+234,500円",
        unrealizedGainPct: "+23.45%",
      }),
    ).toEqual({
      name: "Stock A",
      code: "1234",
      type: "株式(現物)",
      institution: "Institution A",
      balance: 1234500,
      quantity: 100,
      avgCostPrice: 10000,
      unitPrice: 12345,
      dailyChange: 120,
      unrealizedGain: 234500,
      unrealizedGainPct: 23.45,
    });
  });
});

describe("parseFundPortfolioItem", () => {
  test("投資信託の0と欠損値を区別して変換する", () => {
    expect(
      parseFundPortfolioItem({
        name: "Fund A",
        institution: "Institution A",
        balance: "500,000円",
        quantity: "52.3491",
        avgCost: "9,551",
        unitPrice: "10,000",
        dailyChange: "0",
        unrealizedGain: "-",
        unrealizedGainPct: "-",
      }),
    ).toEqual({
      name: "Fund A",
      type: "投資信託",
      institution: "Institution A",
      balance: 500000,
      quantity: 52.3491,
      avgCostPrice: 9551,
      unitPrice: 10000,
      dailyChange: 0,
      unrealizedGain: undefined,
      unrealizedGainPct: undefined,
    });
  });
});
