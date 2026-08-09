"use client";

import type { BankForecastManualEvent } from "@mf-dashboard/db/queries/bank-forecast-manual-event";
import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { type FormEvent, useState, useTransition } from "react";
import {
  getManualEventMaxDate,
  MAX_MANUAL_EVENT_AMOUNT,
} from "../../lib/bank-forecast-manual-event";
import { withBasePath } from "../../lib/base-path";
import { formatDateShort } from "../../lib/format";
import { AmountDisplay } from "../ui/amount-display";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";

interface ForecastAccountOption {
  id: number;
  name: string;
}

interface BankForecastManualEventsClientProps {
  accounts: ForecastAccountOption[];
  events: BankForecastManualEvent[];
  minDate: string;
  groupId?: string;
  allowEditing?: boolean;
  onChanged?: () => void;
}

interface EventFormState {
  accountId: string;
  date: string;
  amount: string;
  direction: "income" | "expense";
  description: string;
}

function emptyForm(accounts: ForecastAccountOption[], minDate: string): EventFormState {
  return {
    accountId: accounts[0] ? String(accounts[0].id) : "",
    date: minDate,
    amount: "",
    direction: "expense",
    description: "",
  };
}

export function BankForecastManualEventsClient({
  accounts,
  events,
  minDate,
  groupId,
  allowEditing = true,
  onChanged,
}: BankForecastManualEventsClientProps) {
  const [form, setForm] = useState<EventFormState>(() => emptyForm(accounts, minDate));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const accountOptions = accounts.map((account) => ({
    value: String(account.id),
    label: account.name,
  }));
  const maxDate = getManualEventMaxDate(minDate);

  function resetForm() {
    setForm(emptyForm(accounts, minDate));
    setEditingId(null);
    setError(null);
  }

  function editEvent(event: BankForecastManualEvent) {
    setForm({
      accountId: String(event.accountId),
      date: event.date,
      amount: String(event.amount),
      direction: event.direction,
      description: event.description,
    });
    setEditingId(event.id);
    setDeletingId(null);
    setError(null);
  }

  function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch(withBasePath("/api/bank-forecast/manual-events"), {
        method: editingId === null ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(editingId === null ? {} : { id: editingId }),
          accountId: Number(form.accountId),
          date: form.date,
          amount: Number(form.amount),
          direction: form.direction,
          description: form.description,
          groupId,
        }),
      }).catch(() => null);

      if (!response?.ok) {
        setError("予定を保存できませんでした。入力内容を確認してください。");
        return;
      }

      resetForm();
      onChanged?.();
    });
  }

  function deleteEvent(id: number) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(withBasePath("/api/bank-forecast/manual-events"), {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, groupId }),
      }).catch(() => null);

      if (!response?.ok) {
        setError("予定を削除できませんでした。");
        return;
      }

      if (editingId === id) resetForm();
      setDeletingId(null);
      onChanged?.();
    });
  }

  return (
    <section
      aria-labelledby="manual-forecast-events-title"
      className="space-y-4 rounded-lg border p-4"
    >
      <div>
        <h2 id="manual-forecast-events-title" className="flex items-center gap-2 font-semibold">
          <CalendarPlus className="size-4" aria-hidden="true" />
          手入力の入出金予定
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          予定納税など、自動予測しづらい将来の入出金を残高予測へ追加できます。
        </p>
      </div>

      {allowEditing ? (
        <form onSubmit={saveEvent} className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-1 text-xs font-medium">
            <span>口座</span>
            <Select
              aria-label="対象口座"
              options={accountOptions}
              value={form.accountId}
              onChange={(accountId) => setForm((current) => ({ ...current, accountId }))}
              disabled={isPending}
            />
          </div>
          <label htmlFor="manual-forecast-date" className="space-y-1 text-xs font-medium">
            予定日
            <Input
              id="manual-forecast-date"
              aria-label="予定日"
              type="date"
              min={minDate}
              max={maxDate}
              value={form.date}
              required
              disabled={isPending}
              onChange={(event) => {
                const date = event.currentTarget.value;
                setForm((current) => ({ ...current, date }));
              }}
            />
          </label>
          <div className="space-y-1 text-xs font-medium">
            <span>区分</span>
            <Select
              aria-label="入出金区分"
              options={[
                { value: "expense", label: "支出" },
                { value: "income", label: "収入" },
              ]}
              value={form.direction}
              onChange={(direction) =>
                setForm((current) => ({
                  ...current,
                  direction: direction as EventFormState["direction"],
                }))
              }
              disabled={isPending}
            />
          </div>
          <label htmlFor="manual-forecast-amount" className="space-y-1 text-xs font-medium">
            金額
            <Input
              id="manual-forecast-amount"
              aria-label="金額"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_MANUAL_EVENT_AMOUNT}
              step={1}
              value={form.amount}
              required
              disabled={isPending}
              onChange={(event) => {
                const amount = event.currentTarget.value;
                setForm((current) => ({ ...current, amount }));
              }}
            />
          </label>
          <label
            htmlFor="manual-forecast-description"
            className="space-y-1 text-xs font-medium md:col-span-2 xl:col-span-1"
          >
            内容
            <Input
              id="manual-forecast-description"
              aria-label="内容"
              maxLength={100}
              value={form.description}
              required
              disabled={isPending}
              placeholder="例: 予定納税"
              onChange={(event) => {
                const description = event.currentTarget.value;
                setForm((current) => ({ ...current, description }));
              }}
            />
          </label>
          <div className="flex justify-end gap-2 md:col-span-2 xl:col-span-5">
            {editingId !== null ? (
              <Button type="button" variant="ghost" disabled={isPending} onClick={resetForm}>
                キャンセル
              </Button>
            ) : null}
            <Button type="submit" disabled={isPending || accounts.length === 0}>
              {isPending ? "保存中" : editingId === null ? "予定を追加" : "変更を保存"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">公開デモでは予定を変更できません。</p>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {events.length === 0 ? (
        <p className="rounded-md bg-muted/50 px-3 py-4 text-center text-sm text-muted-foreground">
          登録済みの予定はありません。
        </p>
      ) : (
        <ul className="divide-y rounded-md border px-3">
          {events.map((event) => {
            const signedAmount = event.direction === "income" ? event.amount : -event.amount;
            return (
              <li key={event.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{event.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateShort(event.date)} ·{" "}
                    {accounts.find(({ id }) => id === event.accountId)?.name ?? "銀行口座"}
                  </p>
                </div>
                <AmountDisplay amount={signedAmount} type="balance" showSign weight="semibold" />
                {allowEditing ? (
                  <div className="col-span-2 flex justify-end gap-2">
                    {deletingId === event.id ? (
                      <>
                        <span className="self-center text-xs text-muted-foreground">
                          削除しますか？
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={isPending}
                          onClick={() => setDeletingId(null)}
                        >
                          戻る
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={isPending}
                          onClick={() => deleteEvent(event.id)}
                        >
                          削除する
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={isPending}
                          onClick={() => editEvent(event)}
                        >
                          <Pencil aria-hidden="true" />
                          編集
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={isPending}
                          onClick={() => setDeletingId(event.id)}
                        >
                          <Trash2 aria-hidden="true" />
                          削除
                        </Button>
                      </>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
