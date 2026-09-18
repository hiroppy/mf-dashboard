import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatProvider, prepareChatMessagesForRequest, useFinanceChat } from "./chat-provider";

const mocks = vi.hoisted(() => ({
  clearError: vi.fn<() => void>(),
  sendMessage: vi.fn<(...args: unknown[]) => unknown>(),
  setMessages: vi.fn<(...args: unknown[]) => void>(),
  useChat: vi.fn<(...args: unknown[]) => unknown>(),
  usePathname: vi.fn<() => string>(),
}));

vi.mock("@ai-sdk/react", () => ({
  useChat: mocks.useChat,
}));

vi.mock("next/navigation", () => ({
  usePathname: mocks.usePathname,
}));

function ChatSender() {
  const { addUserMessage } = useFinanceChat();

  return <button onClick={() => addUserMessage("家計を見直したい")}>送信</button>;
}

function DoubleChatSender() {
  const { addUserMessage } = useFinanceChat();

  return (
    <button
      onClick={() => {
        addUserMessage("最初の質問");
        addUserMessage("重複する質問");
      }}
    >
      連続送信
    </button>
  );
}

function DraftEditor() {
  const { draft, setDraft } = useFinanceChat();

  return (
    <input aria-label="下書き" value={draft} onChange={(event) => setDraft(event.target.value)} />
  );
}

function MessageList() {
  const { messages } = useFinanceChat();

  return <div>{messages.map((message) => message.id).join(",")}</div>;
}

describe("ChatProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useChat.mockReturnValue({
      clearError: mocks.clearError,
      messages: [],
      sendMessage: mocks.sendMessage,
      setMessages: mocks.setMessages,
      status: "ready",
    });
  });

  it("removes tool calls and results from the next request history", () => {
    expect(
      prepareChatMessagesForRequest([
        {
          id: "assistant-a",
          role: "assistant",
          metadata: { serverSignature: "signature-a" },
          parts: [
            {
              type: "tool-queryDatabase",
              toolCallId: "query-a",
              state: "output-available",
              input: { sql: "SELECT * FROM holdings" },
              output: { rows: [{ name: "Test Item", amount: 1000 }] },
            },
            {
              type: "text",
              text: "確認結果です。",
              providerMetadata: {
                openai: { itemId: "msg-test", requiredReasoningItemId: "rs-test" },
              },
            },
          ],
        },
        {
          id: "user-b",
          role: "user",
          parts: [{ type: "text", text: "続きを教えて" }],
        },
      ]),
    ).toEqual([
      {
        id: "assistant-a",
        role: "assistant",
        metadata: { serverSignature: "signature-a" },
        parts: [{ type: "text", text: "確認結果です。" }],
      },
      {
        id: "user-b",
        role: "user",
        parts: [{ type: "text", text: "続きを教えて" }],
      },
    ]);
  });

  it("keeps a bounded chart result for a follow-up request", () => {
    const chart = {
      title: "月別支出",
      chartType: "bar" as const,
      unit: "currency" as const,
      series: [{ name: "支出", amountType: "expense" as const }],
      data: [{ label: "2026-07", values: [30_000] }],
    };
    const [message] = prepareChatMessagesForRequest([
      {
        id: "assistant-chart",
        role: "assistant",
        metadata: { serverSignature: "signature-a" },
        parts: [
          {
            type: "tool-presentChart",
            toolCallId: "chart-a",
            state: "output-available",
            input: chart,
            output: chart,
          },
        ],
      },
    ]);

    expect(message).toMatchObject({
      id: "assistant-chart",
      parts: [{ type: "tool-presentChart", input: chart, output: chart }],
    });
  });

  it("keeps only the latest complete exchange and current user message", () => {
    const messages = Array.from({ length: 10 }, (_, index) => [
      {
        id: `user-${index}`,
        role: "user" as const,
        parts: [{ type: "text" as const, text: `質問 ${index}` }],
      },
      {
        id: `assistant-${index}`,
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: `回答 ${index}` }],
      },
    ]).flat();
    messages.push({
      id: "user-current",
      role: "user",
      parts: [{ type: "text", text: "続きの質問" }],
    });

    expect(prepareChatMessagesForRequest(messages).map(({ id }) => id)).toEqual([
      "user-9",
      "assistant-9",
      "user-current",
    ]);
  });

  it("sends the selected group ID from a group page", () => {
    mocks.usePathname.mockReturnValue("/group-b/cf");

    render(
      <ChatProvider>
        <ChatSender />
      </ChatProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "送信" }));

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      { text: "家計を見直したい" },
      { body: { groupId: "group-b" } },
    );
    expect(mocks.useChat).toHaveBeenCalledWith(
      expect.objectContaining({ id: "finance-chat:group-b" }),
    );
  });

  it("blocks duplicate submissions in the same tick", () => {
    mocks.usePathname.mockReturnValue("/group-b/cf");

    render(
      <ChatProvider>
        <DoubleChatSender />
      </ChatProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "連続送信" }));

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      { text: "最初の質問" },
      { body: { groupId: "group-b" } },
    );
  });

  it("clears the messages, draft, and error state", () => {
    function ChatClearer() {
      const { clear, draft, setDraft } = useFinanceChat();

      return (
        <>
          <span>{draft}</span>
          <button onClick={() => setDraft("入力中")}>下書きを入力</button>
          <button onClick={clear}>クリア</button>
        </>
      );
    }

    render(
      <ChatProvider>
        <ChatClearer />
      </ChatProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "下書きを入力" }));
    expect(screen.getByText("入力中")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "クリア" }));

    expect(mocks.setMessages).toHaveBeenCalledWith([]);
    expect(mocks.clearError).toHaveBeenCalledOnce();
    expect(screen.queryByText("入力中")).toBeNull();
  });

  it("resolves the current group on a top-level route", () => {
    mocks.usePathname.mockReturnValue("/cf");

    render(
      <ChatProvider currentGroupId="group-a">
        <ChatSender />
      </ChatProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "送信" }));

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      { text: "家計を見直したい" },
      { body: { groupId: "group-a" } },
    );
    expect(mocks.useChat).toHaveBeenCalledWith(
      expect.objectContaining({ id: "finance-chat:group-a" }),
    );
  });

  it("keeps the current-group chat and draft on its explicit group route", () => {
    mocks.usePathname.mockReturnValue("/cf");
    const { rerender } = render(
      <ChatProvider currentGroupId="group-a">
        <DraftEditor />
      </ChatProvider>,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "下書き" }), {
      target: { value: "引き継ぐ下書き" },
    });

    mocks.usePathname.mockReturnValue("/group-a/cf");
    rerender(
      <ChatProvider currentGroupId="group-a">
        <DraftEditor />
      </ChatProvider>,
    );

    expect(mocks.useChat).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "finance-chat:group-a" }),
    );
    expect((screen.getByRole("textbox", { name: "下書き" }) as HTMLInputElement).value).toBe(
      "引き継ぐ下書き",
    );
  });

  it("isolates the chat ID and draft after the selected group changes", async () => {
    mocks.usePathname.mockReturnValue("/group-a/cf");
    const { rerender } = render(
      <ChatProvider>
        <ChatSender />
        <DraftEditor />
      </ChatProvider>,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "下書き" }), {
      target: { value: "Group A の下書き" },
    });

    mocks.usePathname.mockReturnValue("/group-b/cf");
    rerender(
      <ChatProvider>
        <ChatSender />
        <DraftEditor />
      </ChatProvider>,
    );

    expect(mocks.useChat).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "finance-chat:group-b" }),
    );
    await waitFor(() =>
      expect((screen.getByRole("textbox", { name: "下書き" }) as HTMLInputElement).value).toBe(""),
    );
  });

  it("recreates chat history after the selected group changes", () => {
    mocks.useChat.mockImplementation((options) => {
      const { id } = options as { id: string };
      const [initialId] = useState(id);
      return {
        messages: [{ id: initialId, role: "assistant", parts: [] }],
        sendMessage: mocks.sendMessage,
        status: "ready",
      };
    });
    mocks.usePathname.mockReturnValue("/group-a/cf");
    const { rerender } = render(
      <ChatProvider>
        <MessageList />
      </ChatProvider>,
    );
    expect(screen.getByText("finance-chat:group-a")).not.toBeNull();

    mocks.usePathname.mockReturnValue("/group-b/cf");
    rerender(
      <ChatProvider>
        <MessageList />
      </ChatProvider>,
    );

    expect(screen.getByText("finance-chat:group-b")).not.toBeNull();
    expect(screen.queryByText("finance-chat:group-a")).toBeNull();
  });

  it("allows a new submission after changing groups during an in-flight request", () => {
    mocks.usePathname.mockReturnValue("/group-a/cf");
    const { rerender } = render(
      <ChatProvider>
        <ChatSender />
      </ChatProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "送信" }));

    mocks.usePathname.mockReturnValue("/group-b/cf");
    rerender(
      <ChatProvider>
        <ChatSender />
      </ChatProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "送信" }));

    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
    expect(mocks.sendMessage).toHaveBeenLastCalledWith(
      { text: "家計を見直したい" },
      { body: { groupId: "group-b" } },
    );
  });
});
