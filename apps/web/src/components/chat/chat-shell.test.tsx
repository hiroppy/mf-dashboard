import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatProvider } from "./chat-provider";
import { ChatShell } from "./chat-shell";

describe("ChatShell", () => {
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
});
