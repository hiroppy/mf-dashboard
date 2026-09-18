interface GroupSelectorDisplayProps {
  name: string;
}

export function GroupSelectorDisplay({ name }: GroupSelectorDisplayProps) {
  return <span className="truncate max-w-32 sm:max-w-40">{name}</span>;
}

// 共通のコンテナスタイル
export const groupSelectorContainerClassName =
  "flex min-w-0 items-center gap-2 px-3 py-1 rounded-lg text-sm font-medium";
