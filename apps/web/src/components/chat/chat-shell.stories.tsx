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
