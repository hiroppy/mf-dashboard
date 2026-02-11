interface NamedValue {
  name: string;
  value: number;
}

export function consolidateCategories(data: NamedValue[], maxItems: number = 6): NamedValue[] {
  const existingOther = data.find((item) => item.name === "その他");
  const withoutOther = data.filter((item) => item.name !== "その他");

  if (withoutOther.length < maxItems) {
    return existingOther ? [...withoutOther, existingOther] : withoutOther;
  }

  const top = withoutOther.slice(0, maxItems - 1);
  const others = withoutOther.slice(maxItems - 1);
  let othersTotal = others.reduce((sum, item) => sum + item.value, 0);

  if (existingOther) {
    othersTotal += existingOther.value;
  }

  return [...top, { name: "その他", value: othersTotal }];
}

interface RankableItem {
  dailyChange: number;
}

interface RankingResult<T> {
  topGainers: T[];
  topLosers: T[];
  totalChange: number;
}

export function extractRanking<T extends RankableItem>(
  items: T[],
  count: number = 5,
): RankingResult<T> {
  const sorted = [...items].sort((a, b) => b.dailyChange - a.dailyChange);

  const topGainers = sorted.filter((item) => item.dailyChange > 0).slice(0, count);

  const topLosers = sorted
    .filter((item) => item.dailyChange < 0)
    .slice(-count)
    .reverse();

  const totalChange = items.reduce((sum, item) => sum + item.dailyChange, 0);

  return { topGainers, topLosers, totalChange };
}

export function groupAndSum<T>(
  items: T[],
  keyFn: (item: T) => string,
  valueFn: (item: T) => number,
): Map<string, number> {
  const result = new Map<string, number>();

  for (const item of items) {
    const key = keyFn(item);
    const value = valueFn(item);
    result.set(key, (result.get(key) ?? 0) + value);
  }

  return result;
}

export function mapToSortedArray(
  map: Map<string, number>,
  sortDirection: "asc" | "desc" = "desc",
): NamedValue[] {
  const array = Array.from(map.entries()).map(([name, value]) => ({
    name,
    value,
  }));

  return sortDirection === "desc"
    ? array.sort((a, b) => b.value - a.value)
    : array.sort((a, b) => a.value - b.value);
}
