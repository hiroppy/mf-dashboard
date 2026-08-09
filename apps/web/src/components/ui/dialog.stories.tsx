import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Dialog,
  DialogTrigger,
  DialogCloseButton,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./dialog";

const meta = {
  title: "UI/Dialog",
  component: Dialog,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: null,
  },
  render: () => (
    <Dialog>
      <DialogTrigger>
        <button
          type="button"
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
        >
          ダイアログを開く
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>タイトル</DialogTitle>
        <DialogDescription>これはダイアログの説明文です。</DialogDescription>
        <DialogCloseButton className="absolute right-4 top-4" />
      </DialogContent>
    </Dialog>
  ),
};

export const LongContent: Story = {
  args: {
    children: null,
  },
  render: () => (
    <Dialog>
      <DialogTrigger>
        <button
          type="button"
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
        >
          ダイアログを開く
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>長いコンテンツ</DialogTitle>
        <DialogDescription>
          これは長いコンテンツを含むダイアログです。様々な情報を表示することができます。
          ユーザーに重要な情報を伝えたり、確認を求めたりする際に使用します。
        </DialogDescription>
        <div className="mt-4 space-y-2">
          <p className="text-sm">追加のコンテンツをここに配置できます。</p>
          <p className="text-sm">フォームやリストなど、様々な要素を含めることが可能です。</p>
        </div>
      </DialogContent>
    </Dialog>
  ),
};

export const WithoutBackdropBlur: Story = {
  args: {
    children: null,
  },
  render: () => (
    <Dialog>
      <DialogTrigger>
        <button
          type="button"
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
        >
          ダイアログを開く
        </button>
      </DialogTrigger>
      <DialogContent backdropBlur={false}>
        <DialogTitle>背景ぼかしなし</DialogTitle>
        <DialogDescription>
          背景を暗く保ったまま、ぼかしを無効にしたダイアログです。
        </DialogDescription>
      </DialogContent>
    </Dialog>
  ),
};
