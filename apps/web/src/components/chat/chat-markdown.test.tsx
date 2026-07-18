import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatMarkdown } from "./chat-markdown";

describe("ChatMarkdown", () => {
  it("renders Markdown structure and safe dashboard links", () => {
    render(
      <ChatMarkdown>{`支出は以下の通りです：

1. **家賃**: ¥75,000
2. **税金**: ¥15,000

[収支ページ](/group-a/cf/2026-06)`}</ChatMarkdown>,
    );

    expect(screen.getByRole("list").tagName).toBe("OL");
    expect(screen.getByText("家賃").closest("strong")).toBeTruthy();
    expect(screen.getByRole("link", { name: "収支ページ" }).getAttribute("href")).toBe(
      "/group-a/cf/2026-06",
    );
  });

  it("renders external links", () => {
    render(<ChatMarkdown>{"[外部リンク](https://example.com/)"}</ChatMarkdown>);

    const link = screen.getByRole("link", { name: "外部リンク" });
    expect(link.getAttribute("href")).toBe("https://example.com/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders strong emphasis next to Japanese text", () => {
    render(<ChatMarkdown>最も高い支出は**¥75,000**です。</ChatMarkdown>);

    expect(screen.getByText("¥75,000").closest("strong")).toBeTruthy();
  });

  it("renders GFM tables", () => {
    render(
      <ChatMarkdown>{`| カテゴリ | 金額 | 割合 |
| --- | ---: | ---: |
| 食費 | 49,922円 | 22% |
| 住宅 | 75,000円 | 33.1% |`}</ChatMarkdown>,
    );

    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    expect(screen.getByRole("cell", { name: "食費" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "75,000円" })).toBeTruthy();
  });
});
