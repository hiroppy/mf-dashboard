import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const rootEnvPath = join(import.meta.dirname, "../../.env");

if (existsSync(rootEnvPath)) {
  loadEnvFile(rootEnvPath);
}

export default function createNextConfig(phase: string): NextConfig {
  const isStaticDemoBuild = process.env.DEMO_MODE === "true" && phase === PHASE_PRODUCTION_BUILD;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

  return {
    basePath,
    output: isStaticDemoBuild ? "export" : "standalone",
    outputFileTracingRoot: join(import.meta.dirname, "../.."),
    pageExtensions: isStaticDemoBuild ? ["tsx"] : ["tsx", "ts"],
    env: {
      NEXT_PUBLIC_STATIC_DEMO_BUILD: isStaticDemoBuild ? "true" : "false",
    },
    typedRoutes: true,
    images: {
      unoptimized: true,
    },
    trailingSlash: true,
    reactCompiler: true,
    experimental: {
      typedEnv: true,
      useTypeScriptCli: true,
    },
  };
}
