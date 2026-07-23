import { describe, expect, it } from "vitest";
import { collectFinanceChatLinks, sanitizeFinanceChatLinks } from "./link-sanitizer";

const allowedHrefs = new Set(["/0/cf/2026-07"]);

describe("sanitizeFinanceChatLinks", () => {
  it("keeps an exact relative allowlisted link", () => {
    expect(sanitizeFinanceChatLinks("[詳細](/0/cf/2026-07)", allowedHrefs)).toBe(
      "[詳細](/0/cf/2026-07)",
    );
  });

  it("normalizes an absolute dashboard link with an allowlisted pathname", () => {
    expect(
      sanitizeFinanceChatLinks("[詳細](https://evil.example/0/cf/2026-07)", allowedHrefs),
    ).toBe("[詳細](/0/cf/2026-07)");
  });

  it("removes and records a destination with nested balanced parentheses", () => {
    const text = "[x](javascript:alert((1)))";
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe("x");
    expect(collectFinanceChatLinks(text)).toContain("javascript:alert((1))");
  });

  it.each(["[foo\\]](javascript:alert(1))", "[foo [bar]](javascript:alert(1))"])(
    "removes and records a destination after an escaped or nested label bracket: %s",
    (text) => {
      expect(sanitizeFinanceChatLinks(text, allowedHrefs)).not.toContain("javascript:");
      expect(collectFinanceChatLinks(text)).toContain("javascript:alert(1)");
    },
  );

  it("recursively strips and records a link nested inside an invalid link label", () => {
    const text = "[outer [inner](/evil)](/invalid)";
    expect(sanitizeFinanceChatLinks(text, new Set())).toBe("outer inner");
    expect(collectFinanceChatLinks(text)).toEqual(expect.arrayContaining(["/invalid", "/evil"]));
  });

  it.each([
    "`[x](https://example.com)`",
    "```md\n[x](https://example.com)\n```",
    "```md\nhttps://example.com\n````",
    '~~~md\nhttps://example.com <a href="javascript:alert(1)">x</a>\n~~~~',
    "```md\nhttps://example.com",
    "~~~md\nuser@example.com",
    "    https://example.com",
    "\tuser@example.com",
    "> ~~~\n> https://example.com\n> ~~~",
    ">     https://example.com",
  ])("preserves a Markdown link literal inside Markdown code: %s", (text) => {
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe(text);
    expect(collectFinanceChatLinks(text)).toEqual([]);
  });

  it("preserves nested fence-like content without restoring it twice", () => {
    const text = "```md\n~~~\nhttps://example.com\n~~~\n```";
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe(text);
    expect(collectFinanceChatLinks(text)).toEqual([]);
  });

  it("does not treat indentation that continues a paragraph as code", () => {
    const text = "paragraph\n    https://attacker.example";
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe("paragraph\n    ");
    expect(collectFinanceChatLinks(text)).toContain("https://attacker.example");
  });

  it("does not treat an escaped backtick as a Markdown code delimiter", () => {
    const text = "\\`https://evil.example``";
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).not.toContain("evil.example");
    expect(collectFinanceChatLinks(text)).toContain("https://evil.example");
  });

  it.each([
    ["\\[外部](https://example.com)", "\\[外部]()"],
    ["\\\\[外部](https://example.com)", "\\\\外部"],
  ])("uses backslash parity before a Markdown link: %s", (text, expected) => {
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe(expected);
    expect(collectFinanceChatLinks(text)).toContain("https://example.com");
  });

  it.each(["https://例.exampleです。", "<https://例.example/path>。"])(
    "removes a Unicode-host bare or autolink URL: %s",
    (text) => {
      expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe(
        text.startsWith("<") ? "。" : "です。",
      );
    },
  );

  it.each(["、", "，"])("preserves prose following a bare URL at %s", (delimiter) => {
    const text = `https://example.com${delimiter}続きです。`;
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe(`${delimiter}続きです。`);
    expect(collectFinanceChatLinks(text)).toContain("https://example.com");
  });

  it("resolves an allowlisted bare URL before Japanese prose after punctuation", () => {
    expect(sanitizeFinanceChatLinks("https://example.com/0/cf/2026-07.を見て", allowedHrefs)).toBe(
      "/0/cf/2026-07.を見て",
    );
  });

  it("removes a reference-style link with a non-route URI", () => {
    expect(
      sanitizeFinanceChatLinks("[メール][ref]\n\n[ref]: mailto:evil@example.com", allowedHrefs),
    ).toBe("メール\n\n");
  });

  it.each(["![x](javascript:alert(1))", "![x][ref]\n\n[ref]: javascript:alert(1)"])(
    "strips a Markdown image destination: %s",
    (text) => {
      expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe(
        text.includes("[ref]") ? "x\n\n" : "x",
      );
      expect(collectFinanceChatLinks(text)).toContain("javascript:alert(1)");
    },
  );

  it("treats a link after an escaped exclamation mark as a normal link", () => {
    const text = "\\![詳細](/0/cf/2026-07)";
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe(text);
    expect(collectFinanceChatLinks(text)).toContain("/0/cf/2026-07");
  });

  it("treats a reference link after an escaped exclamation mark as a normal link", () => {
    const text = "\\![詳細][route]\n\n[route]: /0/cf/2026-07";
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe("\\![詳細](/0/cf/2026-07)\n\n");
  });

  it("resolves a reference-style link with an allowlisted route", () => {
    expect(sanitizeFinanceChatLinks("[詳細][route]\n\n[route]: /0/cf/2026-07", allowedHrefs)).toBe(
      "[詳細](/0/cf/2026-07)\n\n",
    );
  });

  it("does not resolve an escaped reference opening bracket", () => {
    const text = "\\[詳細]\n[詳細]: /0/cf/2026-07";
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe("\\[詳細]\n");
  });

  it("resolves a reference definition inside a blockquote", () => {
    const text = "> [詳細][route]\n> [route]: /0/cf/2026-07";
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe("> [詳細](/0/cf/2026-07)\n");
  });

  it("unwraps an angle-bracketed inline link destination", () => {
    const text = "[詳細](</0/cf/2026-07>)";
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe("[詳細](/0/cf/2026-07)");
    expect(collectFinanceChatLinks(text)).toContain("/0/cf/2026-07");
  });

  it.each(["[詳細][]\n\n[詳細]: /0/cf/2026-07", "[詳細]\n\n[詳細]: /0/cf/2026-07"])(
    "resolves a collapsed or shortcut reference link: %s",
    (text) => {
      expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe("[詳細](/0/cf/2026-07)\n\n");
    },
  );

  it("normalizes whitespace in reference labels", () => {
    expect(
      sanitizeFinanceChatLinks(
        "[詳細][route label]\n\n[route   label]: /0/cf/2026-07",
        allowedHrefs,
      ),
    ).toBe("[詳細](/0/cf/2026-07)\n\n");
  });

  it("uses the first definition when a reference label is defined more than once", () => {
    const text = "[詳細][route]\n\n[route]: /0/cf/2026-07\n[route]: /0/bs";
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe("[詳細](/0/cf/2026-07)\n\n");
  });

  it("preserves prose following a reference definition", () => {
    expect(
      sanitizeFinanceChatLinks(
        "[詳細][route]\n[route]: /0/cf/2026-07\nこのページで確認できます。",
        allowedHrefs,
      ),
    ).toBe("[詳細](/0/cf/2026-07)\nこのページで確認できます。");
  });

  it("removes raw HTML link markup with an unauthorized destination", () => {
    expect(
      sanitizeFinanceChatLinks('<a href="mailto:evil@example.com">メール</a>', allowedHrefs),
    ).toBe("メール");
  });

  it("preserves an escaped raw HTML anchor example", () => {
    const text = '\\<a href="https://example.com">x</a>';
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe(text);
    expect(collectFinanceChatLinks(text)).toEqual([]);
  });

  it("respects a quoted greater-than sign when removing a dangerous raw HTML anchor", () => {
    expect(
      sanitizeFinanceChatLinks('<a title=">" href="javascript:alert(1)">click</a>', allowedHrefs),
    ).toBe("click");
  });

  it("strips a nested dangerous raw HTML anchor from an allowed anchor label", () => {
    const text = '<a href="/0/cf/2026-07"><a href="javascript:alert(1)">evil</a></a>';
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe("[evil](/0/cf/2026-07)");
    expect(collectFinanceChatLinks(text)).toContain("javascript:alert(1)");
  });

  it.each([
    ['<a href="mailto:evil@example.com">メール', "メール"],
    ['<a href="javascript:alert(1)"/>メール', "メール"],
  ])("removes a malformed raw HTML anchor: %s", (text, expected) => {
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe(expected);
  });

  it.each(["前半 <a 後半も表示してほしい。", "`<a` はHTMLタグ例です。"])(
    "preserves a literal unterminated anchor opener: %s",
    (text) => {
      expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe(text);
      expect(collectFinanceChatLinks(text)).toEqual([]);
    },
  );

  it.each([
    '`<a href="javascript:alert(1)">` はHTMLタグ例です。',
    '`` `<a href="javascript:alert(1)">` `` はHTMLタグ例です。',
    '```html\n<a href="javascript:alert(1)">\n```',
  ])("preserves a raw anchor literal inside Markdown code: %s", (text) => {
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe(text);
    expect(collectFinanceChatLinks(text)).toEqual([]);
  });

  it("requires an equal backtick run to close a Markdown code span", () => {
    const text = '``example ``` <a href="javascript:alert(1)">literal</a> ``';
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe(text);
    expect(collectFinanceChatLinks(text)).toEqual([]);
  });

  it.each([
    '`<a href="javascript:alert(1)">click</a>',
    '``<a href="javascript:alert(1)">click</a>`',
  ])("sanitizes a raw anchor after an unmatched code delimiter: %s", (text) => {
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).not.toContain("<a");
    expect(collectFinanceChatLinks(text)).toContain("javascript:alert(1)");
  });

  it.each(["<mailto:evil@example.com>", "<ftp://evil.example/path>"])(
    "removes a non-HTTP URI autolink: %s",
    (text) => {
      expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe("");
    },
  );

  it.each([
    ["www.attacker.exampleです。", "です。"],
    ["<www.attacker.example>。", "。"],
    ["user@example.comへ送信", "へ送信"],
    ["<user@example.com>。", "。"],
  ])("removes an implicit GFM autolink: %s", (text, expected) => {
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe(expected);
  });

  it("preserves ordinary prose containing a colon", () => {
    expect(sanitizeFinanceChatLinks("NISA:100万円です。Note:important", allowedHrefs)).toBe(
      "NISA:100万円です。Note:important",
    );
  });

  it("removes a reference definition continuation title", () => {
    const text = '[詳細][route]\n[route]: /0/cf/2026-07\n  "dashboard"\n続き。';
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe("[詳細](/0/cf/2026-07)\n続き。");
  });
});

describe("collectFinanceChatLinks", () => {
  it.each([
    ["https://例.exampleです。", "https://例.example"],
    ["<https://例.example/path>。", "https://例.example/path"],
  ])("collects a Unicode-host bare or autolink URL: %s", (text, expected) => {
    expect(collectFinanceChatLinks(text)).toContain(expected);
  });

  it("collects a non-route reference definition", () => {
    expect(collectFinanceChatLinks("[メール][ref]\n\n[ref]: mailto:evil@example.com")).toContain(
      "mailto:evil@example.com",
    );
  });

  it("collects a raw HTML link destination", () => {
    expect(collectFinanceChatLinks('<a href="mailto:evil@example.com">メール</a>')).toContain(
      "mailto:evil@example.com",
    );
  });

  it("collects a dangerous raw HTML destination after a quoted greater-than sign", () => {
    expect(collectFinanceChatLinks('<a title=">" href="javascript:alert(1)">click</a>')).toContain(
      "javascript:alert(1)",
    );
  });

  it.each([
    ['<a href="mailto:evil@example.com">メール', "mailto:evil@example.com"],
    ['<a href="javascript:alert(1)"/>メール', "javascript:alert(1)"],
  ])("collects a malformed raw HTML anchor destination: %s", (text, expected) => {
    expect(collectFinanceChatLinks(text)).toContain(expected);
  });

  it.each([
    ["www.attacker.example", "www.attacker.example"],
    ["<www.attacker.example>", "www.attacker.example"],
    ["user@example.com", "mailto:user@example.com"],
    ["<user@example.com>", "mailto:user@example.com"],
  ])("collects an implicit GFM autolink destination: %s", (text, expected) => {
    expect(collectFinanceChatLinks(text)).toContain(expected);
  });
});
