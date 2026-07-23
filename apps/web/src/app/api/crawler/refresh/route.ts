import { NextResponse } from "next/server";
import { applyPrivateCacheHeaders, hasValidSession } from "../../../../lib/dashboard-auth";
import { isSameOriginRequest } from "../../../../lib/request-origin";

export const dynamic = "force-dynamic";

const REQUEST_TIMEOUT_MS = 5_000;

function privateJson(body: unknown, status: number) {
  const response = NextResponse.json(body, { status });
  applyPrivateCacheHeaders(response.headers);
  return response;
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
    return privateJson({ available: false, running: false }, 503);
  }

  try {
    const res = await fetch(`${crawlerUrl}${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    return privateJson({ available: true, ...body }, res.status);
  } catch {
    return privateJson({ available: false, running: false }, 503);
  }
}

export async function GET(request: Request) {
  if (!(await hasValidSession(request))) {
    return privateJson({ error: "Unauthorized" }, 401);
  }

  return proxyCrawlerRequest("/status");
}

export async function POST(request: Request) {
  if (!(await hasValidSession(request))) {
    return privateJson({ error: "Unauthorized" }, 401);
  }

  if (!isSameOriginRequest(request)) {
    return privateJson({ error: "Invalid origin" }, 403);
  }

  return proxyCrawlerRequest("/runs", { method: "POST" });
}
