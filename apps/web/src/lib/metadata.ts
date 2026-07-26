import type { Metadata } from "next";

const DEMO_SITE_URL = "https://mf-dashboard-demo.vercel.app";
const LOCAL_SITE_URL = "http://localhost:3000";
const DASHBOARD_DESCRIPTION = "MoneyForward Me のデータを可視化するダッシュボード";

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

export function createRootMetadata(
  environment: Record<string, string | undefined> = process.env,
): Metadata {
  const basePath = environment.NEXT_PUBLIC_BASE_PATH ?? "";
  const withBasePath = (path: `/${string}`) => `${basePath}${path}`;

  return {
    metadataBase: createMetadataBase(environment),
    title: {
      template: "%s | MoneyForward Me Dashboard",
      default: "MoneyForward Me Dashboard",
    },
    description: DASHBOARD_DESCRIPTION,
    manifest: withBasePath("/manifest.webmanifest"),
    icons: {
      apple: withBasePath("/apple-touch-icon.png"),
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "black",
      title: "MF Dashboard",
    },
    openGraph: {
      title: "MoneyForward Me Dashboard",
      description: DASHBOARD_DESCRIPTION,
      type: "website",
      locale: "ja_JP",
      images: [
        {
          url: withBasePath("/logo.png"),
          width: 758,
          height: 708,
          alt: "MoneyForward Me Dashboard",
        },
      ],
    },
    twitter: {
      card: "summary",
      title: "MoneyForward Me Dashboard",
      description: DASHBOARD_DESCRIPTION,
      images: [withBasePath("/logo.png")],
    },
  };
}
