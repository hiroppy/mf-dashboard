"use client";

import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { buildGroupPath, extractGroupIdFromPath, extractPagePath } from "../../lib/url";
import { cn } from "../../lib/utils";
import { RefreshStatus } from "./action-icons";
import { GroupSelectorDisplay, groupSelectorContainerClassName } from "./group-selector-display";

interface Group {
  id: string;
  name: string;
  isCurrent: boolean;
  lastScrapedAt: string | null;
}

interface GroupSelectorClientProps {
  groups: Group[];
  defaultGroupId: string;
  refreshWorkflowUrl?: string | null;
}

export function GroupSelectorClient({
  groups,
  defaultGroupId,
  refreshWorkflowUrl,
}: GroupSelectorClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const urlGroupId = extractGroupIdFromPath(pathname);
  const validUrlGroupId = urlGroupId && groups.some((g) => g.id === urlGroupId) ? urlGroupId : null;
  const selectedGroupId = validUrlGroupId ?? defaultGroupId;
  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  const handleChange = (groupId: string | null) => {
    if (!groupId) return;
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;

    const pagePath = extractPagePath(pathname);

    startTransition(() => {
      // isCurrent の場合は groupId を null として扱う
      const targetGroupId = group.isCurrent ? null : groupId;
      router.push(buildGroupPath(targetGroupId, pagePath) as Route);
    });
  };

  return (
    <div className="flex min-w-0 items-center">
      <BaseSelect.Root value={selectedGroupId} onValueChange={handleChange}>
        <BaseSelect.Trigger
          aria-label="グループを選択"
          className={cn(
            groupSelectorContainerClassName,
            "hover:bg-muted transition-colors cursor-pointer",
            isPending && "opacity-70 pointer-events-none",
          )}
        >
          <GroupSelectorDisplay name={selectedGroup?.name ?? "グループ"} />
          <BaseSelect.Icon className="flex shrink-0">
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal>
          <BaseSelect.Positioner className="z-50">
            <BaseSelect.Popup
              className={cn(
                "min-w-[180px] origin-[var(--transform-origin)] overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg",
                "transition-[transform,scale,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
              )}
            >
              {groups.map((group) => (
                <BaseSelect.Item
                  key={group.id}
                  value={group.id}
                  className={cn(
                    "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md py-2 pl-8 pr-3 text-sm outline-none",
                    "focus:bg-accent focus:text-accent-foreground",
                    "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                  )}
                >
                  <BaseSelect.ItemIndicator className="absolute left-2 flex h-4 w-4 items-center justify-center">
                    <Check className="h-4 w-4 text-primary" />
                  </BaseSelect.ItemIndicator>
                  <BaseSelect.ItemText className="truncate">{group.name}</BaseSelect.ItemText>
                  {group.isCurrent && (
                    <span className="text-xs text-muted-foreground shrink-0">デフォルト</span>
                  )}
                </BaseSelect.Item>
              ))}
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
      <RefreshStatus
        lastScrapedAt={selectedGroup?.lastScrapedAt ?? null}
        workflowUrl={refreshWorkflowUrl}
      />
    </div>
  );
}
