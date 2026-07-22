import { describe, expect, it, vi } from "vitest";
import {
  createFinanceChatLinkSanitizer,
  sanitizeFinanceChatLinks,
  splitCompleteFinanceChatText,
} from "./link-sanitizer";

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

  it("does not redirect an unmatched destination to the only verified route", () => {
    expect(
      sanitizeFinanceChatLinks(
        "[詳細を見る](https://attacker.example/anything)",
        new Set(["/group-a/cf/2026-07"]),
      ),
    ).toBe("詳細を見る");
  });

  it("preserves Japanese text immediately following a bare URL", () => {
    expect(sanitizeFinanceChatLinks("https://attacker.exampleです。", new Set())).toBe("です。");
  });

  it("removes a bare URL with an uppercase scheme", () => {
    expect(sanitizeFinanceChatLinks("HTTPS://attacker.example", new Set())).toBe("");
  });

  it.each([".", ","])(
    "preserves trailing punctuation after an allowed bare URL: %s",
    (punctuation) => {
      expect(
        sanitizeFinanceChatLinks(
          `https://example.com/group-a/cf/2026-07${punctuation}`,
          new Set(["/group-a/cf/2026-07"]),
        ),
      ).toBe(`/group-a/cf/2026-07${punctuation}`);
    },
  );
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

  it("does not split at punctuation inside a Markdown link", () => {
    expect(splitCompleteFinanceChatText("[詳細。](/group-b/cf/2026-07)")).toEqual({
      complete: "",
      pending: "[詳細。](/group-b/cf/2026-07)",
    });
  });

  it("releases text after a complete Markdown link boundary", () => {
    expect(splitCompleteFinanceChatText("[詳細。](/group-a/cf/2026-07)です。続き")).toEqual({
      complete: "[詳細。](/group-a/cf/2026-07)です。",
      pending: "続き",
    });
  });

  it("buffers a reference-style link until its definition arrives", () => {
    expect(splitCompleteFinanceChatText("[詳細][route]\n")).toEqual({
      complete: "",
      pending: "[詳細][route]\n",
    });
    expect(splitCompleteFinanceChatText("[詳細][route]\n[route]: /group-a/cf/2026-07\n")).toEqual({
      complete: "[詳細][route]\n[route]: /group-a/cf/2026-07\n",
      pending: "",
    });
  });
});

describe("createFinanceChatLinkSanitizer", () => {
  it("flushes sanitized buffered text before an error chunk", async () => {
    const onSanitizedText = vi.fn<(text: string) => void>();
    const transform = createFinanceChatLinkSanitizer(
      "group-a",
      onSanitizedText,
    )({
      stopStream: vi.fn<() => void>(),
      tools: {},
    });
    const reader = transform.readable.getReader();
    const writer = transform.writable.getWriter();
    const chunks: unknown[] = [];
    const readPromise = (async () => {
      for (;;) {
        const result = await reader.read();
        if (result.done) return;
        chunks.push(result.value);
      }
    })();

    await writer.write({ type: "text-start", id: "text-a" });
    await writer.write({ type: "text-delta", id: "text-a", text: "生成途中" });
    await writer.write({ type: "error", error: new Error("provider failed") });
    await writer.close();
    await readPromise;

    expect(onSanitizedText).toHaveBeenCalledWith("生成途中");
    expect(chunks).toEqual([
      { type: "text-start", id: "text-a" },
      { type: "text-delta", id: "text-a", text: "生成途中" },
      { type: "error", error: expect.any(Error) },
    ]);
  });
});
