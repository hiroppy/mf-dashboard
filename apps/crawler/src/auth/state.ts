import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { BrowserContext } from "playwright";
import { debug } from "../logger.js";

const DEFAULT_AUTH_STATE_PATH = path.join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "data",
  "auth-state.json",
);

export function getAuthStatePath(env: NodeJS.ProcessEnv = process.env): string {
  const configuredPath = env.AUTH_STATE_PATH?.trim();
  if (configuredPath) {
    return path.resolve(configuredPath);
  }

  return DEFAULT_AUTH_STATE_PATH;
}

export function hasAuthState(): boolean {
  return existsSync(getAuthStatePath());
}

export async function saveAuthState(context: BrowserContext): Promise<void> {
  const authStatePath = getAuthStatePath();
  await mkdir(path.dirname(authStatePath), { recursive: true });
  await context.storageState({ path: authStatePath });
  debug(`Auth state saved to ${authStatePath}`);
}
