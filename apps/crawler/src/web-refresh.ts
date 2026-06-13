import { error, info, log } from "./logger.js";

const DEFAULT_MAX_ATTEMPTS = 12;
const DEFAULT_RETRY_DELAY_SECONDS = 5;
const REQUEST_TIMEOUT_MS = 10_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function positiveIntegerFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function notifyWebRefresh(): Promise<void> {
  // WEB_URL enables refresh notifications; REFRESH_TOKEN is required once enabled.
  const baseUrl = process.env.WEB_URL;
  if (!baseUrl) {
    info("WEB_URL is not set, skipping web cache refresh");
    return;
  }

  const refreshToken = process.env.REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error("REFRESH_TOKEN is not set");
  }

  const refreshUrl = new URL("/api/refresh/", baseUrl).toString();
  const maxAttempts = positiveIntegerFromEnv(
    process.env.REFRESH_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS,
  );
  const retryDelayMs =
    nonNegativeNumberFromEnv(process.env.REFRESH_RETRY_DELAY, DEFAULT_RETRY_DELAY_SECONDS) * 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log(`Notifying ${refreshUrl} (attempt ${attempt}/${maxAttempts})`);
    try {
      const res = await fetch(refreshUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${refreshToken}`,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) {
        info("Web cache refresh acknowledged");
        return;
      }
      error(`Refresh attempt ${attempt} returned HTTP ${res.status}`);
    } catch (err) {
      error(`Refresh attempt ${attempt} failed:`, err);
    }
    if (attempt < maxAttempts) {
      await sleep(retryDelayMs);
    }
  }

  throw new Error(`Failed to refresh web cache after ${maxAttempts} attempts`);
}
