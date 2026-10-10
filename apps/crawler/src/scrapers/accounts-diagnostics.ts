import { randomUUID } from "node:crypto";
import type { Frame, Page, Request, Response } from "playwright";
import { safeErrorDetails, safePageLocation, writeCrawlerDiagnostic } from "../auth/diagnostics.js";

type AccountsOperation = "registered_accounts" | "refresh_navigation" | "refresh_status";
type AccountsStage = "navigation" | "table_wait" | "row_read" | "status_read";
type NavigationState = "not_started" | "in_progress" | "completed" | "failed";
interface AccountsDiagnosticOptions {
  operationId?: string;
  attempt?: number;
  maxAttempts?: number;
}

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
    const details = safeErrorDetails(failure);
    return {
      snapshot_available: false,
      snapshot_error_type: details.error_type,
      snapshot_failure_kind: details.failure_kind,
      snapshot_network_code: details.network_code,
      snapshot_timeout_ms: details.timeout_ms,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function withAccountsPageDiagnostics<T>(
  page: Page,
  operation: AccountsOperation,
  action: (
    checkpoint: (stage: AccountsStage) => Promise<void>,
    navigation: (state: "started" | "completed") => void,
  ) => Promise<T>,
  options: AccountsDiagnosticOptions = {},
): Promise<T> {
  let stage: AccountsStage = "navigation";
  let httpStatus: number | null = null;
  const started = performance.now();
  const operationId = options.operationId ?? randomUUID();
  const navigationStatus = { state: "not_started" as NavigationState };
  let navigationStarted: number | null = null;
  let pageCrashed = false;
  let documentCount = 0;
  const documents = new WeakMap<Request, number>();
  const documentId = (request: Request) => {
    let id = documents.get(request);
    if (id === undefined) {
      id = ++documentCount;
      documents.set(request, id);
    }
    return id;
  };
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
      operation_id: operationId,
      attempt: options.attempt ?? null,
      max_attempts: options.maxAttempts ?? null,
      stage,
      navigation_state: navigationStatus.state,
      page_crashed: pageCrashed,
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
  const navigation = (next: "started" | "completed") => {
    if (next === "started") {
      navigationStatus.state = "in_progress";
      navigationStarted = performance.now();
      emit("accounts_goto_started");
    } else {
      navigationStatus.state = "completed";
      emit("accounts_goto_completed", {
        goto_elapsed_ms:
          navigationStarted === null ? null : Math.round(performance.now() - navigationStarted),
      });
    }
  };
  const isMainDocument = (request: Request) => {
    try {
      return request.isNavigationRequest() && request.frame() === page.mainFrame();
    } catch {
      return false;
    }
  };
  const responseReceived = (response: Response) => {
    const request = response.request();
    if (isMainDocument(request)) {
      httpStatus = response.status();
      emit("accounts_http_response", {
        document_id: documentId(request),
        response_location: safePageLocation(response.url()),
      });
    }
  };
  const requestFailed = (request: Request) => {
    if (isMainDocument(request)) {
      emit("accounts_request_failed", {
        document_id: documentId(request),
        request_location: safePageLocation(request.url()),
        ...safeErrorDetails(new Error(request.failure()?.errorText ?? "")),
      });
    }
  };
  const requestStarted = (request: Request) => {
    if (isMainDocument(request)) {
      emit("accounts_document_requested", {
        document_id: documentId(request),
        request_location: safePageLocation(request.url()),
      });
    }
  };
  const frameNavigated = (frame: Frame) => {
    if (frame === page.mainFrame()) emit("accounts_frame_navigated");
  };
  const domContentLoaded = () => emit("accounts_domcontentloaded");
  const loaded = () => emit("accounts_load");
  const closed = () => emit("accounts_page_closed", { page_closed: true });
  const crashed = () => {
    pageCrashed = true;
    emit("accounts_page_crashed");
  };
  page.on("request", requestStarted);
  page.on("response", responseReceived);
  page.on("requestfailed", requestFailed);
  page.on("framenavigated", frameNavigated);
  page.on("domcontentloaded", domContentLoaded);
  page.on("load", loaded);
  page.on("close", closed);
  page.on("crash", crashed);
  try {
    const result = await action(checkpoint, navigation);
    await snapshot("accounts_page_done");
    return result;
  } catch (failure) {
    if (navigationStatus.state === "in_progress") {
      navigationStatus.state = "failed";
      emit("accounts_goto_failed", {
        goto_elapsed_ms:
          navigationStarted === null ? null : Math.round(performance.now() - navigationStarted),
        ...safeErrorDetails(failure),
      });
    }
    await snapshot("accounts_page_failed", safeErrorDetails(failure));
    throw failure;
  } finally {
    page.off("request", requestStarted);
    page.off("response", responseReceived);
    page.off("requestfailed", requestFailed);
    page.off("framenavigated", frameNavigated);
    page.off("domcontentloaded", domContentLoaded);
    page.off("load", loaded);
    page.off("close", closed);
    page.off("crash", crashed);
  }
}
