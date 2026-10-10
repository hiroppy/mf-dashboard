import { describe, expect, test } from "vitest";
import {
  buildHoldingAccountMap,
  createHoldingAccountFingerprint,
} from "./holding-account-references.js";

describe("createHoldingAccountFingerprint", () => {
  test("deposit and FX balance columns match their detail rows despite reordered institution columns", () => {
    const detail = createHoldingAccountFingerprint(
      "table table-depo",
      ["名称", "残高"],
      [" Asset A ", "1,000円"],
    );
    expect(detail).toBe(
      createHoldingAccountFingerprint(
        "table-depo",
        ["保有金融機関", "名称", "残高"],
        ["Institution A", "Asset A", "1,000円"],
      ),
    );
    expect(detail).toBe(
      createHoldingAccountFingerprint(
        "table-depo",
        ["種類・名称", "残高", "保有金融機関"],
        ["Asset A", "1,000円", "Institution A"],
      ),
    );
  });

  test.each([
    ["table-eq", 9],
    ["table-mf", 8],
    ["table-fx", 5],
  ] as const)(
    "%s matches all core columns and excludes trailing institution or acquisition date",
    (kind, count) => {
      const cells = Array.from({ length: count }, (_, index) => "field-" + index);
      const key = createHoldingAccountFingerprint(kind, [], [...cells, "Institution A"]);
      expect(key).toBe(createHoldingAccountFingerprint(kind, [], [...cells, "2026-01-01"]));
      expect(key).not.toBe(
        createHoldingAccountFingerprint(kind, [], [...cells.slice(0, -1), "changed"]),
      );
      expect(createHoldingAccountFingerprint(kind, [], cells.slice(0, -1))).toBeNull();
    },
  );

  test("rejects unsupported, headerless, empty and incomplete rows", () => {
    expect(createHoldingAccountFingerprint("table-other", [], ["Asset A", "1"])).toBeNull();
    expect(createHoldingAccountFingerprint("table-depo", [], ["Asset A", "1"])).toBeNull();
    expect(createHoldingAccountFingerprint("table-depo", ["名称", "残高"], ["", "1"])).toBeNull();
    expect(createHoldingAccountFingerprint("table-depo", ["名称", "残高"], ["Asset A"])).toBeNull();
  });
});

describe("buildHoldingAccountMap", () => {
  test("assigns the detail page account ID only to uniquely matched complete rows", () => {
    const source = {
      complete: true,
      references: [
        { fingerprint: "stock-a", accountMfId: "account-a" },
        { fingerprint: "cash-b", accountMfId: "account-b" },
      ],
    };
    expect([...buildHoldingAccountMap(["stock-a", "cash-b", "unmatched"], source)]).toEqual([
      ["stock-a", "account-a"],
      ["cash-b", "account-b"],
    ]);
  });

  test("does not guess when identical rows belong to different accounts", () => {
    expect(
      buildHoldingAccountMap(["same", "same"], {
        complete: true,
        references: [
          { fingerprint: "same", accountMfId: "account-a" },
          { fingerprint: "same", accountMfId: "account-b" },
        ],
      }).size,
    ).toBe(0);
  });

  test("preserves multiplicity even when duplicate rows have the same owner", () => {
    const source = {
      complete: true,
      references: [
        { fingerprint: "same", accountMfId: "account-a" },
        { fingerprint: "same", accountMfId: "account-a" },
      ],
    };
    expect(buildHoldingAccountMap(["same", "same"], source).get("same")).toBe("account-a");
    expect(buildHoldingAccountMap(["same"], source).size).toBe(0);
    expect(buildHoldingAccountMap(["same", "same", "same"], source).size).toBe(0);
  });

  test("does not use missing or incomplete detail sources, or empty account IDs", () => {
    expect(buildHoldingAccountMap(["a"]).size).toBe(0);
    expect(
      buildHoldingAccountMap(["a"], {
        complete: false,
        references: [{ fingerprint: "a", accountMfId: "account-a" }],
      }).size,
    ).toBe(0);
    expect(
      buildHoldingAccountMap(["a"], {
        complete: true,
        references: [{ fingerprint: "a", accountMfId: "" }],
      }).size,
    ).toBe(0);
  });
});
