import { NextResponse } from "next/server";
import { hasValidCloudflareAccess } from "../../../../lib/cloudflare-access";
import {
  parseCrawlerRefreshStatus,
  unavailableCrawlerRefreshStatus,
} from "../../../../lib/crawler-refresh-status";
import { isSameOriginRequest } from "../../../../lib/request-security";

export const dynamic = "force-dynamic";

const REQUEST_TIMEOUT_MS = 5_000;

function isSameOriginRead(request: Request): boolean {
  return request.headers.get("sec-fetch-site") === "same-origin" || isSameOriginRequest(request);
}

function getCrawlerUrl(): string | null {
  const crawlerUrl = process.env.CRAWLER_URL?.trim();
  if (!crawlerUrl) {
    return null;
  }

  return crawlerUrl.replace(/\/+$/, "");
}

function unavailableCrawlerEvents() {
  return new Response(`data: ${JSON.stringify(unavailableCrawlerRefreshStatus)}\n\n`, {
    headers: {
      "cache-control": "no-cache, no-transform",
      "content-type": "text/event-stream",
    },
  });
}

async function proxyCrawlerRequest(path: "/runs", init?: RequestInit) {
  const crawlerUrl = getCrawlerUrl();
  if (!crawlerUrl) {
    return NextResponse.json(unavailableCrawlerRefreshStatus, { status: 503 });
  }

  try {
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${process.env.REFRESH_TOKEN ?? ""}`);
    const res = await fetch(`${crawlerUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body: unknown = await res.json().catch(() => null);

    return NextResponse.json(parseCrawlerRefreshStatus(body, res.ok || res.status === 409), {
      status: res.status,
    });
  } catch {
    return NextResponse.json(unavailableCrawlerRefreshStatus, { status: 503 });
  }
}

async function proxyCrawlerEvents(request: Request) {
  const crawlerUrl = getCrawlerUrl();
  if (!crawlerUrl) {
    return unavailableCrawlerEvents();
  }

  const controller = new AbortController();
  const abortUpstream = () => controller.abort(request.signal.reason);
  request.signal.addEventListener("abort", abortUpstream, { once: true });
  const handshakeTimeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${crawlerUrl}/events`, {
      cache: "no-store",
      headers: {
        accept: "text/event-stream",
        authorization: `Bearer ${process.env.REFRESH_TOKEN ?? ""}`,
      },
      signal: controller.signal,
    });
    clearTimeout(handshakeTimeout);
    if (!response.ok || !response.body) {
      request.signal.removeEventListener("abort", abortUpstream);
      return unavailableCrawlerEvents();
    }

    return new Response(response.body, {
      headers: {
        "cache-control": "no-cache, no-transform",
        "content-type": "text/event-stream",
      },
    });
  } catch {
    clearTimeout(handshakeTimeout);
    request.signal.removeEventListener("abort", abortUpstream);
    return unavailableCrawlerEvents();
  }
}

export async function GET(request: Request) {
  if (!(await hasValidCloudflareAccess(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSameOriginRead(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  return proxyCrawlerEvents(request);
}

export async function POST(request: Request) {
  if (!(await hasValidCloudflareAccess(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  return proxyCrawlerRequest("/runs", { method: "POST" });
}
