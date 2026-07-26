import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignoreBinaries: ["ps"],
  ignoreDependencies: ["lefthook"],
  workspaces: {
    "apps/crawler": {
      ignore: ["src/hooks/helpers.ts"],
    },
  },
};

export default config;
