import type { Page } from "playwright";
import type { CategoryCandidate } from "../category-decision/types.js";
import { debug } from "../logger.js";

/**
 * Passed to page.evaluate() — must be self-contained (no external references).
 */
export function parseCategoryCandidates(): CategoryCandidate[] {
  const CATEGORY_COLUMNS = {
    CATEGORY: 5,
    SUB_CATEGORY: 6,
  } as const;

  function cleanText(text: string | null | undefined): string {
    return (text ?? "").replace(/\s+/g, " ").trim();
  }

  function inferIsIncome(largeCategoryId: string, largeCategoryName: string): boolean {
    return largeCategoryId === "1" || largeCategoryName === "収入";
  }

  function addCandidate(
    candidates: CategoryCandidate[],
    seen: Set<string>,
    candidate: CategoryCandidate,
  ): void {
    if (
      !candidate.largeCategoryId ||
      !candidate.largeCategoryName ||
      !candidate.middleCategoryId ||
      !candidate.middleCategoryName
    ) {
      return;
    }

    const key = `${candidate.largeCategoryId}:${candidate.middleCategoryId}`;
    if (seen.has(key)) return;

    seen.add(key);
    candidates.push(candidate);
  }

  function optionText(option: HTMLOptionElement): string {
    return cleanText(option.textContent || option.getAttribute("label"));
  }

  function getLargeCategoryId(option: HTMLOptionElement): string {
    return (
      option.dataset.largeCategoryId ||
      option.dataset.parentId ||
      option.dataset.categoryId ||
      option.getAttribute("data-large-id") ||
      ""
    );
  }

  function inputDisplayText(
    input: HTMLInputElement | HTMLSelectElement | null,
    fallbackCell: HTMLTableCellElement,
  ): string {
    if (input instanceof HTMLSelectElement) {
      const selectedOption = input.selectedOptions.item(0);
      const selectedText = selectedOption ? optionText(selectedOption) : "";
      if (selectedText) return selectedText;
    }

    return cleanText(fallbackCell.textContent);
  }

  const candidates: CategoryCandidate[] = [];
  const seen = new Set<string>();
  const largeCategoryNames = new Map<string, string>();

  const largeOptions = document.querySelectorAll<HTMLOptionElement>(
    "select[name*='large_category_id'] option",
  );
  for (const option of largeOptions) {
    const id = option.value;
    const name = optionText(option);
    if (id && name) {
      largeCategoryNames.set(id, name);
    }
  }

  const middleOptions = document.querySelectorAll<HTMLOptionElement>(
    "select[name*='middle_category_id'] option",
  );
  for (const option of middleOptions) {
    const largeCategoryId = getLargeCategoryId(option);
    const largeCategoryName = largeCategoryNames.get(largeCategoryId);
    const middleCategoryId = option.value;
    const middleCategoryName = optionText(option);

    if (!largeCategoryId || !largeCategoryName || !middleCategoryId || !middleCategoryName) {
      continue;
    }

    addCandidate(candidates, seen, {
      largeCategoryId,
      largeCategoryName,
      middleCategoryId,
      middleCategoryName,
      isIncome: inferIsIncome(largeCategoryId, largeCategoryName),
    });
  }

  const rows = document.querySelectorAll<HTMLTableRowElement>(
    "#cf-detail-table tbody tr[id^='js-transaction-']",
  );
  for (const row of rows) {
    const cells = row.querySelectorAll<HTMLTableCellElement>("td");
    const categoryCell = cells[CATEGORY_COLUMNS.CATEGORY];
    const subCategoryCell = cells[CATEGORY_COLUMNS.SUB_CATEGORY];
    if (!categoryCell || !subCategoryCell) continue;

    const largeCategoryInput = categoryCell.querySelector<HTMLInputElement | HTMLSelectElement>(
      "input[name*='large_category_id'], select[name*='large_category_id']",
    );
    const middleCategoryInput = subCategoryCell.querySelector<HTMLInputElement | HTMLSelectElement>(
      "input[name*='middle_category_id'], select[name*='middle_category_id']",
    );

    const largeCategoryId = largeCategoryInput?.value ?? "";
    const largeCategoryName = inputDisplayText(largeCategoryInput, categoryCell);

    if (middleCategoryInput instanceof HTMLSelectElement) {
      for (const option of middleCategoryInput.options) {
        const optionLargeCategoryId = getLargeCategoryId(option);
        const resolvedLargeCategoryId = optionLargeCategoryId || largeCategoryId;
        const resolvedLargeCategoryName =
          largeCategoryNames.get(resolvedLargeCategoryId) ||
          (resolvedLargeCategoryId === largeCategoryId ? largeCategoryName : "");

        addCandidate(candidates, seen, {
          largeCategoryId: resolvedLargeCategoryId,
          largeCategoryName: resolvedLargeCategoryName,
          middleCategoryId: option.value,
          middleCategoryName: optionText(option),
          isIncome: inferIsIncome(resolvedLargeCategoryId, resolvedLargeCategoryName),
        });
      }

      continue;
    }

    const middleCategoryId = middleCategoryInput?.value ?? "";
    const middleCategoryName = inputDisplayText(middleCategoryInput, subCategoryCell);

    addCandidate(candidates, seen, {
      largeCategoryId,
      largeCategoryName,
      middleCategoryId,
      middleCategoryName,
      isIncome: inferIsIncome(largeCategoryId, largeCategoryName),
    });
  }

  return candidates;
}

export async function scrapeCategoryCandidates(page: Page): Promise<CategoryCandidate[]> {
  const candidates = await page.evaluate(parseCategoryCandidates);
  debug(`Category candidates: ${candidates.length}`);
  return candidates;
}
