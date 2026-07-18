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

const structuredResponse = {
  id: "assistant-structured",
  role: "assistant" as const,
  parts: [
    { type: "text" as const, text: "6月10日の支出は合計3,200円でした。" },
    {
      type: "tool-presentFinanceCards" as const,
      toolCallId: "present-structured",
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
          title: "6月の詳細",
          description: "月全体の収支と明細を確認できます。",
          action: { label: "収支ページを見る", href: "/cf/2026-06" },
        },
      ],
    },
  ],
};

const emptyResponse = {
  id: "assistant-empty",
  role: "assistant" as const,
  parts: [
    { type: "text" as const, text: "指定された条件の支出は見つかりませんでした。" },
    {
      type: "tool-presentFinanceCards" as const,
      toolCallId: "present-empty",
      state: "output-available" as const,
      input: { cards: [] },
      output: [
        {
          type: "empty" as const,
          title: "支出が見つかりません",
          description: "期間や条件を変えて、もう一度お試しください。",
          prompts: ["今月の支出を見たい", "先月の支出を見たい"],
        },
      ],
    },
  ],
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

export const StructuredResponse: Story = {
  render: () => (
    <ChatProvider initialMessages={[structuredResponse]} initialOpen>
      <ChatShell />
    </ChatProvider>
  ),
};

export const EmptyResponse: Story = {
  render: () => (
    <ChatProvider initialMessages={[emptyResponse]} initialOpen>
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
