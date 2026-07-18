import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatProvider, useFinanceChat } from "./chat-provider";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn<(...args: unknown[]) => unknown>(),
  usePathname: vi.fn<() => string>(),
}));

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({ messages: [], sendMessage: mocks.sendMessage }),
}));

vi.mock("next/navigation", () => ({
  usePathname: mocks.usePathname,
}));

function ChatSender() {
  const { addUserMessage } = useFinanceChat();

  return <button onClick={() => addUserMessage("家計を見直したい")}>送信</button>;
}

describe("ChatProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });
});
