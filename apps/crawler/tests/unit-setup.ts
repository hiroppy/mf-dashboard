import path from "node:path";
import { vi } from "vitest";

type LogMock = (...args: any[]) => void;

try {
  process.loadEnvFile(path.resolve(process.cwd(), "../../.env"));
} catch {
  // .env file not found (e.g., CI environment)
}

// Global mock for logger to suppress console output in unit tests
vi.mock("../src/logger.js", () => ({
  log: vi.fn<LogMock>(),
  info: vi.fn<LogMock>(),
  debug: vi.fn<LogMock>(),
  warn: vi.fn<LogMock>(),
  error: vi.fn<LogMock>(),
  section: vi.fn<LogMock>(),
  phase: vi.fn<LogMock>(),
}));
