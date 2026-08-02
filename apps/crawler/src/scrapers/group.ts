import type { Group } from "@mf-dashboard/db/types";
import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Page } from "playwright";
import { debug, log, warn } from "../logger.js";

/** 「グループ選択なし」を表す特別なID */
export const NO_GROUP_ID = "0";

/** 除外すべきオプションのID（グループの追加・編集など） */
const EXCLUDED_OPTION_IDS = ["create_group"];

const GROUP_SELECTOR = 'select[name="group_id_hash"]';

/** グループ選択なしかどうかを判定 */
export function isNoGroup(groupId: string): boolean {
  return groupId === NO_GROUP_ID;
}

/** 有効なグループかどうかを判定（除外オプションを除く） */
function isValidGroupOption(value: string): boolean {
  return !EXCLUDED_OPTION_IDS.includes(value);
}

/**
 * ページ上のグループセレクタを取得する
 * @param page Playwrightのページオブジェクト
 * @param navigate trueの場合はhomeに遷移する
 */
async function getGroupSelector(page: Page, navigate = true) {
  const groupSelect = page.locator(GROUP_SELECTOR);
  await ensureGroupSelectorVisible(page, groupSelect, navigate);

  const exists = await groupSelect.count();
  return exists > 0 ? groupSelect : null;
}

async function ensureGroupSelectorVisible(
  page: Page,
  groupSelect: ReturnType<Page["locator"]>,
  navigate: boolean,
): Promise<void> {
  if (!navigate) return;

  const isVisible = await isGroupSelectorVisible(groupSelect);
  if (!isVisible) {
    await navigateToHomeWithRetry(page);
  }

  // グループセレクタが表示されるまで待機（存在しない場合もあるのでtry-catch）
  try {
    await groupSelect.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    // セレクタが存在しない場合は無視
  }
}

async function isGroupSelectorVisible(groupSelect: ReturnType<Page["locator"]>): Promise<boolean> {
  if ((await groupSelect.count()) === 0) return false;
  return groupSelect.isVisible();
}

async function navigateToHomeWithRetry(page: Page): Promise<void> {
  try {
    await page.goto(mfUrls.home, {
      waitUntil: "domcontentloaded",
    });
  } catch (err) {
    if (page.isClosed()) throw err;
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("net::ERR_ABORTED")) {
      throw err;
    }
    // Retry once if navigation was aborted by a subsequent navigation.
    await page.waitForTimeout(1000);
    await page.goto(mfUrls.home, {
      waitUntil: "domcontentloaded",
    });
  }
}

/**
 * 全グループの一覧を取得する（「グループ選択なし」を含む）
 */
export async function getAllGroups(page: Page): Promise<Group[]> {
  debug("Getting all groups from page...");

  const groupSelect = await getGroupSelector(page);
  if (!groupSelect) {
    debug("Group selector not found");
    return [];
  }

  const groups: Group[] = [];
  const options = groupSelect.locator("option");
  const optionCount = await options.count();
  const currentValue = await groupSelect.inputValue();

  for (let i = 0; i < optionCount; i++) {
    const option = options.nth(i);
    const value = (await option.getAttribute("value")) || "";
    const text = (await option.textContent()) || "";

    // 「グループの追加・編集」などの特殊オプションを除外
    if (!isValidGroupOption(value)) {
      debug(`Skipping non-group option: ${text.trim()} (${value})`);
      continue;
    }

    groups.push({
      id: value,
      name: text.trim(),
      isCurrent: value === currentValue,
    });
  }

  debug(`Found ${groups.length} groups`);
  return groups;
}

/**
 * 現在選択中のグループを取得する
 */
export async function getCurrentGroup(page: Page): Promise<Group | null> {
  debug("Getting current group from page...");

  const groupSelect = await getGroupSelector(page);
  if (!groupSelect) {
    debug("Group selector not found");
    return null;
  }

  try {
    const currentValue = await groupSelect.inputValue();
    const currentOption = groupSelect.locator(`option[value="${currentValue}"]`);
    const optionExists = await currentOption.count();

    if (optionExists > 0) {
      const name = (await currentOption.textContent({ timeout: 1000 })) || "";
      return { id: currentValue, name: name.trim(), isCurrent: true };
    }
    return null;
  } catch (err) {
    debug("Failed to get current group:", err);
    return null;
  }
}

/**
 * 指定したグループに切り替える
 * @param page Playwrightのページオブジェクト
 * @param groupId 切り替え先のグループID（空文字列で「グループ選択なし」）
 * @returns 切り替え後のグループ情報
 */
export async function switchGroup(page: Page, groupId: string): Promise<Group | null> {
  const groupName = isNoGroup(groupId) ? "グループ選択なし" : groupId;
  log(`Switching to group: ${groupName}`);

  const groupSelect = await getGroupSelector(page);
  if (!groupSelect) {
    throw new Error("Group selector not found");
  }

  // 現在の値と同じ場合は何もしない
  const currentValue = await groupSelect.inputValue();
  if (currentValue === groupId) {
    debug("Already on the target group");
    return getCurrentGroup(page);
  }

  // グループを切り替え
  await groupSelect.selectOption({ value: groupId });

  // ページ遷移またはリロードを待つ
  await page.waitForLoadState("domcontentloaded");
  // グループセレクタが更新されるまで待機
  await page.locator('select[name="group_id_hash"]').waitFor({ state: "visible", timeout: 5000 });

  // 切り替え完了の確認（alertやnotificationの表示を待つ）
  // MoneyForwardはページ遷移で切り替わるので、新しいページでセレクタを確認
  const newGroupSelect = await getGroupSelector(page, false);
  if (!newGroupSelect) {
    throw new Error("Group selector not found after switch");
  }

  const newValue = await newGroupSelect.inputValue();
  if (newValue !== groupId) {
    throw new Error(`Group switch failed: expected ${groupId}, got ${newValue}`);
  }

  log(`Successfully switched to group: ${groupName}`);
  return getCurrentGroup(page);
}

/**
 * グループスコープを作成（`await using` 用）
 *
 * スコープ終了時に元のグループに復元する。
 * 復元に失敗した場合はリトライを行い、それでも失敗した場合はエラーログを出力する。
 */
export async function createGroupScope(
  page: Page,
): Promise<AsyncDisposable & { originalGroup: Group | null }> {
  const originalGroup = await getCurrentGroup(page);

  return {
    originalGroup,
    [Symbol.asyncDispose]: async () => {
      if (!originalGroup) return;

      const MAX_RETRIES = 2;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          log(
            `Restoring original group: ${originalGroup.name}${attempt > 0 ? ` (retry ${attempt})` : ""}`,
          );
          await switchGroup(page, originalGroup.id);
          log(`Successfully restored group: ${originalGroup.name}`);
          return;
        } catch (err) {
          if (attempt < MAX_RETRIES) {
            warn(`Failed to restore group (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`, err);
            // ページ状態をリセットしてリトライ
            try {
              await page.goto(mfUrls.home, {
                waitUntil: "domcontentloaded",
                timeout: 10000,
              });
            } catch {
              // ナビゲーション失敗は次のリトライで再試行
            }
          } else {
            warn("Failed to restore original group after all retries:", err);
          }
        }
      }
    },
  };
}
