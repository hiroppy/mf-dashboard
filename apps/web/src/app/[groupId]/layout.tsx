import { getAllGroups, isDatabaseAvailable } from "@moneyforward-daily-action/db";
import { notFound } from "next/navigation";

export async function generateStaticParams() {
  if (!isDatabaseAvailable()) return [{ groupId: "_" }];
  const groups = getAllGroups();
  const nonCurrent = groups.filter((g) => !g.isCurrent);
  if (nonCurrent.length === 0) return [{ groupId: "_" }];
  return nonCurrent.map((group) => ({ groupId: group.id }));
}

export default async function GroupLayout({ children, params }: LayoutProps<"/[groupId]">) {
  const { groupId } = await params;
  const groups = getAllGroups();
  const group = groups.find((g) => g.id === groupId);

  if (!group) {
    notFound();
  }

  return <>{children}</>;
}
