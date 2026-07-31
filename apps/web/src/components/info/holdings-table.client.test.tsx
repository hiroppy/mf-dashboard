import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterCategories, HoldingsTableClient, HoldingsTableTotal } from "./holdings-table.client";
import {
  filterHoldings,
  HoldingsFilterProvider,
  HoldingsFilterReset,
  UnrealizedGainCardClient,
  useHoldingsFilter,
} from "./unrealized-gain-card.client";

const categories = [
  {
    category: "株式(現物)",
    total: 600,
    items: [
      {
        id: 1,
        name: "銘柄 A",
        accountName: "証券口座 A",
        institution: "金融機関 A",
        categoryName: "株式(現物)",
        amount: 100,
        unrealizedGain: 10,
        unrealizedGainPct: 10,
        dailyChange: 1,
        avgCostPrice: 90,
        quantity: 1,
        unitPrice: 100,
      },
      {
        id: 2,
        name: "銘柄 B",
        accountName: "証券口座 B",
        institution: "金融機関 B",
        categoryName: "株式(現物)",
        amount: 500,
        unrealizedGain: 20,
        unrealizedGainPct: 4,
        dailyChange: 2,
        avgCostPrice: 480,
        quantity: 1,
        unitPrice: 500,
      },
    ],
  },
  {
    category: "投資信託",
    total: 200,
    items: [
      {
        id: 3,
        name: "投資信託 A",
        accountName: "証券口座 A",
        institution: "金融機関 A",
        categoryName: "投資信託",
        amount: 200,
        unrealizedGain: 30,
        unrealizedGainPct: 15,
        dailyChange: 3,
        avgCostPrice: 170,
        quantity: 1,
        unitPrice: 200,
      },
    ],
  },
];

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn<() => void>();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function FilterButton({ value, children }: { value: string; children: ReactNode }) {
  const filter = useHoldingsFilter();
  return (
    <button type="button" onClick={() => filter?.setSelectedFilter(value)}>
      {children}
    </button>
  );
}

function GainFilterButton({
  value,
  children,
}: {
  value: "all" | "gain" | "loss";
  children: ReactNode;
}) {
  const filter = useHoldingsFilter();
  return (
    <button type="button" onClick={() => filter?.setGainFilter(value)}>
      {children}
    </button>
  );
}

function SelectedFilter() {
  return <output aria-label="選択中フィルター">{useHoldingsFilter()?.selectedFilter}</output>;
}

describe("filterCategories", () => {
  it("全件選択でもカテゴリと項目を金額降順にする", () => {
    const result = filterCategories(categories, "__all__");

    expect(result.map(({ category }) => category)).toEqual(["株式(現物)", "投資信託"]);
    expect(result[0].items.map(({ name }) => name)).toEqual(["銘柄 B", "銘柄 A"]);
  });

  it("金融機関を選ぶと、その金融機関の保有資産と合計だけを返す", () => {
    expect(filterCategories(categories, "金融機関 A")).toEqual([
      {
        ...categories[1],
        items: [categories[1].items[0]],
        total: 200,
      },
      {
        ...categories[0],
        items: [categories[0].items[0]],
        total: 100,
      },
    ]);
  });

  it("絞り込み後の合計が同額ならカテゴリ名順で安定して並べる", () => {
    expect(filterCategories(categories, "金融機関 A").map(({ category }) => category)).toEqual([
      "投資信託",
      "株式(現物)",
    ]);

    const tiedCategories = categories.map((category) => ({
      ...category,
      items: category.items.map((item) => ({ ...item, amount: 100 })),
    }));

    expect(filterCategories(tiedCategories, "金融機関 A").map(({ category }) => category)).toEqual([
      "株式(現物)",
      "投資信託",
    ]);
  });

  it("金融機関と種別を選ぶと、該当するカテゴリだけを返す", () => {
    expect(filterCategories(categories, "金融機関 A|投資信託")).toEqual([
      {
        ...categories[1],
        items: [categories[1].items[0]],
        total: 200,
      },
    ]);
  });

  it("該当する保有資産がなければ空配列を返す", () => {
    expect(filterCategories(categories, "金融機関 C")).toEqual([]);
  });

  it.each([
    ["含み益", "gain" as const, ["銘柄 B", "銘柄 A", "投資信託 A"]],
    ["含み損", "loss" as const, []],
  ])("%sで保有資産を絞り込む", (_label, gainFilter, expectedNames) => {
    expect(
      filterCategories(categories, "__all__", gainFilter).flatMap(({ items }) =>
        items.map(({ name }) => name),
      ),
    ).toEqual(expectedNames);
  });
});

describe("HoldingsTableTotal", () => {
  it.each([
    ["全件", "__all__", "800円"],
    ["一致する金融機関", "金融機関 A", "300円"],
    ["一致しない金融機関", "金融機関 C", "0円"],
  ])("%sの合計を表示する", (_label, selectedFilter, expected) => {
    render(
      <HoldingsFilterProvider>
        <FilterButton value={selectedFilter}>フィルター変更</FilterButton>
        <HoldingsTableTotal categories={categories} total={800} enableSharedFilter />
      </HoldingsFilterProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "フィルター変更" }));

    expect(screen.getByText(expected)).not.toBeNull();
  });

  it("共有された損益区分に一致する保有資産の合計を表示する", () => {
    const mixedCategories = categories.map((category) => ({
      ...category,
      items: category.items.map((item) => ({
        ...item,
        unrealizedGain: item.name === "銘柄 A" ? -10 : 10,
      })),
    }));

    render(
      <HoldingsFilterProvider>
        <GainFilterButton value="loss">含み損に絞る</GainFilterButton>
        <HoldingsTableTotal categories={mixedCategories} total={800} enableSharedFilter />
      </HoldingsFilterProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "含み損に絞る" }));

    expect(screen.getByText("100円")).not.toBeNull();
  });
});

describe("HoldingsTableClient", () => {
  it("共有された損益区分で保有資産表を絞り込む", () => {
    const mixedCategories = [
      {
        ...categories[0],
        items: [
          { ...categories[0].items[0], unrealizedGain: -10 },
          { ...categories[0].items[1], unrealizedGain: 0 },
        ],
      },
      categories[1],
    ];

    render(
      <HoldingsFilterProvider>
        <GainFilterButton value="loss">含み損に絞る</GainFilterButton>
        <HoldingsTableClient categories={mixedCategories} enableSharedFilter />
      </HoldingsFilterProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "含み損に絞る" }));

    expect(screen.getByText("銘柄 A")).not.toBeNull();
    expect(screen.queryByText("銘柄 B")).toBeNull();
    expect(screen.queryByText("投資信託 A")).toBeNull();
  });

  it("後方ページの表示中に絞り込んでも該当する保有資産を表示する", async () => {
    const institutionAItems = Array.from({ length: 11 }, (_, index) => ({
      ...categories[0].items[0],
      id: index + 10,
      name: `銘柄 A${index + 1}`,
    }));
    const institutionBItem = {
      ...categories[0].items[1],
      id: 100,
      name: "絞り込み後の銘柄",
      amount: 50,
    };
    const paginatedCategories = [
      {
        category: "株式(現物)",
        items: [...institutionAItems, institutionBItem],
        total: 1_150,
      },
    ];

    render(
      <HoldingsFilterProvider>
        <FilterButton value="金融機関 B">金融機関 B に絞る</FilterButton>
        <HoldingsTableClient categories={paginatedCategories} enableSharedFilter />
      </HoldingsFilterProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "次のページ" }));
    expect(screen.getByText("絞り込み後の銘柄")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "金融機関 B に絞る" }));

    await waitFor(() => {
      expect(screen.getByText("絞り込み後の銘柄")).not.toBeNull();
    });
    expect(screen.queryByRole("button", { name: "次のページ" })).toBeNull();
  });
});

describe("UnrealizedGainCardClient", () => {
  const filterHoldingsData = [
    {
      name: "含み益銘柄",
      amount: 110,
      unrealizedGain: 10,
      unrealizedGainPct: 10,
      institution: "金融機関 A",
      categoryName: "株式(現物)",
    },
    {
      name: "損益なし銘柄",
      amount: 100,
      unrealizedGain: 0,
      unrealizedGainPct: 0,
      institution: "金融機関 A",
      categoryName: "投資信託",
    },
    {
      name: "含み損銘柄",
      amount: 90,
      unrealizedGain: -10,
      unrealizedGainPct: -10,
      institution: "金融機関 B",
      categoryName: "株式(現物)",
    },
  ];

  it.each([
    ["すべて", "all" as const, ["含み益銘柄", "損益なし銘柄", "含み損銘柄"]],
    ["含み益", "gain" as const, ["含み益銘柄"]],
    ["含み損", "loss" as const, ["含み損銘柄"]],
  ])("%sで損益を絞り込む", (_label, gainFilter, expectedNames) => {
    expect(
      filterHoldings(filterHoldingsData, gainFilter, "__all__").map(({ name }) => name),
    ).toEqual(expectedNames);
  });

  it("損益区分と金融機関・種別を同時に絞り込む", () => {
    expect(filterHoldings(filterHoldingsData, "gain", "金融機関 A|株式(現物)")).toEqual([
      filterHoldingsData[0],
    ]);
    expect(filterHoldings(filterHoldingsData, "loss", "金融機関 A")).toEqual([]);
  });

  it("損益区分を金融機関の左に表示する", () => {
    render(
      <UnrealizedGainCardClient
        holdings={filterHoldingsData}
        filterOptions={[
          { value: "金融機関 A", label: "金融機関 A" },
          { value: "金融機関 B", label: "金融機関 B" },
        ]}
      />,
    );

    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(2);
    expect(selects[0].getAttribute("aria-label")).toBe("損益を選択");
    expect(selects[0].textContent).toBe("損益すべて");
    expect(selects[1].getAttribute("aria-label")).toBe("金融機関を選択");
    expect(selects[1].textContent).toBe("金融機関すべて");
  });

  it("更新後の選択肢にない共有フィルターを全件へ戻す", async () => {
    const holdings = [
      {
        name: "銘柄 A",
        amount: 100,
        unrealizedGain: 10,
        unrealizedGainPct: 10,
        institution: "金融機関 A",
        categoryName: "株式(現物)",
      },
    ];
    const renderCard = (filterOptions: Array<{ value: string; label: string }>) => (
      <HoldingsFilterProvider>
        <FilterButton value="金融機関 A">金融機関 A に絞る</FilterButton>
        <SelectedFilter />
        <UnrealizedGainCardClient holdings={holdings} filterOptions={filterOptions} />
      </HoldingsFilterProvider>
    );
    const { rerender } = render(
      renderCard([
        { value: "金融機関 A", label: "金融機関 A" },
        { value: "金融機関 B", label: "金融機関 B" },
      ]),
    );

    fireEvent.click(screen.getByRole("button", { name: "金融機関 A に絞る" }));
    expect(screen.getByRole("status", { name: "選択中フィルター" }).textContent).toBe("金融機関 A");

    rerender(
      renderCard([
        { value: "金融機関 B", label: "金融機関 B" },
        { value: "金融機関 C", label: "金融機関 C" },
      ]),
    );

    await waitFor(() => {
      expect(screen.getByRole("status", { name: "選択中フィルター" }).textContent).toBe("__all__");
    });
  });

  it("フィルターUIがなくなると共有フィルターを全件へ戻す", async () => {
    const renderProvider = (filterAvailable: boolean, reset = false) => (
      <HoldingsFilterProvider filterAvailable={filterAvailable}>
        <FilterButton value="金融機関 A">金融機関 A に絞る</FilterButton>
        <SelectedFilter />
        {reset && <HoldingsFilterReset />}
      </HoldingsFilterProvider>
    );
    const { rerender } = render(renderProvider(true));

    fireEvent.click(screen.getByRole("button", { name: "金融機関 A に絞る" }));
    expect(screen.getByRole("status", { name: "選択中フィルター" }).textContent).toBe("金融機関 A");

    rerender(renderProvider(false));

    await waitFor(() => {
      expect(screen.getByRole("status", { name: "選択中フィルター" }).textContent).toBe("__all__");
    });

    fireEvent.click(screen.getByRole("button", { name: "金融機関 A に絞る" }));
    rerender(renderProvider(true, true));

    await waitFor(() => {
      expect(screen.getByRole("status", { name: "選択中フィルター" }).textContent).toBe("__all__");
    });
  });
});
