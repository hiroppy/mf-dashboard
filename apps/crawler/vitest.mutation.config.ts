import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 120000,
    hookTimeout: 60000,
    include: ["src/**/*.test.ts"],
    setupFiles: ["./tests/unit-setup.ts"],
  },
});
