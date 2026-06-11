import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function safeCompare(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export async function POST(request: Request) {
  const refreshToken = process.env.REFRESH_TOKEN;
  if (!refreshToken) {
    return NextResponse.json({ error: "refresh disabled" }, { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization || !safeCompare(authorization, `Bearer ${refreshToken}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  revalidatePath("/", "layout");
  return NextResponse.json({ revalidated: true });
}
