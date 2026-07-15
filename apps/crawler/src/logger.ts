const isDebug = process.env.DEBUG === "true";
const isCI = process.env.CI === "true";

function time(): string {
  return new Date().toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour12: false,
  });
}

function section(title: string) {
  if (isCI) return;
  // oxlint-disable-next-line no-console
  console.log(`\n--- ${title} ---`);
}

export function phase(title: string) {
  if (isCI) {
    info(`Phase: ${title}`);
  } else {
    section(title);
  }
}

export function log(...args: unknown[]) {
  if (isCI) return;
  // oxlint-disable-next-line no-console
  console.log(`[${time()}]`, ...args);
}

export function info(...args: unknown[]) {
  // oxlint-disable-next-line no-console
  console.log(`[${time()}]`, ...args);
}

export function debug(...args: unknown[]) {
  if (isDebug) {
    // oxlint-disable-next-line no-console
    console.log(`[${time()}] [DEBUG]`, ...args);
  }
}

export function warn(...args: unknown[]) {
  // oxlint-disable-next-line no-console
  console.warn(`[${time()}] [WARN]`, ...args);
}

export function error(...args: unknown[]) {
  // oxlint-disable-next-line no-console
  console.error(`[${time()}] [ERROR]`, ...args);
}
