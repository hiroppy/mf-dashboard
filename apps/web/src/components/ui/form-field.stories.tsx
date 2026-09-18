import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { FormField } from "./form-field";
import { Input } from "./input";
import { NumberField } from "./number-field";

const meta = {
  title: "UI/FormField",
  component: FormField,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Text: Story = {
  args: {
    label: "内容",
    htmlFor: "form-field-content",
    children: <Input id="form-field-content" placeholder="入力してください" />,
  },
};

export const Number: Story = {
  args: {
    label: "金額",
    htmlFor: "form-field-amount",
    description: "1円単位で入力できます",
    children: <NumberField id="form-field-amount" defaultValue={10_000} suffix="円" />,
  },
};
