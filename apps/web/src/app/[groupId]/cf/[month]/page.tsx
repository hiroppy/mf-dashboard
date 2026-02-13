import type { Metadata } from "next";
import {
  getAllGroups,
  getAvailableMonths,
  isDatabaseAvailable,
} from "@moneyforward-daily-action/db";
import { formatMonth } from "../../../../lib/format";
import { CFMonthContent } from "../../../cf/[month]/page";

export async function generateStaticParams() {
  if (!isDatabaseAvailable()) return [{ groupId: "_", month: "_" }];
  const groups = getAllGroups().filter((g) => !g.isCurrent);
  if (groups.length === 0) return [{ groupId: "_", month: "_" }];

  const params: { groupId: string; month: string }[] = [];

  for (const group of groups) {
    const months = getAvailableMonths(group.id);
    for (const { month } of months) {
      params.push({ groupId: group.id, month });
    }
  }

  return params;
}

export async function generateMetadata({
  params,
}: PageProps<"/[groupId]/cf/[month]">): Promise<Metadata> {
  const { month } = await params;
  return {
    title: `収支 - ${formatMonth(month)}`,
  };
}

export default async function GroupCFMonthPage({ params }: PageProps<"/[groupId]/cf/[month]">) {
  const { groupId, month } = await params;

  return <CFMonthContent month={month} groupId={groupId} />;
}
