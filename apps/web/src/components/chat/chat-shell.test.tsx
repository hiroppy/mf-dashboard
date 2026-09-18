import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as chatProvider from "./chat-provider";
import { ChatShell } from "./chat-shell";

const { ChatProvider } = chatProvider;

afterEach(() => {
  vi.restoreAllMocks();
});

const assistantMessage = {
  id: "assistant-response",
  role: "assistant" as const,
  parts: [
    {
      type: "text" as const,
      text: "6月10日の支出は3,200円です。\n\n[6月の収支を確認](/group-a/cf/2026-06)",
    },
    {
      type: "tool-getFinanceDashboardRoute" as const,
      toolCallId: "navigate-a",
      state: "output-available" as const,
      input: { page: "cashFlow", month: "2026-06" },
      output: { href: "/group-a/cf/2026-06" },
    },
  ],
};

describe("ChatShell", () => {
  it("uses a wide default panel", () => {
    render(
      <ChatProvider initialOpen>
        <ChatShell />
      </ChatProvider>,
    );

    expect(screen.getByLabelText("家計AIチャット").getAttribute("style")).toContain(
      "--chat-panel-width: 640px",
    );
  });

  it("shows an accessible configuration hint when chat fails", () => {
    vi.spyOn(chatProvider, "useFinanceChat").mockReturnValue({
      addUserMessage: vi.fn<(text: string) => void>(),
      clear: vi.fn<() => void>(),
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
      "回答を取得できませんでした。AI設定と接続状況を確認してください。",
    );
    expect(screen.queryByText("secret provider response")).toBeNull();
  });

  it("shows actionable guidance for a conversation size error", () => {
    vi.spyOn(chatProvider, "useFinanceChat").mockReturnValue({
      addUserMessage: vi.fn<(text: string) => void>(),
      clear: vi.fn<() => void>(),
      close: vi.fn<() => void>(),
      draft: "",
      error: new Error(JSON.stringify({ error: { code: "REQUEST_TOO_LARGE" } })),
      isOpen: true,
      isSubmitting: false,
      messages: [],
      open: vi.fn<() => void>(),
      setDraft: vi.fn<(draft: string) => void>(),
    });

    render(<ChatShell />);

    expect(screen.getByRole("alert").textContent).toContain(
      "ページを再読み込みして新しい会話を始めてください。",
    );
  });

  it("shows retry guidance when chat concurrency is full", () => {
    vi.spyOn(chatProvider, "useFinanceChat").mockReturnValue({
      addUserMessage: vi.fn<(text: string) => void>(),
      clear: vi.fn<() => void>(),
      close: vi.fn<() => void>(),
      draft: "",
      error: new Error(JSON.stringify({ error: { code: "CHAT_BUSY" } })),
      isOpen: true,
      isSubmitting: false,
      messages: [],
      open: vi.fn<() => void>(),
      setDraft: vi.fn<(draft: string) => void>(),
    });

    render(<ChatShell />);

    expect(screen.getByRole("alert").textContent).toContain(
      "しばらく待ってからもう一度お試しください。",
    );
  });

  it("blocks another submission while a response is in progress", () => {
    const addUserMessage = vi.fn<(text: string) => void>();
    vi.spyOn(chatProvider, "useFinanceChat").mockReturnValue({
      addUserMessage,
      clear: vi.fn<() => void>(),
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

  it("follows streaming updates only while the user remains near the bottom", () => {
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight",
    );
    const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientHeight",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      value: 480,
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      value: 200,
    });
    const chatState: ReturnType<typeof chatProvider.useFinanceChat> = {
      addUserMessage: vi.fn<(text: string) => void>(),
      clear: vi.fn<() => void>(),
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
    };
    vi.spyOn(chatProvider, "useFinanceChat").mockImplementation(() => chatState);

    const { rerender } = render(<ChatShell />);

    const messageLog = screen.getByRole("log");
    expect(messageLog.classList.contains("overscroll-contain")).toBe(true);
    expect(messageLog.scrollTop).toBe(480);

    messageLog.scrollTop = 100;
    fireEvent.scroll(messageLog);
    chatState.messages = [
      {
        ...chatState.messages[0],
        parts: [{ type: "text", text: "最新の回答を更新" }],
      },
    ];
    rerender(<ChatShell />);
    expect(messageLog.scrollTop).toBe(100);

    messageLog.scrollTop = 250;
    fireEvent.scroll(messageLog);
    chatState.messages = [
      {
        ...chatState.messages[0],
        parts: [{ type: "text", text: "最下部付近でさらに更新" }],
      },
    ];
    rerender(<ChatShell />);
    expect(messageLog.scrollTop).toBe(480);

    if (scrollHeightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "scrollHeight", scrollHeightDescriptor);
    } else {
      delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
    }
    if (clientHeightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "clientHeight", clientHeightDescriptor);
    } else {
      delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
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
    fireEvent.keyDown(screen.getByLabelText("家計AIへのメッセージ"), {
      key: "Escape",
      isComposing: true,
      keyCode: 229,
    });
    expect(screen.getByLabelText("家計AIチャット").getAttribute("aria-hidden")).toBe("false");
    fireEvent.keyDown(screen.getByLabelText("家計AIへのメッセージ"), { key: "Escape" });

    expect(screen.getByLabelText("家計AIチャット").getAttribute("aria-hidden")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("sends a suggested prompt before the conversation starts", () => {
    const addUserMessage = vi.fn<(text: string) => void>();
    vi.spyOn(chatProvider, "useFinanceChat").mockReturnValue({
      addUserMessage,
      clear: vi.fn<() => void>(),
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
    expect(screen.queryByRole("button", { name: "先月より増えた支出カテゴリは？" })).toBeNull();
    expect(screen.getByLabelText("質問の候補")).toBeTruthy();
  });

  it("does not render an overlong suggested prompt", () => {
    const addUserMessage = vi.fn<(text: string) => void>();
    vi.spyOn(chatProvider, "useFinanceChat").mockReturnValue({
      addUserMessage,
      clear: vi.fn<() => void>(),
      close: vi.fn<() => void>(),
      draft: "",
      isOpen: true,
      isSubmitting: false,
      messages: [],
      open: vi.fn<() => void>(),
      setDraft: vi.fn<(draft: string) => void>(),
    });

    render(<ChatShell suggestedPrompts={["x".repeat(8_001), "資産を確認"]} />);

    expect(screen.queryByRole("button", { name: "x".repeat(8_001) })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "資産を確認" }));
    expect(addUserMessage).toHaveBeenCalledOnce();
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
      clear: vi.fn<() => void>(),
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

  it("keeps an overlong draft out of chat history", () => {
    const addUserMessage = vi.fn<(text: string) => void>();
    const setDraft = vi.fn<(draft: string) => void>();
    vi.spyOn(chatProvider, "useFinanceChat").mockReturnValue({
      addUserMessage,
      clear: vi.fn<() => void>(),
      close: vi.fn<() => void>(),
      draft: "x".repeat(8_001),
      isOpen: true,
      isSubmitting: false,
      messages: [],
      open: vi.fn<() => void>(),
      setDraft,
    });

    render(<ChatShell />);

    const input = screen.getByLabelText("家計AIへのメッセージ") as HTMLTextAreaElement;
    expect(input.maxLength).toBe(8_000);
    expect(
      (screen.getByRole("button", { name: "メッセージを送信" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.submit(input.closest("form")!);

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
      clear: vi.fn<() => void>(),
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

    expect(localStorageSpy).not.toHaveBeenCalled();
    localStorageSpy.mockRestore();
  });

  it("renders assistant text and a validated internal link", () => {
    render(
      <ChatProvider initialMessages={[assistantMessage]} initialOpen>
        <ChatShell />
      </ChatProvider>,
    );

    expect(screen.getByText("6月10日の支出は3,200円です。")).toBeTruthy();
    expect(screen.getByRole("link", { name: "6月の収支を確認" }).getAttribute("href")).toBe(
      "/group-a/cf/2026-06",
    );
  });

  it("renders a validated chart tool output without a decorative card", () => {
    render(
      <ChatProvider
        initialMessages={[
          {
            id: "assistant-chart",
            role: "assistant",
            parts: [
              {
                type: "tool-presentChart",
                toolCallId: "chart-a",
                state: "output-available",
                input: {
                  title: "月別の支出",
                  chartType: "bar",
                  series: [{ name: "支出", amountType: "expense" }],
                  data: [
                    { label: "6月", values: [280_000] },
                    { label: "7月", values: [310_000] },
                  ],
                },
                output: {
                  title: "月別の支出",
                  chartType: "bar",
                  series: [{ name: "支出", amountType: "expense" }],
                  data: [
                    { label: "6月", values: [280_000] },
                    { label: "7月", values: [310_000] },
                  ],
                },
              },
            ],
          },
        ]}
        initialOpen
      >
        <ChatShell />
      </ChatProvider>,
    );

    expect(screen.getByRole("figure", { name: "月別の支出" })).toBeTruthy();
    expect(screen.getByText("6月: 支出: 280,000円")).toBeTruthy();
  });

  it("renders the latest response while streaming", () => {
    const chatState = {
      addUserMessage: vi.fn<(text: string) => void>(),
      clear: vi.fn<() => void>(),
      close: vi.fn<() => void>(),
      draft: "",
      isOpen: true,
      isSubmitting: true as boolean,
      messages: [assistantMessage],
      open: vi.fn<() => void>(),
      setDraft: vi.fn<(draft: string) => void>(),
    };
    vi.spyOn(chatProvider, "useFinanceChat").mockImplementation(() => chatState);

    const { rerender } = render(<ChatShell />);

    expect(screen.getByText("6月10日の支出は3,200円です。")).toBeTruthy();

    chatState.isSubmitting = false;
    rerender(<ChatShell />);

    expect(screen.getByText("6月10日の支出は3,200円です。")).toBeTruthy();
  });

  it("does not expose queryDatabase details after completion", () => {
    render(
      <ChatProvider
        initialMessages={[
          {
            id: "assistant-raw-tool",
            role: "assistant",
            parts: [
              {
                type: "tool-queryDatabase",
                toolCallId: "search-a",
                state: "output-available",
                input: { sql: "SELECT * FROM holdings WHERE type = 'liability'" },
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

    expect(screen.queryByText("SELECT * FROM holdings WHERE type = 'liability'")).toBeNull();
    expect(screen.queryByText("表示しない明細")).toBeNull();
  });

  it("shows only the latest SQL in the loading indicator", () => {
    vi.spyOn(chatProvider, "useFinanceChat").mockReturnValue({
      addUserMessage: vi.fn<(text: string) => void>(),
      clear: vi.fn<() => void>(),
      close: vi.fn<() => void>(),
      draft: "",
      isOpen: true,
      isSubmitting: true,
      messages: [
        {
          id: "assistant-first-query",
          role: "assistant",
          parts: [
            {
              type: "tool-queryDatabase",
              toolCallId: "search-first",
              state: "output-available",
              input: { sql: "SELECT * FROM holdings" },
              output: { rows: [] },
            },
          ],
        },
        {
          id: "assistant-running-query",
          role: "assistant",
          parts: [
            {
              type: "tool-queryDatabase",
              toolCallId: "search-running",
              state: "input-available",
              input: { sql: "SELECT COUNT(*) FROM holdings WHERE type = 'liability'" },
            },
          ],
        },
      ],
      open: vi.fn<() => void>(),
      setDraft: vi.fn<(draft: string) => void>(),
    });

    render(<ChatShell />);

    expect(screen.getByText("SELECT COUNT(*) FROM holdings WHERE type = 'liability'")).toBeTruthy();
    expect(screen.queryByText("SELECT * FROM holdings")).toBeNull();
  });
});
