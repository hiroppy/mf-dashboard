import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import type { NextConfig } from "next";

const rootEnvPath = join(import.meta.dirname, "../../.env");

if (existsSync(rootEnvPath)) {
  loadEnvFile(rootEnvPath);
}

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const basePath = isGitHubPages ? `/${process.env.NEXT_PUBLIC_GITHUB_REPO}` : "";

// Set NEXT_PUBLIC_BASE_PATH for client-side use (e.g., images)
process.env.NEXT_PUBLIC_BASE_PATH = basePath;

const nextConfig: NextConfig = {
  output: isGitHubPages ? "export" : undefined,
  typedRoutes: true,
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  reactCompiler: true,
  experimental: {
    typedEnv: true,
  },
  basePath,
};

export default nextConfig;
