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
      isSubmitting: false,
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

  it("blocks another submission while a response is in progress", () => {
    const addUserMessage = vi.fn<(text: string) => void>();
    vi.spyOn(chatProvider, "useFinanceChat").mockReturnValue({
      addUserMessage,
      close: vi.fn<() => void>(),
      draft: "重ねて送らない",
      isOpen: true,
      isSubmitting: true as boolean,
      messages: [],
      open: vi.fn<() => void>(),
      setDraft: vi.fn<(draft: string) => void>(),
    });

    render(<ChatShell />);

    const submit = screen.getByRole("button", { name: "メッセージを送信" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(submit.closest("form")!);
    expect(addUserMessage).not.toHaveBeenCalled();
    expect(screen.getByRole("status", { name: "家計データを分析中" })).toBeTruthy();
  });

  it("contains scroll chaining and follows the latest message", () => {
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      value: 480,
    });
    vi.spyOn(chatProvider, "useFinanceChat").mockReturnValue({
      addUserMessage: vi.fn<(text: string) => void>(),
      close: vi.fn<() => void>(),
      draft: "",
      isOpen: true,
      isSubmitting: true,
      messages: [
        {
          id: "latest-message",
          role: "assistant",
          parts: [{ type: "text", text: "最新の回答" }],
        },
      ],
      open: vi.fn<() => void>(),
      setDraft: vi.fn<(draft: string) => void>(),
    });

    render(<ChatShell />);

    const messageLog = screen.getByRole("log");
    expect(messageLog.classList.contains("overscroll-contain")).toBe(true);
    expect(messageLog.scrollTop).toBe(480);

    if (scrollHeightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "scrollHeight", scrollHeightDescriptor);
    } else {
      delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
    }
  });

  it("opens, focuses the input, and restores focus after Escape", async () => {
    render(
      <ChatProvider>
        <ChatShell />
      </ChatProvider>,
    );

    const trigger = screen.getByRole("button", { name: "家計AIチャットを開く" });
    fireEvent.click(trigger);

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("家計AIへのメッセージ")),
    );
    fireEvent.keyDown(screen.getByLabelText("家計AIへのメッセージ"), { key: "Escape" });

    expect(screen.getByLabelText("家計AIチャット").getAttribute("aria-hidden")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("sends a suggested prompt before the conversation starts", () => {
    const addUserMessage = vi.fn<(text: string) => void>();
    vi.spyOn(chatProvider, "useFinanceChat").mockReturnValue({
      addUserMessage,
      close: vi.fn<() => void>(),
      draft: "",
      isOpen: true,
      isSubmitting: false,
      messages: [],
      open: vi.fn<() => void>(),
      setDraft: vi.fn<(draft: string) => void>(),
    });

    render(<ChatShell suggestedPrompts={["食費を確認", "資産を確認"]} />);

    fireEvent.click(screen.getByRole("button", { name: "資産を確認" }));

    expect(addUserMessage).toHaveBeenCalledWith("資産を確認");
    expect(screen.queryByRole("button", { name: "先月と比べてどう？" })).toBeNull();
    expect(screen.getByLabelText("質問の候補")).toBeTruthy();
  });

  it("resizes the desktop panel from its left edge", () => {
    render(
      <ChatProvider initialOpen>
        <ChatShell />
      </ChatProvider>,
    );

    const separator = screen.getByRole("button", { name: "チャットの幅を変更" });
    fireEvent.pointerDown(separator, { pointerId: 1 });
    fireEvent.pointerMove(separator, { clientX: 400, pointerId: 1 });
    fireEvent.pointerUp(separator, { pointerId: 1 });

    expect(
      screen.getByRole("complementary", { name: "家計AIチャット" }).getAttribute("style"),
    ).toContain("--chat-panel-width: 624px");
    expect(screen.getByLabelText("家計AIチャット").getAttribute("style")).toContain(
      "--chat-panel-width: 624px",
    );
  });

  it("submits with Enter and inserts a newline with Shift+Enter", () => {
    const addUserMessage = vi.fn<(text: string) => void>();
    const setDraft = vi.fn<(draft: string) => void>();
    vi.spyOn(chatProvider, "useFinanceChat").mockReturnValue({
      addUserMessage,
      close: vi.fn<() => void>(),
      draft: "送信するメッセージ",
      isOpen: true,
      isSubmitting: false,
      messages: [],
      open: vi.fn<() => void>(),
      setDraft,
    });

    render(<ChatShell />);

    const input = screen.getByLabelText("家計AIへのメッセージ");
    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(false);
    expect(addUserMessage).toHaveBeenCalledWith("送信するメッセージ");
    expect(setDraft).toHaveBeenCalledWith("");

    addUserMessage.mockClear();
    setDraft.mockClear();
    expect(fireEvent.keyDown(input, { key: "Enter", shiftKey: true })).toBe(true);
    expect(addUserMessage).not.toHaveBeenCalled();
    expect(setDraft).not.toHaveBeenCalled();
  });

  it.each([
    { isComposing: true, keyCode: 13 },
    { isComposing: false, keyCode: 229 },
  ])("does not submit while an IME conversion is being confirmed", (keyboardState) => {
    const addUserMessage = vi.fn<(text: string) => void>();
    vi.spyOn(chatProvider, "useFinanceChat").mockReturnValue({
      addUserMessage,
      close: vi.fn<() => void>(),
      draft: "変換中",
      isOpen: true,
      isSubmitting: false,
      messages: [],
      open: vi.fn<() => void>(),
      setDraft: vi.fn<(draft: string) => void>(),
    });

    render(<ChatShell />);

    fireEvent.keyDown(screen.getByLabelText("家計AIへのメッセージ"), {
      key: "Enter",
      ...keyboardState,
    });

    expect(addUserMessage).not.toHaveBeenCalled();
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

    expect(screen.queryByText("6月10日の支出です。")).toBeNull();
    expect(screen.getByText("6月10日の支出")).toBeTruthy();
    expect(screen.getByText("支出明細")).toBeTruthy();
    expect(screen.getByText("店舗 A")).toBeTruthy();
    expect(screen.getByRole("link", { name: /詳細を見る/ }).getAttribute("href")).toBe(
      "/cf/2026-06",
    );
  });

  it("waits until streaming finishes before rendering cards for the latest response", () => {
    const chatState = {
      addUserMessage: vi.fn<(text: string) => void>(),
      close: vi.fn<() => void>(),
      draft: "",
      isOpen: true,
      isSubmitting: true as boolean,
      messages: [structuredMessage],
      open: vi.fn<() => void>(),
      setDraft: vi.fn<(draft: string) => void>(),
    };
    vi.spyOn(chatProvider, "useFinanceChat").mockImplementation(() => chatState);

    const { rerender } = render(<ChatShell />);

    expect(screen.queryByText("6月10日の支出です。")).toBeNull();
    expect(screen.queryByText("支出合計")).toBeNull();

    chatState.isSubmitting = false;
    rerender(<ChatShell />);

    expect(screen.getByText("支出合計")).toBeTruthy();
    expect(screen.getByText("支出明細")).toBeTruthy();
    expect(screen.queryByText("6月10日の支出です。")).toBeNull();
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
