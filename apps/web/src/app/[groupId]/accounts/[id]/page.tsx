import type { Metadata } from "next";
import {
  getAllAccountMfIds,
  getAccountByMfId,
  getAllGroups,
  isDatabaseAvailable,
} from "@moneyforward-daily-action/db";
import { AccountDetailContent } from "../../../accounts/[id]/page";

export async function generateStaticParams() {
  if (!isDatabaseAvailable()) return [{ groupId: "_", id: "_" }];
  const groups = getAllGroups().filter((g) => !g.isCurrent);
  if (groups.length === 0) return [{ groupId: "_", id: "_" }];

  const params: { groupId: string; id: string }[] = [];

  for (const group of groups) {
    const mfIds = getAllAccountMfIds(group.id);
    for (const id of mfIds) {
      params.push({ groupId: group.id, id });
    }
  }

  return params;
}

export async function generateMetadata({
  params,
}: PageProps<"/[groupId]/accounts/[id]">): Promise<Metadata> {
  const { id, groupId } = await params;
  const account = getAccountByMfId(id, groupId);
  return {
    title: account?.name ?? "アカウント詳細",
  };
}

export default async function GroupAccountDetailPage({
  params,
}: PageProps<"/[groupId]/accounts/[id]">) {
  const { groupId, id } = await params;

  return <AccountDetailContent id={id} groupId={groupId} />;
}
