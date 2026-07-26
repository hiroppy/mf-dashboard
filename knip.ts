import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignoreBinaries: ["ps"],
  ignoreDependencies: ["lefthook"],
  workspaces: {
    "apps/crawler": {
      ignore: ["src/hooks/helpers.ts", "vitest.mutation.config.ts"],
    },
    "apps/web": {
      ignore: ["vitest.mutation.config.ts"],
    },
  },
};

export default config;
