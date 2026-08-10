import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BankForecastManualEventsClient } from "./bank-forecast-manual-events.client";

const events = [
  {
    id: 1,
    accountId: 1,
    date: "2026-10-15",
    amount: 120_000,
    direction: "expense" as const,
    description: "予定納税",
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function openManualEvents() {
  fireEvent.click(screen.getByRole("button", { name: "開く" }));
}

describe("BankForecastManualEventsClient", () => {
  it("starts collapsed and toggles the manual event controls", () => {
    render(
      <BankForecastManualEventsClient
        accounts={[{ id: 1, name: "銀行 A" }]}
        events={[]}
        minDate="2026-08-10"
      />,
    );

    const openButton = screen.getByRole("button", { name: "開く" });
    expect(openButton.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("予定日")).toBeNull();

    openManualEvents();
    expect(screen.getByRole("button", { name: "閉じる" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(screen.getByLabelText("予定日")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByLabelText("予定日")).toBeNull();
  });

  it("does not show past manual events in the list", () => {
    render(
      <BankForecastManualEventsClient
        accounts={[{ id: 1, name: "銀行 A" }]}
        events={[
          {
            id: 2,
            accountId: 1,
            date: "2026-08-09",
            amount: 10_000,
            direction: "expense",
            description: "過去の予定",
          },
          ...events,
        ]}
        minDate="2026-08-10"
      />,
    );

    openManualEvents();
    expect(screen.queryByText("過去の予定")).toBeNull();
    expect(screen.getByText("予定納税")).toBeTruthy();
  });

  it("submits a future expense and reports the change", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ event: events[0] }), { status: 201 }));
    const onChanged = vi.fn<() => void>();
    render(
      <BankForecastManualEventsClient
        accounts={[{ id: 1, name: "銀行 A" }]}
        events={[]}
        minDate="2026-08-10"
        groupId="group-a"
        onChanged={onChanged}
      />,
    );

    openManualEvents();
    fireEvent.change(screen.getByLabelText("予定日"), { target: { value: "2026-10-15" } });
    fireEvent.change(screen.getByLabelText("金額"), { target: { value: "120000" } });
    fireEvent.change(screen.getByLabelText("内容"), { target: { value: "予定納税" } });
    fireEvent.click(screen.getByRole("button", { name: "予定を追加" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bank-forecast/manual-events",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          accountId: 1,
          date: "2026-10-15",
          amount: 120_000,
          direction: "expense",
          description: "予定納税",
          groupId: "group-a",
        }),
      }),
    );
  });

  it("loads and submits an existing event for editing", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ event: events[0] }), { status: 200 }));
    const onChanged = vi.fn<() => void>();
    render(
      <BankForecastManualEventsClient
        accounts={[{ id: 1, name: "銀行 A" }]}
        events={events}
        minDate="2026-08-10"
        groupId="group-a"
        onChanged={onChanged}
      />,
    );

    openManualEvents();
    fireEvent.click(screen.getByRole("button", { name: "編集" }));
    expect(screen.getByLabelText<HTMLInputElement>("予定日").value).toBe("2026-10-15");
    expect(screen.getByLabelText<HTMLInputElement>("金額").value).toBe("120,000");
    expect(screen.getByLabelText<HTMLInputElement>("内容").value).toBe("予定納税");
    fireEvent.change(screen.getByLabelText("金額"), { target: { value: "100000" } });
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bank-forecast/manual-events",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          id: 1,
          accountId: 1,
          date: "2026-10-15",
          amount: 100_000,
          direction: "expense",
          description: "予定納税",
          groupId: "group-a",
        }),
      }),
    );
  });

  it("deletes an event after inline confirmation", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ deleted: true }), { status: 200 }));
    const onChanged = vi.fn<() => void>();
    render(
      <BankForecastManualEventsClient
        accounts={[{ id: 1, name: "銀行 A" }]}
        events={events}
        minDate="2026-08-10"
        groupId="group-a"
        onChanged={onChanged}
      />,
    );

    openManualEvents();
    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bank-forecast/manual-events",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ id: 1, groupId: "group-a" }),
      }),
    );
  });

  it("hides mutation controls in hosted demo mode", () => {
    render(
      <BankForecastManualEventsClient
        accounts={[{ id: 1, name: "銀行 A" }]}
        events={events}
        minDate="2026-08-10"
        allowEditing={false}
      />,
    );

    openManualEvents();
    expect(screen.getByText("公開デモでは予定を変更できません。")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "編集" })).toBeNull();
  });
});
