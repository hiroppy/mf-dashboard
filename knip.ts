import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignore: ["debug/**"],
  workspaces: {
    "apps/web": {
      ignoreDependencies: ["postcss"],
    },
    "apps/crawler": {
      ignore: ["src/auth.ts", "src/hooks/helpers.ts"],
    },
    "apps/simulator": {
      ignoreDependencies: ["postcss"],
    },
    "apps/mcp": {
      ignoreDependencies: ["@libsql/client"],
    },
  },
};

export default config;
