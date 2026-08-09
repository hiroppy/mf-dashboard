import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    "apps/crawler": {
      ignore: ["src/hooks/helpers.ts", "vitest.mutation.config.ts"],
    },
    "apps/web": {
      ignore: ["vitest.mutation.config.ts"],
      entry: ["e2e/mock-crawler-server.ts"],
    },
    "packages/db": {
      entry: ["src/migrate.ts"],
    },
  },
};

export default config;
