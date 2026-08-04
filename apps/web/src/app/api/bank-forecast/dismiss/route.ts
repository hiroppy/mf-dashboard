import { parseIsoDateKey } from "@mf-dashboard/date-utils";
import { dismissBankForecastCandidate } from "@mf-dashboard/db";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

interface DismissRequest {
  accountId?: unknown;
  direction?: unknown;
  recurringIdentity?: unknown;
  dismissedThroughDate?: unknown;
  groupId?: unknown;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  try {
    parseIsoDateKey(value);
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (process.env.VERCEL === "1") {
    return NextResponse.json({ error: "not available in demo" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as DismissRequest | null;
  if (
    !body ||
    !Number.isInteger(body.accountId) ||
    (body.direction !== "income" && body.direction !== "expense") ||
    typeof body.recurringIdentity !== "string" ||
    body.recurringIdentity.length === 0 ||
    typeof body.dismissedThroughDate !== "string" ||
    !isIsoDate(body.dismissedThroughDate) ||
    (body.groupId !== undefined && typeof body.groupId !== "string")
  ) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const saved = await dismissBankForecastCandidate(
    {
      accountId: body.accountId as number,
      direction: body.direction,
      recurringIdentity: body.recurringIdentity,
      dismissedThroughDate: body.dismissedThroughDate,
    },
    body.groupId,
  );
  if (!saved) return NextResponse.json({ error: "account not found" }, { status: 404 });

  revalidatePath("/", "layout");
  return NextResponse.json({ dismissed: true });
}
