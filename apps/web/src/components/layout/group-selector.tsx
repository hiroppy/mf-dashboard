import { getAllGroups, getCurrentGroup } from "@mf-dashboard/db";
import { RefreshStatus } from "./action-icons";
import { GroupSelectorDisplay, groupSelectorContainerClassName } from "./group-selector-display";
import { GroupSelectorClient } from "./group-selector.client";

export async function GroupSelector() {
  const groups = await getAllGroups();
  const currentGroup = await getCurrentGroup();

  if (groups.length <= 1) {
    if (!currentGroup) {
      return <RefreshStatus lastScrapedAt={null} />;
    }

    return (
      <div className="flex min-w-0 items-center">
        <div className={groupSelectorContainerClassName}>
          <GroupSelectorDisplay name={currentGroup.name} />
        </div>
        <RefreshStatus lastScrapedAt={currentGroup.lastScrapedAt} />
      </div>
    );
  }

  const defaultGroupId = currentGroup?.id ?? groups[0].id;

  return (
    <GroupSelectorClient
      groups={groups.map((g) => ({
        id: g.id,
        name: g.name,
        isCurrent: g.isCurrent ?? false,
        lastScrapedAt: g.lastScrapedAt,
      }))}
      defaultGroupId={defaultGroupId}
    />
  );
}
