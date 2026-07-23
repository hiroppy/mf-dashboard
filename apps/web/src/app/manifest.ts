import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export function createManifest(): MetadataRoute.Manifest {
  return {
    name: "MoneyForward Me Dashboard",
    short_name: "MF Dashboard",
    description: "MoneyForward Me のデータを可視化するダッシュボード",
    start_url: "./",
    scope: "./",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#020617",
    lang: "ja",
    icons: [
      {
        src: "icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

export default createManifest;
