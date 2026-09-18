import { describe, expect, it } from "vitest";
import { createMetadataBase, createRootMetadata } from "./metadata";

describe("createMetadataBase", () => {
  it("uses the public demo URL for demo builds", () => {
    expect(createMetadataBase({ DEMO_MODE: "true", NODE_ENV: "production" }).href).toBe(
      "https://mf-dashboard-demo.vercel.app/",
    );
  });

  it("prefers the explicitly configured site URL", () => {
    expect(
      createMetadataBase({ NEXT_PUBLIC_SITE_URL: "https://dashboard.example.com/base/" }).href,
    ).toBe("https://dashboard.example.com/base/");
  });

  it("uses the configured self-hosted dashboard URL", () => {
    expect(createMetadataBase({ DASHBOARD_URL: "https://self-hosted.example.com" }).href).toBe(
      "https://self-hosted.example.com/",
    );
  });

  it("adds HTTPS to Vercel hostnames", () => {
    expect(createMetadataBase({ VERCEL_URL: "preview.example.com" }).href).toBe(
      "https://preview.example.com/",
    );
  });

  it("uses localhost during local development", () => {
    expect(createMetadataBase({ NODE_ENV: "development" }).href).toBe("http://localhost:3000/");
  });

  it("requires the dashboard URL for self-hosted production", () => {
    expect(() => createMetadataBase({ NODE_ENV: "production" })).toThrow(
      "DASHBOARD_URL is required for production metadata",
    );
  });
});

describe("createRootMetadata", () => {
  it("uses root-relative asset URLs for root deployments", () => {
    const metadata = createRootMetadata({ NODE_ENV: "development" });

    expect(metadata.openGraph?.images).toEqual([
      {
        url: "/logo.png",
        width: 758,
        height: 708,
        alt: "MoneyForward Me Dashboard",
      },
    ]);
    expect(metadata.twitter?.images).toEqual(["/logo.png"]);
  });

  it("prefixes asset URLs for subpath deployments", () => {
    const metadata = createRootMetadata({
      NODE_ENV: "development",
      NEXT_PUBLIC_BASE_PATH: "/dashboard",
    });

    expect(metadata.manifest).toBe("/dashboard/manifest.webmanifest");
    expect(metadata.icons).toEqual({ apple: "/dashboard/apple-touch-icon.png" });
    expect(metadata.openGraph?.images).toEqual([
      {
        url: "/dashboard/logo.png",
        width: 758,
        height: 708,
        alt: "MoneyForward Me Dashboard",
      },
    ]);
    expect(metadata.twitter?.images).toEqual(["/dashboard/logo.png"]);
  });
});
