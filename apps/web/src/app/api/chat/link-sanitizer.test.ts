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

  it.each(["[詳細][]", "[詳細]"])(
    "buffers a collapsed or shortcut reference until its definition arrives: %s",
    (reference) => {
      expect(splitCompleteFinanceChatText(`${reference}\n`)).toEqual({
        complete: "",
        pending: `${reference}\n`,
      });
      const text = `${reference}\n[詳細]: /group-a/cf/2026-07\n`;
      expect(splitCompleteFinanceChatText(text)).toEqual({ complete: text, pending: "" });
    },
  );

  it("normalizes whitespace while buffering a reference definition", () => {
    const text = "[詳細][route label]\n[route   label]: /group-a/cf/2026-07\n";
    expect(splitCompleteFinanceChatText(text)).toEqual({ complete: text, pending: "" });
  });

  it("keeps a reference link buffered with its definition when the definition has no newline", () => {
    expect(splitCompleteFinanceChatText("[詳細][route]\n[route]: /group-a/cf/2026-07")).toEqual({
      complete: "",
      pending: "[詳細][route]\n[route]: /group-a/cf/2026-07",
    });
  });

  it("keeps a raw HTML anchor buffered until its closing tag arrives", () => {
    const openingChunk = '<a href="mailto:evil@example.com">詳細。';
    expect(splitCompleteFinanceChatText(openingChunk)).toEqual({
      complete: "",
      pending: openingChunk,
    });
    expect(splitCompleteFinanceChatText(`${openingChunk}</a>続き。`)).toEqual({
      complete: `${openingChunk}</a>続き。`,
      pending: "",
    });
    expect(sanitizeFinanceChatLinks(`${openingChunk}</a>続き。`, new Set())).toBe("詳細。続き。");
  });

  it("closes a self-closing HTML anchor before the next sentence", () => {
    const text = '<a href="javascript:alert(1)"/>メール。続き';
    expect(splitCompleteFinanceChatText(text)).toEqual({
      complete: '<a href="javascript:alert(1)"/>メール。',
      pending: "続き",
    });
  });

  it.each(["前半 <a 後半です。", "`<a` はHTMLタグ例です。"])(
    "streams a literal unterminated anchor opener: %s",
    (text) => {
      expect(splitCompleteFinanceChatText(text)).toEqual({ complete: text, pending: "" });
    },
  );

  it.each([
    '`<a href="/0/cf">` はHTMLタグ例です。',
    '`` `<a href="/0/cf">` `` はHTMLタグ例です。',
    '```html\n<a href="/0/cf">\n```\n続き。',
  ])("streams a raw anchor literal inside Markdown code: %s", (text) => {
    expect(splitCompleteFinanceChatText(text)).toEqual({ complete: text, pending: "" });
  });

  it("keeps a blockquoted fenced code block together", () => {
    const text = "> ~~~\n> https://example.com\n> ~~~\n";
    expect(splitCompleteFinanceChatText(text)).toEqual({ complete: text, pending: "" });
  });

  it("ignores a backtick fence-looking line inside a tilde fence", () => {
    const text = "~~~\n```\n~~~\n次の文です。";
    expect(splitCompleteFinanceChatText(text)).toEqual({ complete: text, pending: "" });
  });

  it("buffers a trailing newline until indented-block context is known", () => {
    expect(splitCompleteFinanceChatText("paragraph\n")).toEqual({
      complete: "",
      pending: "paragraph\n",
    });
    expect(splitCompleteFinanceChatText("paragraph\n    https://attacker.example")).toEqual({
      complete: "",
      pending: "paragraph\n    https://attacker.example",
    });
  });

  it("buffers a reference after an escaped image marker", () => {
    const text = "\\![詳細][]\n中間です。";
    expect(splitCompleteFinanceChatText(text)).toEqual({ complete: "", pending: text });
  });

  it("does not close a Markdown code span with a longer backtick run", () => {
    const text = '``example ``` <a href="/0/cf">literal</a> ``。';
    expect(splitCompleteFinanceChatText(text)).toEqual({ complete: text, pending: "" });
  });

  it("keeps a quoted self-closing marker inside an anchor opener buffered", () => {
    const text = '<a title="/>。';
    expect(splitCompleteFinanceChatText(text)).toEqual({ complete: "", pending: text });
  });

  it.each([
    ["\\\\[x](javascript:alert(1)。", "", "\\\\[x](javascript:alert(1)。"],
    ["\\\\`危険。`続き。", "\\\\`危険。`続き。", ""],
  ])("uses backslash parity before streamed Markdown syntax: %s", (text, complete, pending) => {
    expect(splitCompleteFinanceChatText(text)).toEqual({ complete, pending });
  });
});

describe("createFinanceChatLinkSanitizer", () => {
  it("buffers and sanitizes a Markdown link after an even backslash run", async () => {
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
    const readPromise = (async () => {
      for (;;) {
        const result = await reader.read();
        if (result.done) return;
      }
    })();

    await writer.write({ type: "text-start", id: "text-a" });
    await writer.write({
      type: "text-delta",
      id: "text-a",
      text: "\\\\[x](javascript:alert(1)。",
    });
    expect(onSanitizedText).not.toHaveBeenCalled();

    await writer.write({ type: "text-delta", id: "text-a", text: ")。" });
    expect(onSanitizedText).toHaveBeenCalledWith("\\\\x。");

    await writer.write({ type: "text-end", id: "text-a" });
    await writer.close();
    await readPromise;
  });

  it("streams past an unmatched quote in a raw anchor label", async () => {
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
    const readPromise = (async () => {
      for (;;) {
        const result = await reader.read();
        if (result.done) return;
      }
    })();

    await writer.write({ type: "text-start", id: "text-a" });
    await writer.write({
      type: "text-delta",
      id: "text-a",
      text: '<a href="/group-a/cf/2026-07">don',
    });
    await writer.write({ type: "text-delta", id: "text-a", text: "'t</a>。続き。" });

    expect(onSanitizedText).toHaveBeenCalledWith("don't。続き。");

    await writer.write({ type: "text-end", id: "text-a" });
    await writer.close();
    await readPromise;
  });

  it.each(["<a\n", "<a title\n"])(
    "buffers a partial raw anchor opening across a streamed newline: %s",
    async (opening) => {
      const transform = createFinanceChatLinkSanitizer("group-a")({
        stopStream: vi.fn<() => void>(),
        tools: {},
      });
      const reader = transform.readable.getReader();
      const writer = transform.writable.getWriter();
      const chunks: Array<{ type: string; text?: string }> = [];
      const readPromise = (async () => {
        for (;;) {
          const result = await reader.read();
          if (result.done) return;
          chunks.push(result.value);
        }
      })();

      await writer.write({ type: "text-start", id: "text-a" });
      await writer.write({ type: "text-delta", id: "text-a", text: opening });
      expect(chunks.filter((chunk) => chunk.type === "text-delta")).toEqual([]);
      await writer.write({
        type: "text-delta",
        id: "text-a",
        text: 'href="javascript:alert(1)">click</a>。',
      });
      await writer.write({ type: "text-end", id: "text-a" });
      await writer.close();
      await readPromise;

      expect(
        chunks
          .filter((chunk) => chunk.type === "text-delta")
          .map((chunk) => chunk.text)
          .join(""),
      ).toBe("click。");
    },
  );

  it.each([
    ["```html\n", '<a href="javascript:alert(1)">example</a>\n```'],
    ["```html\n", '<a href="javascript:alert(1)">example</a>\n````'],
    ["~~~html\n", '<a href="javascript:alert(1)">example</a>\n~~~~'],
  ])("preserves fenced-code state across streamed fragments: %s", async (opening, body) => {
    const transform = createFinanceChatLinkSanitizer("group-a")({
      stopStream: vi.fn<() => void>(),
      tools: {},
    });
    const reader = transform.readable.getReader();
    const writer = transform.writable.getWriter();
    const chunks: Array<{ type: string; text?: string }> = [];
    const readPromise = (async () => {
      for (;;) {
        const result = await reader.read();
        if (result.done) return;
        chunks.push(result.value);
      }
    })();

    await writer.write({ type: "text-start", id: "text-a" });
    await writer.write({ type: "text-delta", id: "text-a", text: opening });
    await writer.write({
      type: "text-delta",
      id: "text-a",
      text: body,
    });
    await writer.write({ type: "text-end", id: "text-a" });
    await writer.close();
    await readPromise;

    expect(
      chunks
        .filter((chunk) => chunk.type === "text-delta")
        .map((chunk) => chunk.text)
        .join(""),
    ).toBe(opening + body);
  });

  it("retains a reference definition emitted before its use", async () => {
    const transform = createFinanceChatLinkSanitizer("group-a")({
      stopStream: vi.fn<() => void>(),
      tools: {},
    });
    const reader = transform.readable.getReader();
    const writer = transform.writable.getWriter();
    const chunks: Array<{ type: string; text?: string }> = [];
    const readPromise = (async () => {
      for (;;) {
        const result = await reader.read();
        if (result.done) return;
        chunks.push(result.value);
      }
    })();

    await writer.write({
      type: "tool-result",
      toolCallId: "route-a",
      toolName: "getFinanceDashboardRoute",
      input: {},
      output: { href: "/group-a/cf/2026-07" },
    });
    await writer.write({ type: "text-start", id: "text-a" });
    await writer.write({
      type: "text-delta",
      id: "text-a",
      text: "[route]: /group-a/cf/2026-07\n",
    });
    await writer.write({
      type: "text-delta",
      id: "text-a",
      text: "[route]: /group-a/bs\n",
    });
    await writer.write({ type: "text-delta", id: "text-a", text: "[詳細][route]\n" });
    await writer.write({ type: "text-end", id: "text-a" });
    await writer.close();
    await readPromise;

    expect(
      chunks
        .filter((chunk) => chunk.type === "text-delta")
        .map((chunk) => chunk.text)
        .join(""),
    ).toBe("[詳細](/group-a/cf/2026-07)\n");
  });

  it("does not retain a reference definition from fenced code", async () => {
    const transform = createFinanceChatLinkSanitizer("group-a")({
      stopStream: vi.fn<() => void>(),
      tools: {},
    });
    const reader = transform.readable.getReader();
    const writer = transform.writable.getWriter();
    const chunks: Array<{ type: string; text?: string }> = [];
    const readPromise = (async () => {
      for (;;) {
        const result = await reader.read();
        if (result.done) return;
        chunks.push(result.value);
      }
    })();

    await writer.write({
      type: "tool-result",
      toolCallId: "route-a",
      toolName: "getFinanceDashboardRoute",
      input: {},
      output: { href: "/group-a/cf/2026-07" },
    });
    await writer.write({ type: "text-start", id: "text-a" });
    await writer.write({
      type: "text-delta",
      id: "text-a",
      text: "```\n[route]: /group-a/cf/2026-07\n```\n",
    });
    await writer.write({ type: "text-delta", id: "text-a", text: "[詳細][route]\n" });
    await writer.write({ type: "text-end", id: "text-a" });
    await writer.close();
    await readPromise;

    expect(
      chunks
        .filter((chunk) => chunk.type === "text-delta")
        .map((chunk) => chunk.text)
        .join(""),
    ).toBe("```\n[route]: /group-a/cf/2026-07\n```\n詳細\n");
  });

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
