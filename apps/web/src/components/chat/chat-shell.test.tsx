import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as chatProvider from "./chat-provider";
import { ChatShell } from "./chat-shell";

const { ChatProvider } = chatProvider;

afterEach(() => {
  vi.restoreAllMocks();
});

const structuredMessage = {
  id: "assistant-structured",
  role: "assistant" as const,
  parts: [
    { type: "text" as const, text: "6月10日の支出です。" },
    {
      type: "tool-presentFinanceCards" as const,
      toolCallId: "present-a",
      state: "output-available" as const,
      input: { cards: [] },
      output: [
        {
          type: "summary" as const,
          title: "6月10日の支出",
          metrics: [{ label: "支出合計", amount: -3_200, amountType: "expense" as const }],
        },
        {
          type: "transactionList" as const,
          title: "支出明細",
          transactions: [
            {
              id: "transaction-a",
              date: "2026-06-10",
              description: "店舗 A",
              category: "食費",
              amount: -3_200,
              amountType: "expense" as const,
            },
          ],
        },
        {
          type: "action" as const,
          title: "月の詳細",
          description: "6月の収支ページを確認できます",
          action: { label: "詳細を見る", href: "/cf/2026-06" },
        },
      ],
    },
  ],
};

describe("ChatShell", () => {
  it("shows an accessible configuration hint when chat fails", () => {
    vi.spyOn(chatProvider, "useFinanceChat").mockReturnValue({
      addUserMessage: vi.fn<(text: string) => void>(),
      close: vi.fn<() => void>(),
      draft: "",
      error: new Error("secret provider response"),
      isOpen: true,
      messages: [],
      open: vi.fn<() => void>(),
      setDraft: vi.fn<(draft: string) => void>(),
    });

    render(<ChatShell />);

    expect(screen.getByRole("alert").textContent).toContain(
      "AI_PROVIDER、AI_MODEL、AI_API_KEYと接続状況を確認してください。",
    );
    expect(screen.queryByText("secret provider response")).toBeNull();
  });

  it("opens, focuses the input, and restores focus after Escape", async () => {
    render(
      <ChatProvider>
        <ChatShell />
      </ChatProvider>,
    );

    const trigger = screen.getByRole("button", { name: "家計AIチャットを開く" });
    fireEvent.click(trigger);
    fireEvent.transitionEnd(screen.getByRole("complementary", { name: "家計AIチャット" }));

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("家計AIへのメッセージ")),
    );
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.getByLabelText("家計AIチャット").getAttribute("aria-hidden")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("keeps the draft and messages when surrounding page content changes", async () => {
    const { rerender } = render(
      <ChatProvider>
        <span>ページ A</span>
        <ChatShell />
      </ChatProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "家計AIチャットを開く" }));
    const input = screen.getByLabelText("家計AIへのメッセージ");
    fireEvent.change(input, { target: { value: "入力途中" } });

    rerender(
      <ChatProvider>
        <span>ページ B</span>
        <ChatShell />
      </ChatProvider>,
    );

    expect((screen.getByLabelText("家計AIへのメッセージ") as HTMLTextAreaElement).value).toBe(
      "入力途中",
    );
    fireEvent.submit(screen.getByLabelText("家計AIへのメッセージ").closest("form")!);
    await waitFor(() => expect(screen.getByText("入力途中")).toBeTruthy());
  });

  it("does not write chat state to browser storage", () => {
    const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");

    render(
      <ChatProvider>
        <ChatShell />
      </ChatProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "家計AIチャットを開く" }));
    fireEvent.change(screen.getByLabelText("家計AIへのメッセージ"), {
      target: { value: "保存しないメッセージ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "メッセージを送信" }));

    expect(localStorageSpy).not.toHaveBeenCalled();
    localStorageSpy.mockRestore();
  });

  it("renders validated structured cards and their CTA", () => {
    render(
      <ChatProvider initialMessages={[structuredMessage]} initialOpen>
        <ChatShell />
      </ChatProvider>,
    );

    expect(screen.getByText("6月10日の支出です。")).toBeTruthy();
    expect(screen.getByText("6月10日の支出")).toBeTruthy();
    expect(screen.getByText("支出明細")).toBeTruthy();
    expect(screen.getByText("店舗 A")).toBeTruthy();
    expect(screen.getByRole("link", { name: /詳細を見る/ }).getAttribute("href")).toBe(
      "/cf/2026-06",
    );
  });

  it("rejects multiple presentation outputs in one response", () => {
    render(
      <ChatProvider
        initialMessages={[
          {
            ...structuredMessage,
            parts: [
              ...structuredMessage.parts,
              {
                type: "tool-presentFinanceCards" as const,
                toolCallId: "present-b",
                state: "output-available" as const,
                input: { cards: [] },
                output: [
                  {
                    type: "empty" as const,
                    title: "該当する支出はありません",
                    description: "別の日付で確認できます",
                    prompts: ["今月の支出を見たい"],
                  },
                ],
              },
            ],
          },
        ]}
        initialOpen
      >
        <ChatShell />
      </ChatProvider>,
    );

    expect(screen.getByText("6月10日の支出です。")).toBeTruthy();
    expect(screen.queryByText("6月10日の支出")).toBeNull();
    expect(screen.queryByText("該当する支出はありません")).toBeNull();
  });

  it("ignores unvalidated or unrelated tool output", () => {
    render(
      <ChatProvider
        initialMessages={[
          {
            id: "assistant-raw-tool",
            role: "assistant",
            parts: [
              {
                type: "tool-searchTransactions",
                toolCallId: "search-a",
                state: "output-available",
                input: {},
                output: { transactions: [{ description: "表示しない明細" }] },
              },
            ],
          },
        ]}
        initialOpen
      >
        <ChatShell />
      </ChatProvider>,
    );

    expect(screen.queryByText("表示しない明細")).toBeNull();
  });
});
