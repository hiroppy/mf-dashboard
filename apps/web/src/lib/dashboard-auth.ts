const TOKEN_VERSION = "v1";
const DEFAULT_SESSION_TTL_SECONDS = 12 * 60 * 60;
const MIN_SESSION_TTL_SECONDS = 5 * 60;
const MAX_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export const SESSION_COOKIE_NAME = "mf-dashboard-session";
const PRIVATE_CACHE_CONTROL = "private, no-store, max-age=0";

function getSessionSecret(): string | null {
  return process.env.DASHBOARD_SESSION_SECRET?.trim() || null;
}

function encodeHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeHex(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]+$/.test(value) || value.length % 2 !== 0) {
    return null;
  }

  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function isDashboardAuthDisabled(): boolean {
  return process.env.DEMO_MODE === "true";
}

export function getSessionTtlSeconds(): number {
  const configuredTtl = Number(process.env.DASHBOARD_SESSION_TTL_SECONDS);
  if (
    Number.isInteger(configuredTtl) &&
    configuredTtl >= MIN_SESSION_TTL_SECONDS &&
    configuredTtl <= MAX_SESSION_TTL_SECONDS
  ) {
    return configuredTtl;
  }

  return DEFAULT_SESSION_TTL_SECONDS;
}

export async function createSessionToken(now = Date.now()): Promise<string | null> {
  const secret = getSessionSecret();
  if (!secret) {
    return null;
  }

  const expiresAt = Math.floor(now / 1000) + getSessionTtlSeconds();
  const payload = `${TOKEN_VERSION}.${expiresAt}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importHmacKey(secret),
    new TextEncoder().encode(payload),
  );

  return `${payload}.${encodeHex(signature)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  if (isDashboardAuthDisabled()) {
    return true;
  }

  const secret = getSessionSecret();
  if (!secret || !token) {
    return false;
  }

  const [version, expiresAtValue, signatureValue, extra] = token.split(".");
  const expiresAt = Number(expiresAtValue);
  const signature = signatureValue ? decodeHex(signatureValue) : null;

  if (
    version !== TOKEN_VERSION ||
    extra !== undefined ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(now / 1000) ||
    !signature
  ) {
    return false;
  }

  return crypto.subtle.verify(
    "HMAC",
    await importHmacKey(secret),
    signature,
    new TextEncoder().encode(`${version}.${expiresAt}`),
  );
}

export function readSessionCookie(cookieHeader: string | null): string | undefined {
  for (const cookie of cookieHeader?.split(";") ?? []) {
    const separatorIndex = cookie.indexOf("=");
    const name = cookie.slice(0, separatorIndex).trim();
    if (separatorIndex >= 0 && name === SESSION_COOKIE_NAME) {
      return cookie.slice(separatorIndex + 1);
    }
  }

  return undefined;
}

export async function hasValidSession(request: Request): Promise<boolean> {
  return verifySessionToken(readSessionCookie(request.headers.get("cookie")));
}

export function applyPrivateCacheHeaders(headers: Headers): void {
  headers.set("cache-control", PRIVATE_CACHE_CONTROL);
  headers.set("pragma", "no-cache");
  headers.append("vary", "Cookie");
}
