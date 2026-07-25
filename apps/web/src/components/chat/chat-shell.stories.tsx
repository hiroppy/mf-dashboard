import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { ChatProvider } from "./chat-provider";
import { ChatShell } from "./chat-shell";

const meta = {
  title: "Chat/ChatShell",
  component: ChatShell,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ChatShell>;

export default meta;
type Story = StoryObj<typeof meta>;

const response = {
  id: "assistant-response",
  role: "assistant" as const,
  parts: [{ type: "text" as const, text: "6月10日の支出は合計3,200円でした。" }],
};

export const Closed: Story = {
  render: () => (
    <ChatProvider>
      <ChatShell />
    </ChatProvider>
  ),
};

export const Open: Story = {
  render: () => (
    <ChatProvider initialOpen>
      <ChatShell />
    </ChatProvider>
  ),
};

export const Response: Story = {
  render: () => (
    <ChatProvider initialMessages={[response]} initialOpen>
      <ChatShell />
    </ChatProvider>
  ),
};

export const ClearHistory: Story = {
  render: () => (
    <ChatProvider initialMessages={[response]} initialOpen>
      <ChatShell />
    </ChatProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "チャットをクリア" }));
    await expect(page.getByRole("dialog")).toBeInTheDocument();
    await expect(page.getByText("チャットをクリアしますか？")).toBeInTheDocument();
    await userEvent.click(page.getByRole("button", { name: "クリア" }));
    await expect(canvas.queryByText(response.parts[0].text)).not.toBeInTheDocument();
    await expect(canvas.getByText("家計の相談を始めましょう")).toBeInTheDocument();
  },
};

export const Interaction: Story = {
  render: () => (
    <ChatProvider>
      <ChatShell />
    </ChatProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "家計AIチャットを開く" });

    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByLabelText("家計AIチャット")).toHaveAttribute("aria-hidden", "false");
  },
};
