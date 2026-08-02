import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Page } from "playwright";

const GROUP_SELECTOR = 'select[name="group_id_hash"]';
const MAX_RESTORE_ATTEMPTS = 3;

async function getVisibleGroupSelector(page: Page) {
  let selector = page.locator(GROUP_SELECTOR).first();
  const isVisible = (await selector.count()) > 0 && (await selector.isVisible());
  if (!isVisible) {
    await page.goto(mfUrls.home, { waitUntil: "domcontentloaded" });
    selector = page.locator(GROUP_SELECTOR).first();
  }
  await selector.waitFor({ state: "visible", timeout: 5000 });
  return selector;
}

export async function getSelectedGroupId(page: Page): Promise<string | null> {
  try {
    return await (await getVisibleGroupSelector(page)).inputValue();
  } catch {
    return null;
  }
}

export async function switchGroupAnonymously(page: Page, groupId: string): Promise<void> {
  try {
    const selector = await getVisibleGroupSelector(page);
    if ((await selector.inputValue()) === groupId) return;

    await selector.selectOption({ value: groupId });
    await page.waitForLoadState("domcontentloaded");

    const updatedSelector = page.locator(GROUP_SELECTOR).first();
    await updatedSelector.waitFor({ state: "visible", timeout: 5000 });
    if ((await updatedSelector.inputValue()) !== groupId) throw new Error();
  } catch {
    throw new Error("Anonymous group switch failed");
  }
}

export async function createAnonymousGroupScope(page: Page): Promise<AsyncDisposable> {
  const originalGroupId = await getSelectedGroupId(page);

  return {
    [Symbol.asyncDispose]: async () => {
      if (originalGroupId === null) return;

      for (let attempt = 1; attempt <= MAX_RESTORE_ATTEMPTS; attempt++) {
        try {
          await switchGroupAnonymously(page, originalGroupId);
          return;
        } catch {
          if (attempt === MAX_RESTORE_ATTEMPTS) break;
          await page
            .goto(mfUrls.home, { waitUntil: "domcontentloaded", timeout: 10000 })
            .catch(() => undefined);
        }
      }

      throw new Error("Anonymous group restoration failed after all attempts");
    },
  };
}
