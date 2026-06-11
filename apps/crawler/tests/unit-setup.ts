import path from "node:path";
import { vi } from "vitest";

try {
  process.loadEnvFile(path.resolve(process.cwd(), "../../.env"));
} catch {
  // .env file not found (e.g., CI environment)
}

// Global mock for logger to suppress console output in unit tests
vi.mock("../src/logger.js", () => ({
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  section: vi.fn(),
}));
