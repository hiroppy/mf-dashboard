import { ChevronDown, TrendingDown, TrendingUp } from "lucide-react";
import { getCategoryColor } from "../../../lib/colors";
import { formatCurrency } from "../../../lib/format";
import { cn } from "../../../lib/utils";
import { AmountDisplay, getAmountColorClass } from "../../ui/amount-display";
import { SubCategoryAccordion } from "./sub-category-accordion";
import type { CategoryData } from "./types";

interface CategoryAccordionProps {
  item: CategoryData;
  total: number;
  type: "income" | "expense";
  prevAmount?: number;
  hasPrevData: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  isSubCategoryExpanded: (key: string) => boolean;
  onToggleSubCategory: (key: string) => void;
}

export function CategoryAccordion({
  item,
  total,
  type,
  prevAmount,
  hasPrevData,
  isExpanded,
  onToggle,
  isSubCategoryExpanded,
  onToggleSubCategory,
}: CategoryAccordionProps) {
  const percentage = total > 0 ? (item.amount / total) * 100 : 0;
  const color = getCategoryColor(item.category);
  const hasSubCategories = item.subCategories && item.subCategories.length > 0;
  const delta = prevAmount !== undefined ? item.amount - prevAmount : null;
  const accessibleLabel = [
    item.category,
    formatCurrency(item.amount),
    `${percentage.toFixed(1)}%`,
    hasPrevData && delta !== null ? `前回比${formatCurrency(delta, true)}` : null,
    hasSubCategories ? `内訳を${isExpanded ? "閉じる" : "開く"}` : null,
  ]
    .filter((value) => value !== null)
    .join(" ");

  return (
    <div className="space-y-1">
      <button
        type="button"
        className={cn("w-full text-left space-y-1", hasSubCategories && "cursor-pointer")}
        onClick={() => hasSubCategories && onToggle()}
        aria-label={accessibleLabel}
        aria-expanded={hasSubCategories ? isExpanded : undefined}
      >
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {hasSubCategories && (
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  isExpanded && "rotate-180",
                )}
              />
            )}
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
            <span>{item.category}</span>
          </div>
          <div className="flex items-center gap-2">
            <AmountDisplay amount={item.amount} type={type} size="sm" />
            {hasPrevData && (
              <span className="hidden lg:block w-28 text-right">
                {delta !== null && delta !== 0 && (
                  <span className="inline-flex items-center justify-end gap-0.5 text-sm">
                    {delta > 0 ? (
                      <TrendingUp
                        className={cn(
                          "h-3 w-3",
                          getAmountColorClass({
                            value: delta,
                            type: "balance",
                            inverse: type === "expense",
                          }),
                        )}
                      />
                    ) : (
                      <TrendingDown
                        className={cn(
                          "h-3 w-3",
                          getAmountColorClass({
                            value: delta,
                            type: "balance",
                            inverse: type === "expense",
                          }),
                        )}
                      />
                    )}
                    <AmountDisplay
                      amount={delta}
                      type="balance"
                      inverse={type === "expense"}
                      size="sm"
                    />
                  </span>
                )}
              </span>
            )}
            <span className="text-muted-foreground w-12 text-right">{percentage.toFixed(1)}%</span>
          </div>
        </div>
        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${percentage}%`,
              backgroundColor: color,
            }}
          />
        </div>
      </button>

      {/* Sub-category accordion */}
      {hasSubCategories && isExpanded && (
        <div className="mt-2 ml-6 space-y-2 border-l-2 pl-3 border-muted">
          {item.subCategories!.map((sub) => {
            const subKey = `${item.category}:${sub.subCategory}`;
            return (
              <SubCategoryAccordion
                key={subKey}
                subCategory={sub}
                categoryAmount={item.amount}
                type={type}
                isExpanded={isSubCategoryExpanded(subKey)}
                onToggle={() => onToggleSubCategory(subKey)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
