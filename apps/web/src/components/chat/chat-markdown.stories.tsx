import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ChatMarkdown } from "./chat-markdown";

const meta = {
  title: "Chat/ChatMarkdown",
  component: ChatMarkdown,
  decorators: [
    (Story) => (
      <div className="max-w-sm rounded-2xl rounded-bl-sm bg-muted p-4 text-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChatMarkdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: `先月の高い出費は以下の通りです：

1. **家賃**: ¥75,000
2. **税金**: ¥15,000

詳細は[収支ページ](/group-a/cf/2026-06)で確認できます。`,
  },
};

export const ExternalLink: Story = {
  args: {
    children: "外部サイトの[リンク](https://example.com/)も表示します。",
  },
};

export const Table: Story = {
  args: {
    children: `先月の支出内訳

| カテゴリ | 金額 | 割合 |
| --- | ---: | ---: |
| 食費 | 49,922円 | 22% |
| 住宅 | 75,000円 | 33.1% |
| 健康・医療 | 16,962円 | 7.5% |`,
  },
};
