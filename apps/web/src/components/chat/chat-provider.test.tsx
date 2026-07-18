import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatProvider, useFinanceChat } from "./chat-provider";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn<(...args: unknown[]) => unknown>(),
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

function DraftEditor() {
  const { draft, setDraft } = useFinanceChat();

  return (
    <input aria-label="下書き" value={draft} onChange={(event) => setDraft(event.target.value)} />
  );
}

describe("ChatProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useChat.mockReturnValue({ messages: [], sendMessage: mocks.sendMessage });
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

  it("sends a null group ID from the current-group route", () => {
    mocks.usePathname.mockReturnValue("/cf");

    render(
      <ChatProvider>
        <ChatSender />
      </ChatProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "送信" }));

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      { text: "家計を見直したい" },
      { body: { groupId: null } },
    );
    expect(mocks.useChat).toHaveBeenCalledWith(
      expect.objectContaining({ id: "finance-chat:current" }),
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
});
