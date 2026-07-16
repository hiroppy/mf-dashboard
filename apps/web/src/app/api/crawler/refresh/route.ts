import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const REQUEST_TIMEOUT_MS = 5_000;

function readForwardedHeader(request: Request, name: string): string | null {
  return request.headers.get(name)?.split(",")[0]?.trim() || null;
}

function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }

  try {
    const requestUrl = new URL(request.url);
    const originUrl = new URL(origin);
    const forwardedHost = readForwardedHeader(request, "x-forwarded-host");
    const forwardedProto = readForwardedHeader(request, "x-forwarded-proto");
    const host = forwardedHost ?? request.headers.get("host") ?? requestUrl.host;
    const protocol = forwardedProto ? `${forwardedProto}:` : requestUrl.protocol;

    return originUrl.protocol === protocol && originUrl.host === host;
  } catch {
    return false;
  }
}

function getCrawlerUrl(): string | null {
  const crawlerUrl = process.env.CRAWLER_URL?.trim();
  if (!crawlerUrl) {
    return null;
  }

  return crawlerUrl.replace(/\/+$/, "");
}

async function proxyCrawlerRequest(path: "/status" | "/runs", init?: RequestInit) {
  const crawlerUrl = getCrawlerUrl();
  if (!crawlerUrl) {
    return NextResponse.json({ available: false, running: false }, { status: 503 });
  }

  try {
    const res = await fetch(`${crawlerUrl}${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    return NextResponse.json(
      {
        available: true,
        ...body,
      },
      { status: res.status },
    );
  } catch {
    return NextResponse.json({ available: false, running: false }, { status: 503 });
  }
}

export async function GET() {
  return proxyCrawlerRequest("/status");
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  return proxyCrawlerRequest("/runs", { method: "POST" });
}
