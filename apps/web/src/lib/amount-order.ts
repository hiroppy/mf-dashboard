type SortableAmount = number | null | undefined;
type StableKey = number | string;

function isFiniteAmount(amount: SortableAmount): amount is number {
  return typeof amount === "number" && Number.isFinite(amount);
}

function compareStableKeys(a: StableKey, b: StableKey): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "ja", { numeric: true });
}

export function sortByAmountDescending<T>(
  items: readonly T[],
  getAmount: (item: T) => SortableAmount,
  getStableKey: (item: T) => StableKey,
): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aAmount = getAmount(a.item);
      const bAmount = getAmount(b.item);
      const aIsFinite = isFiniteAmount(aAmount);
      const bIsFinite = isFiniteAmount(bAmount);

      if (aIsFinite !== bIsFinite) return aIsFinite ? -1 : 1;
      if (aIsFinite && bIsFinite && aAmount !== bAmount) return bAmount - aAmount;

      return compareStableKeys(getStableKey(a.item), getStableKey(b.item)) || a.index - b.index;
    })
    .map(({ item }) => item);
}
