import { mfUrls } from "@mf-dashboard/meta/urls";

export type AccountDetailType = "show" | "show_manual";

export function extractAccountMfIdFromDetailUrl(
  href: string,
  type: AccountDetailType,
): string | null {
  try {
    const pathname = new URL(href, mfUrls.home).pathname;
    const match = pathname.match(new RegExp(`^/accounts/${type}/([^/]+)$`));
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function isExpectedAccountDetailPage(
  responseOk: boolean,
  currentUrl: string,
  expectedPath: string,
): boolean {
  if (!responseOk) return false;

  try {
    return new URL(currentUrl, mfUrls.home).pathname === expectedPath;
  } catch {
    return false;
  }
}
