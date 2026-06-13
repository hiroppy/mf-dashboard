import { describe, expect, test } from "vitest";
import { getHistoryMonth } from "./history-months.js";

describe("getHistoryMonth", () => {
  test("月末でも前月にロールオーバーしない", () => {
    const now = new Date("2026-03-31T12:00:00+09:00");

    expect(getHistoryMonth(now, 0)).toBe("2026-03");
    expect(getHistoryMonth(now, 1)).toBe("2026-02");
    expect(getHistoryMonth(now, 2)).toBe("2026-01");
  });

  test("年をまたいだ履歴月を計算する", () => {
    const now = new Date("2026-01-31T12:00:00+09:00");

    expect(getHistoryMonth(now, 1)).toBe("2025-12");
    expect(getHistoryMonth(now, 2)).toBe("2025-11");
  });

  test("UTC環境でもJST基準の年月を使う", () => {
    const now = new Date("2026-06-30T21:50:00Z");

    expect(getHistoryMonth(now, 0)).toBe("2026-07");
    expect(getHistoryMonth(now, 1)).toBe("2026-06");
  });
});
