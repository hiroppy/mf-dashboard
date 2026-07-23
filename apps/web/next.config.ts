import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import type { NextConfig } from "next";

const rootEnvPath = join(import.meta.dirname, "../../.env");

if (existsSync(rootEnvPath)) {
  loadEnvFile(rootEnvPath);
}

const isStaticDemoBuild = process.env.DEMO_MODE === "true";
const privateResponseHeaders = [
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
  { key: "CDN-Cache-Control", value: "no-store" },
  { key: "Cloudflare-CDN-Cache-Control", value: "no-store" },
  { key: "Surrogate-Control", value: "no-store" },
  { key: "Pragma", value: "no-cache" },
  { key: "Vary", value: "Cookie" },
];

const nextConfig: NextConfig = {
  output: isStaticDemoBuild ? "export" : "standalone",
  outputFileTracingRoot: join(import.meta.dirname, "../.."),
  pageExtensions: isStaticDemoBuild ? ["tsx"] : ["tsx", "ts"],
  typedRoutes: true,
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  reactCompiler: true,
  async headers() {
    if (isStaticDemoBuild) {
      return [];
    }

    return [{ source: "/:path*", headers: privateResponseHeaders }];
  },
  experimental: {
    typedEnv: true,
  },
};

export default nextConfig;
