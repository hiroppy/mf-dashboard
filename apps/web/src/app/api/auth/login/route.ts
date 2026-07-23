import { NextResponse } from "next/server";
import {
  applyPrivateCacheHeaders,
  createSessionToken,
  getSessionTtlSeconds,
  SESSION_COOKIE_NAME,
} from "../../../../lib/dashboard-auth";
import { isSameOriginRequest } from "../../../../lib/request-origin";

export const dynamic = "force-dynamic";

async function passwordsMatch(actual: string, expected: string): Promise<boolean> {
  const message = new TextEncoder().encode("mf-dashboard-password-check");
  const algorithm = { name: "HMAC", hash: "SHA-256" };
  const expectedKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(expected),
    algorithm,
    false,
    ["sign"],
  );
  const actualKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(actual),
    algorithm,
    false,
    ["verify"],
  );
  const expectedSignature = await crypto.subtle.sign("HMAC", expectedKey, message);

  return crypto.subtle.verify("HMAC", actualKey, expectedSignature, message);
}

function privateResponse(response: NextResponse): NextResponse {
  applyPrivateCacheHeaders(response.headers);
  return response;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return privateResponse(NextResponse.json({ error: "Invalid origin" }, { status: 403 }));
  }

  const configuredPassword = process.env.DASHBOARD_PASSWORD;
  const formData = await request.formData();
  const password = formData.get("password");

  if (
    !configuredPassword ||
    typeof password !== "string" ||
    !(await passwordsMatch(password, configuredPassword))
  ) {
    return privateResponse(
      NextResponse.redirect(new URL("/login/?error=invalid", request.url), 303),
    );
  }

  const token = await createSessionToken();
  if (!token) {
    return privateResponse(
      NextResponse.json({ error: "Authentication is not configured" }, { status: 503 }),
    );
  }

  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getSessionTtlSeconds(),
  });
  return privateResponse(response);
}
