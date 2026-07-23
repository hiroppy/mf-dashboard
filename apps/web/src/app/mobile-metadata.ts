import type { Metadata } from "next";

export function createMobileMetadata(basePath: string): Metadata {
  return {
    manifest: `${basePath}/manifest.webmanifest`,
    icons: {
      apple: `${basePath}/apple-touch-icon.png`,
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "black",
      title: "MF Dashboard",
    },
  };
}
