import { describe, expect, it } from "vitest";
import { createMobileMetadata } from "./mobile-metadata";

describe("createMobileMetadata", () => {
  it.each([
    ["local deployment", "", "/manifest.webmanifest", "/apple-touch-icon.png"],
    [
      "GitHub Pages deployment",
      "/mf-dashboard",
      "/mf-dashboard/manifest.webmanifest",
      "/mf-dashboard/apple-touch-icon.png",
    ],
  ])("creates mobile asset URLs for a %s", (_, basePath, manifest, appleIcon) => {
    expect(createMobileMetadata(basePath)).toMatchObject({
      manifest,
      icons: {
        apple: appleIcon,
      },
      appleWebApp: {
        capable: true,
        statusBarStyle: "black",
        title: "MF Dashboard",
      },
    });
  });
});
