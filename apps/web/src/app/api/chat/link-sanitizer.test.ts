import { describe, expect, it } from "vitest";
import { sanitizeFinanceChatLinks, splitCompleteFinanceChatText } from "./link-sanitizer";

describe("sanitizeFinanceChatLinks", () => {
  it("keeps routes returned by the navigation tool", () => {
    expect(
      sanitizeFinanceChatLinks(
        "[詳細を見る](/group-a/cf/2026-07)",
        new Set(["/group-a/cf/2026-07"]),
      ),
    ).toBe("[詳細を見る](/group-a/cf/2026-07)");
  });

  it.each(["https://example.com/group-a/cf/2026-07", "http://0.0.0.0:3000/group-a/cf/2026-07"])(
    "replaces an absolute dashboard URL with its verified route: %s",
    (url) => {
      expect(
        sanitizeFinanceChatLinks(`[詳細を見る](${url})`, new Set(["/group-a/cf/2026-07"])),
      ).toBe("[詳細を見る](/group-a/cf/2026-07)");
    },
  );

  it("removes link markup when no verified route exists", () => {
    expect(sanitizeFinanceChatLinks("[詳細を見る](https://example.com/unknown)", new Set())).toBe(
      "詳細を見る",
    );
  });

  it("does not replace a route with a different group when multiple routes exist", () => {
    expect(
      sanitizeFinanceChatLinks(
        "[詳細を見る](/group-b/cf/2026-07)",
        new Set(["/group-a/cf/2026-07", "/group-a/insights"]),
      ),
    ).toBe("詳細を見る");
  });
});

describe("splitCompleteFinanceChatText", () => {
  it("releases complete sentences while retaining an unfinished suffix", () => {
    expect(splitCompleteFinanceChatText("総資産を確認しました。詳しい内訳は")).toEqual({
      complete: "総資産を確認しました。",
      pending: "詳しい内訳は",
    });
  });

  it("keeps incomplete text buffered", () => {
    expect(splitCompleteFinanceChatText("総資産を確認中")).toEqual({
      complete: "",
      pending: "総資産を確認中",
    });
  });

  it("releases complete Markdown lines for progressive rendering", () => {
    expect(splitCompleteFinanceChatText("## サマリー\n次の行")).toEqual({
      complete: "## サマリー\n",
      pending: "次の行",
    });
  });
});
