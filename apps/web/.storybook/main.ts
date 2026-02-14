import type { StorybookConfig } from "@storybook/nextjs-vite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ["../src/components/**/*.stories.@(ts|tsx)"],
  framework: "@storybook/nextjs-vite",
  addons: ["@storybook/addon-a11y", "@storybook/addon-vitest"],
  features: {
    experimentalRSC: true,
  },
  async viteFinal(config) {
    const existingAlias = config.resolve?.alias;
    const baseAlias =
      typeof existingAlias === "object" && existingAlias !== null && !Array.isArray(existingAlias)
        ? existingAlias
        : {};

    return {
      ...config,
      resolve: {
        ...config.resolve,
        alias: Object.assign({}, baseAlias, {
          "@mf-dashboard/db": join(__dirname, "../__mocks__/@mf-dashboard/db.ts"),
        }),
      },
    };
  },
};

export default config;
