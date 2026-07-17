import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ChatProvider } from "./chat-provider";
import { ChatShell } from "./chat-shell";

const meta = {
  title: "Chat/ChatProvider",
  component: ChatProvider,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ChatProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithOpenChat: Story = {
  args: {
    children: <ChatShell />,
    initialOpen: true,
  },
};
