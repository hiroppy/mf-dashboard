const DEMO_SITE_URL = "https://mf-dashboard-demo.vercel.app";
const LOCAL_SITE_URL = "http://localhost:3000";

export function createMetadataBase(
  environment: Record<string, string | undefined> = process.env,
): URL {
  const siteUrl =
    environment.NEXT_PUBLIC_SITE_URL ??
    environment.DASHBOARD_URL ??
    environment.VERCEL_PROJECT_PRODUCTION_URL ??
    environment.VERCEL_URL;

  if (siteUrl) {
    return new URL(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`);
  }

  if (environment.DEMO_MODE === "true") {
    return new URL(DEMO_SITE_URL);
  }

  if (environment.NODE_ENV === "production") {
    throw new Error("DASHBOARD_URL is required for production metadata");
  }

  return new URL(LOCAL_SITE_URL);
}
