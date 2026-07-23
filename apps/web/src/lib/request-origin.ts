function readForwardedHeader(request: Request, name: string): string | null {
  return request.headers.get(name)?.split(",")[0]?.trim() || null;
}

export function isSameOriginRequest(request: Request): boolean {
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
