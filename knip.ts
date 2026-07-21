import type { KnipConfig } from "knip";

const localOnlyIgnoreDependencies = process.env.CI ? [] : ["lefthook"];

const config: KnipConfig = {
  ...(localOnlyIgnoreDependencies.length > 0 && {
    ignoreDependencies: localOnlyIgnoreDependencies,
  }),
  workspaces: {
    "apps/crawler": {
      ignore: ["src/hooks/helpers.ts"],
    },
    "apps/mcp": {
      ignoreDependencies: ["@libsql/client"],
    },
    "packages/analytics": {
      ignoreBinaries: ["codex"],
    },
  },
};

export default config;
