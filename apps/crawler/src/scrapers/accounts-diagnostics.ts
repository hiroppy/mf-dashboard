import type { Page, Request, Response } from "playwright";
import { safeErrorDetails, safePageLocation, writeCrawlerDiagnostic } from "../auth/diagnostics.js";

type AccountsOperation = "registered_accounts" | "refresh_navigation" | "refresh_status";
type AccountsStage = "navigation" | "table_wait" | "row_read" | "status_read";

// Record structure and a boolean match for the known maintenance heading only.
// Never record page text, HTML, account identifiers, or form values. A snapshot
// failure must not replace the crawler failure; bound an unresponsive probe.
export async function inspectAccountsPage(page: Page) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (page.isClosed()) return { snapshot_available: false, page_closed: true };
    const snapshot = await Promise.race([
      page.evaluate(() => {
        const tables = [...document.querySelectorAll("#account-table")];
        const visibility = tables.map((element) => {
          const rectangle = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return (
            rectangle.width > 0 &&
            rectangle.height > 0 &&
            style.visibility !== "hidden" &&
            style.visibility !== "collapse"
          );
        });
        return {
          ready_state: document.readyState,
          table_count: tables.length,
          visible_table_count: visibility.filter(Boolean).length,
          first_table_visible: visibility[0] ?? false,
          status_row_count: document.querySelectorAll("#account-table tr:has(td.account-status)")
            .length,
          has_password_input: !!document.querySelector('input[type="password"]'),
          has_otp_input: !!document.querySelector('input[autocomplete="one-time-code"]'),
          has_captcha_frame: !!document.querySelector(
            'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"]',
          ),
          maintenance_notice_present: [
            ...document.querySelectorAll('h1, h2, h3, [role="heading"]'),
          ].some(
            (heading) =>
              heading.textContent?.replace(/\s+/g, "") === "ただいま、メンテナンス作業中です",
          ),
        };
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const failure = new Error("Snapshot timed out");
          failure.name = "TimeoutError";
          reject(failure);
        }, 2000);
      }),
    ]);
    return { snapshot_available: true, page_closed: false, ...snapshot };
  } catch (failure) {
    return { snapshot_available: false, snapshot_error_type: safeErrorDetails(failure).error_type };
  } finally {
    clearTimeout(timer);
  }
}

export async function withAccountsPageDiagnostics<T>(
  page: Page,
  operation: AccountsOperation,
  action: (checkpoint: (stage: AccountsStage) => Promise<void>) => Promise<T>,
): Promise<T> {
  let stage: AccountsStage = "navigation";
  let httpStatus: number | null = null;
  const started = performance.now();
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
      operation,
      stage,
      location: location(),
      http_status: httpStatus,
      elapsed_ms: Math.round(performance.now() - started),
      ...details,
    });
  const snapshot = async (event: string, details = {}) => {
    const structure = await inspectAccountsPage(page);
    emit(event, { ...structure, ...details });
  };
  const checkpoint = async (next: AccountsStage) => {
    stage = next;
    await snapshot("accounts_stage_started");
  };
  const isMainDocument = (request: Request) => {
    try {
      return request.isNavigationRequest() && request.frame() === page.mainFrame();
    } catch {
      return false;
    }
  };
  const responseReceived = (response: Response) => {
    if (isMainDocument(response.request())) {
      httpStatus = response.status();
      emit("accounts_http_response", { response_location: safePageLocation(response.url()) });
    }
  };
  const requestFailed = (request: Request) => {
    if (isMainDocument(request)) {
      emit("accounts_request_failed", {
        request_location: safePageLocation(request.url()),
        ...safeErrorDetails(new Error(request.failure()?.errorText ?? "")),
      });
    }
  };
  page.on("response", responseReceived);
  page.on("requestfailed", requestFailed);
  try {
    const result = await action(checkpoint);
    await snapshot("accounts_page_done");
    return result;
  } catch (failure) {
    await snapshot("accounts_page_failed", safeErrorDetails(failure));
    throw failure;
  } finally {
    page.off("response", responseReceived);
    page.off("requestfailed", requestFailed);
  }
}
