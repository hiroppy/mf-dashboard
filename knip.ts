import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    "apps/crawler": {
      ignore: ["src/hooks/helpers.ts"],
    },
    "apps/mcp": {
      ignoreDependencies: ["@libsql/client"],
    },
  },
};

export default config;
