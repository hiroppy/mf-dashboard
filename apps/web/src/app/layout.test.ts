import { afterEach, describe, expect, it, vi } from "vitest";

const originalBasePath = process.env.NEXT_PUBLIC_BASE_PATH;

afterEach(() => {
  vi.resetModules();

  if (originalBasePath === undefined) {
    delete process.env.NEXT_PUBLIC_BASE_PATH;
  } else {
    process.env.NEXT_PUBLIC_BASE_PATH = originalBasePath;
  }
});

async function loadMetadata(basePath?: string) {
  if (basePath === undefined) {
    delete process.env.NEXT_PUBLIC_BASE_PATH;
  } else {
    process.env.NEXT_PUBLIC_BASE_PATH = basePath;
  }

  const { metadata } = await import("./layout");
  return metadata;
}

describe("root metadata", () => {
  it("uses root-relative asset URLs for root deployments", async () => {
    const metadata = await loadMetadata();

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

  it("prefixes asset URLs for subpath deployments", async () => {
    const metadata = await loadMetadata("/dashboard");

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
