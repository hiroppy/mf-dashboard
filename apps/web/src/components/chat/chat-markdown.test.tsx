import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatMarkdown } from "./chat-markdown";

describe("ChatMarkdown", () => {
  it("renders Markdown structure and safe dashboard links", () => {
    render(
      <ChatMarkdown allowedHrefs={["/group-a/cf/2026-06"]}>{`支出は以下の通りです：

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

  it("renders unverified external links as plain text", () => {
    render(<ChatMarkdown>{"[外部リンク](https://example.com/)"}</ChatMarkdown>);

    expect(screen.queryByRole("link", { name: "外部リンク" })).toBeNull();
    expect(screen.getByText("外部リンク")).toBeTruthy();
  });

  it.each([
    "www.example.com",
    "user@example.com",
    "[外部リンク][external]\n\n[external]: https://example.com/",
  ])("renders GFM and reference links as plain text: %s", (markdown) => {
    render(<ChatMarkdown>{markdown}</ChatMarkdown>);

    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders an unverified internal route as plain text", () => {
    render(
      <ChatMarkdown allowedHrefs={["/group-a/cf/2026-06"]}>
        {"[別グループ](/group-b/cf/2026-06)"}
      </ChatMarkdown>,
    );

    expect(screen.queryByRole("link", { name: "別グループ" })).toBeNull();
    expect(screen.getByText("別グループ")).toBeTruthy();
  });

  it("omits Markdown images and their blocked placeholders", () => {
    render(<ChatMarkdown>{"![追跡画像](https://tracker.example/pixel)"}</ChatMarkdown>);

    expect(document.querySelector("img")).toBeNull();
    expect(screen.queryByText("追跡画像")).toBeNull();
    expect(screen.queryByText(/Image blocked/)).toBeNull();
  });

  it("renders strong emphasis next to Japanese text", () => {
    render(<ChatMarkdown>最も高い支出は**¥75,000**です。</ChatMarkdown>);

    expect(screen.getByText("¥75,000").closest("strong")).toBeTruthy();
  });

  it("emphasizes section headings", () => {
    render(<ChatMarkdown>{"## 支出の内訳"}</ChatMarkdown>);

    const heading = screen.getByRole("heading", { level: 2, name: "支出の内訳" });
    expect(heading.classList.contains("text-base")).toBe(true);
    expect(heading.classList.contains("font-semibold")).toBe(true);
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
