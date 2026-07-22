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

  it.each(["https://例.exampleです。", "<https://例.example/path>。"])(
    "removes a Unicode-host bare or autolink URL: %s",
    (text) => {
      expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe(
        text.startsWith("<") ? "。" : "です。",
      );
    },
  );

  it("removes a reference-style link with a non-route URI", () => {
    expect(
      sanitizeFinanceChatLinks("[メール][ref]\n\n[ref]: mailto:evil@example.com", allowedHrefs),
    ).toBe("メール\n\n");
  });

  it("resolves a reference-style link with an allowlisted route", () => {
    expect(sanitizeFinanceChatLinks("[詳細][route]\n\n[route]: /0/cf/2026-07", allowedHrefs)).toBe(
      "[詳細](/0/cf/2026-07)\n\n",
    );
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

  it("respects a quoted greater-than sign when removing a dangerous raw HTML anchor", () => {
    expect(
      sanitizeFinanceChatLinks('<a title=">" href="javascript:alert(1)">click</a>', allowedHrefs),
    ).toBe("click");
  });

  it.each([
    ['<a href="mailto:evil@example.com">メール', "メール"],
    ['<a href="javascript:alert(1)"/>メール', "メール"],
  ])("removes a malformed raw HTML anchor: %s", (text, expected) => {
    expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe(expected);
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
