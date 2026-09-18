import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Wallet } from "lucide-react";
import {
  Card,
  CardButton,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  CardFooter,
} from "./card";

const meta = {
  title: "UI/Card",
  component: Card,
  tags: ["autodocs"],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle icon={Wallet}>カードタイトル</CardTitle>
        <CardDescription>カードの説明文です</CardDescription>
      </CardHeader>
      <CardContent>
        <p>カードのコンテンツです。</p>
      </CardContent>
      <CardFooter>
        <p className="text-sm text-muted-foreground">フッターテキスト</p>
      </CardFooter>
    </Card>
  ),
};

export const WithAction: Story = {
  render: () => (
    <Card>
      <CardHeader action={<button className="text-sm text-primary">編集</button>}>
        <CardTitle icon={Wallet}>アクション付きカード</CardTitle>
      </CardHeader>
      <CardContent>
        <p>ヘッダーにアクションボタンがあるカードです。</p>
      </CardContent>
    </Card>
  ),
};

export const Button: Story = {
  render: () => (
    <CardButton className="border-primary/30 p-4 hover:border-primary">
      クリックできるカード
    </CardButton>
  ),
};
