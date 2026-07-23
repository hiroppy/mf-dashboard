import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignoreDependencies: ["lefthook"],
  workspaces: {
    "apps/crawler": {
      ignore: ["src/hooks/helpers.ts"],
    },
    "packages/db": {
      ignoreDependencies: ["libsql"],
    },
  },
};

export default config;
