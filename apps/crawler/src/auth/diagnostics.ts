import { appendFileSync } from "node:fs";
import type { Page, Request, Response } from "playwright";
import { info, warn } from "../logger.js";

// Persist only fixed labels and numeric metadata. Error messages, URLs, headers,
// credentials and page contents can contain personal information.
export const AUTH_PHASES = [
  "session_check",
  "credentials_fetch",
  "mfid_open",
  "email_input",
  "email_submit",
  "password_input",
  "password_submit",
  "otp_probe",
  "otp_fetch",
  "otp_submit",
  "mfid_redirect",
  "me_open",
  "me_redirect",
  "account_select",
  "account_redirect",
  "me_password_input",
  "me_password_submit",
  "me_login_redirect",
  "session_verify",
  "auth_state_save",
] as const;
export type AuthPhase = (typeof AUTH_PHASES)[number];
export type AuthCheckpoint = (phase: AuthPhase) => void;

const NETWORK_CODES = [
  "ERR_NAME_NOT_RESOLVED",
  "ERR_INTERNET_DISCONNECTED",
  "ERR_NETWORK_CHANGED",
  "ERR_CONNECTION_RESET",
  "ERR_CONNECTION_CLOSED",
  "ERR_CONNECTION_REFUSED",
  "ERR_CONNECTION_TIMED_OUT",
  "ERR_TIMED_OUT",
  "ERR_ADDRESS_UNREACHABLE",
  "ERR_PROXY_CONNECTION_FAILED",
  "ERR_TUNNEL_CONNECTION_FAILED",
  "ERR_ABORTED",
  "ERR_CERT_AUTHORITY_INVALID",
  "ERR_CERT_DATE_INVALID",
  "ERR_CERT_COMMON_NAME_INVALID",
  "ERR_SSL_PROTOCOL_ERROR",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENETUNREACH",
  "EHOSTUNREACH",
] as const;

export function safeErrorDetails(failure: unknown) {
  const message = failure instanceof Error ? failure.message : "";
  const networkCode =
    NETWORK_CODES.find((code) => new RegExp(`\\b${code}\\b`).test(message)) ?? null;
  const timeoutMatch = message.match(/(?:timeout|timed out)[^\d\n]{0,20}(\d{1,9})\s*ms/i);
  return {
    error_type:
      failure instanceof Error && failure.name === "TimeoutError"
        ? "timeout"
        : networkCode
          ? "network"
          : "operation_failed",
    network_code: networkCode,
    timeout_ms: timeoutMatch ? Number(timeoutMatch[1]) : null,
  };
}

export function safePageLocation(value: string): string {
  try {
    const url = new URL(value);
    if (url.origin === "https://id.moneyforward.com") {
      if (url.pathname === "/sign_in") return "mfid_sign_in";
      if (url.pathname === "/sign_in/password") return "mfid_password";
      if (url.pathname.includes("account_selector")) return "mfid_account_selector";
      return "mfid_other";
    }
    if (url.origin === "https://moneyforward.com") {
      if (url.pathname === "/accounts" || url.pathname.startsWith("/accounts/"))
        return "me_accounts";
      if (url.pathname === "/sign_in") return "me_sign_in";
      return "me_other";
    }
  } catch {
    /* No raw URL is logged. */
  }
  return "other";
}

export function writeCrawlerDiagnostic(event: Record<string, unknown>): void {
  const record = JSON.stringify({ version: 1, at: new Date().toISOString(), ...event });
  info(`MF_CRAWLER_DIAGNOSTIC ${record}`);
  const destination = process.env.CRAWLER_DIAGNOSTIC_PATH;
  if (destination) {
    try {
      appendFileSync(destination, `${record}\n`, { encoding: "utf8", mode: 0o600 });
    } catch {
      warn("Could not persist crawler diagnostic");
    }
  }
}

export async function withAuthDiagnostics<T>(
  page: Page,
  action: (checkpoint: AuthCheckpoint) => Promise<T>,
): Promise<T> {
  let phase: AuthPhase = "credentials_fetch";
  const started = performance.now();
  let phaseStarted = started;
  let completed = false;
  const location = () => {
    try {
      return safePageLocation(page.url());
    } catch {
      return "other";
    }
  };
  const emit = (event: string, details = {}) =>
    writeCrawlerDiagnostic({
      event,
      phase,
      location: location(),
      elapsed_ms: Math.round(performance.now() - phaseStarted),
      ...details,
    });
  const checkpoint: AuthCheckpoint = (nextPhase) => {
    if (completed) emit("phase_done");
    phase = nextPhase;
    phaseStarted = performance.now();
    completed = true;
    emit("phase_started");
  };
  // Observe document requests only: third-party resources and their URLs are excluded.
  const requestFailed = (request: Request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      emit("request_failed", safeErrorDetails(new Error(request.failure()?.errorText ?? "")));
    }
  };
  const responseReceived = (response: Response) => {
    const request = response.request();
    if (
      response.status() >= 400 &&
      request.isNavigationRequest() &&
      request.frame() === page.mainFrame()
    ) {
      emit("http_error", { http_status: response.status() });
    }
  };
  page.on("requestfailed", requestFailed);
  page.on("response", responseReceived);
  try {
    const result = await action(checkpoint);
    emit("phase_done");
    emit("auth_done", { total_elapsed_ms: Math.round(performance.now() - started) });
    return result;
  } catch (failure) {
    emit("auth_failed", safeErrorDetails(failure));
    throw failure;
  } finally {
    page.off("requestfailed", requestFailed);
    page.off("response", responseReceived);
  }
}
