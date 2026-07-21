import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LayoutDashboard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { DashboardLayout } from "./dashboard-layout";

function PreviewCard({ title, className }: { title: string; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle icon={LayoutDashboard}>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-28 rounded-xl bg-muted" />
      </CardContent>
    </Card>
  );
}

const overview = (
  <>
    <PreviewCard title="資産構成" className="lg:col-span-2" />
    <PreviewCard title="今月の収支" />
  </>
);

const meta = {
  title: "Layout/DashboardLayout",
  component: DashboardLayout,
  tags: ["autodocs"],
  args: {
    overview,
    dailyChange: <PreviewCard title="前日比ランキング" />,
    assetHistory: <PreviewCard title="資産推移" />,
    cashFlow: <PreviewCard title="月別収支推移" />,
  },
} satisfies Meta<typeof DashboardLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutInvestments: Story = {
  args: {
    dailyChange: undefined,
  },
};
