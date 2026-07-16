import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import type { NextConfig } from "next";

const rootEnvPath = join(import.meta.dirname, "../../.env");

if (existsSync(rootEnvPath)) {
  loadEnvFile(rootEnvPath);
}

const isStaticDemoBuild = process.env.DEMO_MODE === "true";

const nextConfig: NextConfig = {
  output: isStaticDemoBuild ? "export" : undefined,
  pageExtensions: isStaticDemoBuild ? ["tsx"] : ["tsx", "ts"],
  typedRoutes: true,
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  reactCompiler: true,
  experimental: {
    typedEnv: true,
  },
};

export default nextConfig;
