import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TransactionDesktopView } from "./transaction-desktop-view";
import { TransactionMobileView } from "./transaction-mobile-view";
import type { Transaction } from "./types";

const excludedTransaction: Transaction = {
  id: 1,
  date: "2025-04-26",
  category: "食費",
  description: "対象外の取引",
  amount: 2500,
  type: "expense",
  isTransfer: false,
  isExcludedFromCalculation: true,
  accountName: "サンプルカード",
};

describe("transaction exclusion badge", () => {
  it("デスクトップ表示で計算対象外を明示する", () => {
    render(
      <TransactionDesktopView
        transactions={[excludedTransaction]}
        sortColumn="date"
        sortDirection="desc"
        onSort={vi.fn<(column: string) => void>()}
      />,
    );

    expect(screen.queryByText("計算対象外")).not.toBeNull();
  });

  it("モバイル表示で計算対象外を明示する", () => {
    render(<TransactionMobileView transactions={[excludedTransaction]} />);

    expect(screen.queryByText("計算対象外")).not.toBeNull();
  });
});
