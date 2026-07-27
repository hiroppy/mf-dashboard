import { describe, expect, test } from "vitest";
import {
  buildUniqueManualHoldingAccountMap,
  createManualHoldingKey,
  createManualHoldingReference,
} from "./manual-holding-accounts.js";

describe("createManualHoldingReference", () => {
  test("ページ口座IDと2つの明示キーが揃う場合だけ参照を作る", () => {
    expect(
      createManualHoldingReference(["manual-account-a"], "manual-account-a", "holding-a", "sub-a"),
    ).toEqual({
      holdingMfId: "holding-a",
      subAccountMfId: "sub-a",
      accountMfId: "manual-account-a",
    });
  });

  test.each([
    ["ページ口座ID不一致", ["manual-account-b"], "holding-a", "sub-a"],
    ["保有IDなし", ["manual-account-a"], "", "sub-a"],
    ["sub-account IDなし", ["manual-account-a"], "holding-a", ""],
  ] as const)("%sでは参照を作らない", (_label, pageAccountMfIds, holdingMfId, subAccountMfId) => {
    expect(
      createManualHoldingReference(
        pageAccountMfIds,
        "manual-account-a",
        holdingMfId,
        subAccountMfId,
      ),
    ).toBeNull();
  });
});

describe("buildUniqueManualHoldingAccountMap", () => {
  test("一意な明示キーを口座へ対応付ける", () => {
    expect(
      buildUniqueManualHoldingAccountMap([
        {
          holdingMfId: "holding-a",
          subAccountMfId: "sub-a",
          accountMfId: "manual-account-a",
        },
      ]),
    ).toEqual(new Map([[createManualHoldingKey("holding-a", "sub-a"), "manual-account-a"]]));
  });

  test("同じ明示キーに複数口座候補がある場合は解決しない", () => {
    const result = buildUniqueManualHoldingAccountMap([
      {
        holdingMfId: "holding-a",
        subAccountMfId: "sub-a",
        accountMfId: "manual-account-a",
      },
      {
        holdingMfId: "holding-a",
        subAccountMfId: "sub-a",
        accountMfId: "manual-account-b",
      },
    ]);

    expect(result.size).toBe(0);
  });

  test("同じ口座内の重複候補は一意として扱う", () => {
    const reference = {
      holdingMfId: "holding-a",
      subAccountMfId: "sub-a",
      accountMfId: "manual-account-a",
    };

    expect(buildUniqueManualHoldingAccountMap([reference, reference])).toEqual(
      new Map([[createManualHoldingKey("holding-a", "sub-a"), "manual-account-a"]]),
    );
  });

  test("2つのIDの境界が異なるキーを衝突させない", () => {
    expect(createManualHoldingKey("holding-a|sub", "account-a")).not.toBe(
      createManualHoldingKey("holding-a", "sub|account-a"),
    );
  });
});
