const DEFAULT_SITE_URL = "https://mf-dashboard-demo.vercel.app";

export function createMetadataBase(
  environment: Record<string, string | undefined> = process.env,
): URL {
  const siteUrl =
    environment.NEXT_PUBLIC_SITE_URL ??
    environment.VERCEL_PROJECT_PRODUCTION_URL ??
    environment.VERCEL_URL ??
    DEFAULT_SITE_URL;

  return new URL(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`);
}
