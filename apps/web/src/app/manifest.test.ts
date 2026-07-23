import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createManifest } from "./manifest";

const publicDirectory = join(import.meta.dirname, "../../public");

function readPngSize(relativePath: string) {
  const image = readFileSync(join(publicDirectory, relativePath));

  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
  };
}

describe("createManifest", () => {
  it("provides an installable standalone app rooted at the deployment path", () => {
    const manifest = createManifest();

    expect(manifest).toMatchObject({
      name: "MoneyForward Me Dashboard",
      short_name: "MF Dashboard",
      start_url: "./",
      scope: "./",
      display: "standalone",
      lang: "ja",
    });
  });

  it("provides Android icons at the required sizes with maskable support", () => {
    const manifest = createManifest();

    expect(manifest.icons).toEqual([
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
    ]);
  });

  it.each([
    ["icons/icon-192.png", 192],
    ["icons/icon-512.png", 512],
    ["apple-touch-icon.png", 180],
  ])("ships %s as a square %dpx icon", (path, size) => {
    expect(readPngSize(path)).toEqual({ width: size, height: size });
  });
});
