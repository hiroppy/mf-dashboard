import { NextResponse } from "next/server";
import { applyPrivateCacheHeaders, SESSION_COOKIE_NAME } from "../../../../lib/dashboard-auth";
import { isSameOriginRequest } from "../../../../lib/request-origin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    const response = NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    applyPrivateCacheHeaders(response.headers);
    return response;
  }

  const response = NextResponse.redirect(new URL("/login/", request.url), 303);
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  applyPrivateCacheHeaders(response.headers);
  return response;
}
