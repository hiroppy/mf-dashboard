export function getDashboardUrl(
  environment: Record<string, string | undefined> = process.env,
): string | undefined {
  const dashboardUrl = environment.DASHBOARD_URL?.trim();
  if (!dashboardUrl) return undefined;

  const normalizedDashboardUrl = dashboardUrl.replace(/\/+$/, "");
  const basePath = environment.NEXT_PUBLIC_BASE_PATH?.trim().replace(/\/+$/, "") ?? "";
  if (!basePath || normalizedDashboardUrl.endsWith(basePath)) return normalizedDashboardUrl;

  return `${normalizedDashboardUrl}${basePath}`;
}
