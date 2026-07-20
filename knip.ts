import type { KnipConfig } from "knip";

const localOnlyIgnoreDependencies = process.env.CI ? [] : ["lefthook"];

const config: KnipConfig = {
  ...(localOnlyIgnoreDependencies.length > 0 && {
    ignoreDependencies: localOnlyIgnoreDependencies,
  }),
  workspaces: {
    "apps/crawler": {
      ignore: ["src/hooks/helpers.ts", "vitest.mutation.config.ts"],
    },
    "apps/mcp": {
      ignoreDependencies: ["@libsql/client"],
    },
    "apps/web": {
      ignore: ["vitest.mutation.config.ts"],
    },
  },
};

export default config;
