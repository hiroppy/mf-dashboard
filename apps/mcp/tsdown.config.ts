import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "cjs",
  platform: "node",
  noExternal: [/.*/],
  external: ["@libsql/client"],
});
