import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Page } from "playwright";
import { describe, expect, test, vi } from "vitest";
import {
  parseInstitutionCategories,
  scrapeInstitutionCategories,
} from "./institution-categories.js";

describe("scrapeInstitutionCategories", () => {
  test("必要な口座一覧のDOMを待ってからカテゴリーを抽出する", async () => {
    const waitFor = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const first = vi.fn<() => { waitFor: typeof waitFor }>().mockReturnValue({ waitFor });
    const locator = vi
      .fn<(selector: string) => { first: typeof first }>()
      .mockReturnValue({ first });
    const goto = vi.fn<() => Promise<null>>().mockResolvedValue(null);
    const evaluate = vi
      .fn<() => Promise<Array<{ mfId: string; category: string }>>>()
      .mockResolvedValue([{ mfId: "account-a", category: "銀行" }]);
    const mockPage = { evaluate, goto, locator } as unknown as Page;

    const result = await scrapeInstitutionCategories(mockPage);

    expect(goto).toHaveBeenCalledWith(mfUrls.home, { waitUntil: "domcontentloaded" });
    expect(locator).toHaveBeenCalledWith(".facilities.accounts-list");
    expect(first).toHaveBeenCalledOnce();
    expect(waitFor).toHaveBeenCalledWith({ state: "attached" });
    expect(evaluate).toHaveBeenCalledWith(parseInstitutionCategories);
    expect(result).toEqual(new Map([["account-a", "銀行"]]));
  });
});
