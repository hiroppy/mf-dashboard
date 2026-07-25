import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    "apps/crawler": {
      ignore: ["src/hooks/helpers.ts"],
    },
  },
};

export default config;
