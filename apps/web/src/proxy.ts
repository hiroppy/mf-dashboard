import { type NextRequest, NextResponse } from "next/server";
import {
  applyPrivateCacheHeaders,
  isDashboardAuthDisabled,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "./lib/dashboard-auth";

function privateResponse(response: NextResponse): NextResponse {
  applyPrivateCacheHeaders(response.headers);
  return response;
}

export async function proxy(request: NextRequest) {
  if (isDashboardAuthDisabled()) {
    return NextResponse.next();
  }

  const authenticated = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const isLoginPage =
    request.nextUrl.pathname === "/login/" || request.nextUrl.pathname === "/login";

  if (isLoginPage) {
    if (authenticated) {
      return privateResponse(NextResponse.redirect(new URL("/", request.url)));
    }
    return privateResponse(NextResponse.next());
  }

  if (!authenticated) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return privateResponse(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }

    return privateResponse(NextResponse.redirect(new URL("/login/", request.url)));
  }

  return privateResponse(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|api/auth|api/refresh).*)"],
};
