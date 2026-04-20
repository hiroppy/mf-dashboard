import type { GroupData } from "./scraper.js";
import { isNoGroup, NO_GROUP_ID } from "./scrapers/group.js";

/**
 * クリーンアップ対象のグループIDリストを構築する。
 * groupDataList が空（スクレイピング完全失敗）の場合は null を返し、クリーンアップをスキップする。
 */
export function buildCleanupGroupIds(groupDataList: GroupData[]): { ids: string[] } | null {
  if (groupDataList.length === 0) return null;

  const customGroupIds = groupDataList
    .filter((gd) => !isNoGroup(gd.group.id))
    .map((gd) => gd.group.id);

  return { ids: [...customGroupIds, NO_GROUP_ID] };
}
