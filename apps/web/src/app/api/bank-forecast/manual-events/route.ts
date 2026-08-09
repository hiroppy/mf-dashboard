import { getJstTodayIsoDate, parseIsoDateKey } from "@mf-dashboard/date-utils";
import {
  createBankForecastManualEvent,
  deleteBankForecastManualEvent,
  updateBankForecastManualEvent,
  type BankForecastManualEventInput,
} from "@mf-dashboard/db/queries/bank-forecast-manual-event";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  getManualEventMaxDate,
  MAX_MANUAL_EVENT_AMOUNT,
} from "../../../../lib/bank-forecast-manual-event";

interface ManualEventRequest {
  id?: unknown;
  accountId?: unknown;
  date?: unknown;
  amount?: unknown;
  direction?: unknown;
  description?: unknown;
  groupId?: unknown;
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    parseIsoDateKey(value);
    const today = getJstTodayIsoDate();
    return value >= today && value <= getManualEventMaxDate(today);
  } catch {
    return false;
  }
}

function parseInput(body: ManualEventRequest): BankForecastManualEventInput | null {
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (
    !Number.isSafeInteger(body.accountId) ||
    (body.accountId as number) <= 0 ||
    !isValidDate(body.date) ||
    !Number.isSafeInteger(body.amount) ||
    (body.amount as number) <= 0 ||
    (body.amount as number) > MAX_MANUAL_EVENT_AMOUNT ||
    (body.direction !== "income" && body.direction !== "expense") ||
    description.length === 0 ||
    description.length > 100
  ) {
    return null;
  }

  return {
    accountId: body.accountId as number,
    date: body.date,
    amount: body.amount as number,
    direction: body.direction,
    description,
  };
}

async function getBody(request: Request): Promise<ManualEventRequest | null> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if ("groupId" in body && body.groupId !== undefined && typeof body.groupId !== "string") {
    return null;
  }
  return body as ManualEventRequest;
}

function writesUnavailable() {
  return NextResponse.json({ error: "not available in demo" }, { status: 403 });
}

function invalidRequest() {
  return NextResponse.json({ error: "invalid request" }, { status: 400 });
}

function revalidateForecasts() {
  revalidatePath("/", "layout");
}

export async function POST(request: Request) {
  if (process.env.VERCEL === "1") return writesUnavailable();
  const body = await getBody(request);
  const input = body ? parseInput(body) : null;
  if (!body || !input) return invalidRequest();

  const event = await createBankForecastManualEvent(input, body.groupId as string | undefined);
  if (!event) return NextResponse.json({ error: "bank account not found" }, { status: 404 });

  revalidateForecasts();
  return NextResponse.json({ event }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (process.env.VERCEL === "1") return writesUnavailable();
  const body = await getBody(request);
  const input = body ? parseInput(body) : null;
  if (!body || !Number.isSafeInteger(body.id) || (body.id as number) <= 0 || !input) {
    return invalidRequest();
  }

  const event = await updateBankForecastManualEvent(
    body.id as number,
    input,
    body.groupId as string | undefined,
  );
  if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });

  revalidateForecasts();
  return NextResponse.json({ event });
}

export async function DELETE(request: Request) {
  if (process.env.VERCEL === "1") return writesUnavailable();
  const body = await getBody(request);
  if (!body || !Number.isSafeInteger(body.id) || (body.id as number) <= 0) {
    return invalidRequest();
  }

  const deleted = await deleteBankForecastManualEvent(
    body.id as number,
    body.groupId as string | undefined,
  );
  if (!deleted) return NextResponse.json({ error: "event not found" }, { status: 404 });

  revalidateForecasts();
  return NextResponse.json({ deleted: true });
}
