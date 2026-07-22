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
      expect(sanitizeFinanceChatLinks(text, allowedHrefs)).toBe("。");
    },
  );
});

describe("collectFinanceChatLinks", () => {
  it.each([
    ["https://例.exampleです。", "https://例.exampleです"],
    ["<https://例.example/path>。", "https://例.example/path"],
  ])("collects a Unicode-host bare or autolink URL: %s", (text, expected) => {
    expect(collectFinanceChatLinks(text)).toContain(expected);
  });
});
