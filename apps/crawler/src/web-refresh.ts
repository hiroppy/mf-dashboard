import { error, info, log } from "./logger.js";

const DEFAULT_MAX_ATTEMPTS = 12;
const DEFAULT_RETRY_DELAY_SECONDS = 5;
const REQUEST_TIMEOUT_MS = 10_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function notifyWebRefresh(): Promise<void> {
  const baseUrl = process.env.WEB_URL;
  if (!baseUrl) {
    log("WEB_URL is not set, skipping web cache refresh");
    return;
  }

  const refreshUrl = new URL("/api/refresh", baseUrl).toString();
  const maxAttempts = Number(process.env.REFRESH_MAX_ATTEMPTS ?? DEFAULT_MAX_ATTEMPTS);
  const retryDelayMs =
    Number(process.env.REFRESH_RETRY_DELAY ?? DEFAULT_RETRY_DELAY_SECONDS) * 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    info(`Notifying ${refreshUrl} (attempt ${attempt}/${maxAttempts})`);
    try {
      const res = await fetch(refreshUrl, {
        method: "POST",
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
