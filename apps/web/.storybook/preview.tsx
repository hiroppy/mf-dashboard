import type { Preview } from "@storybook/nextjs-vite";
import { Suspense } from "react";
import "../src/app/globals.css";

// Note: @mf-dashboard/db is aliased to a mock in vitest.config.ts
// to prevent better-sqlite3 (native addon) from being loaded in the browser

const preview: Preview = {
  decorators: [
    (Story) => (
      <Suspense>
        <Story />
      </Suspense>
    ),
  ],
  initialGlobals: {
    viewport: { value: "reset", isRotated: false },
  },
  parameters: {
    a11y: {
      test: "error",
    },
    viewport: {
      // Workaround for https://github.com/storybookjs/storybook/issues/27073
      defaultViewport: "reset",
      options: {
        desktop: {
          name: "Desktop",
          styles: {
            width: "1280px",
            height: "800px",
          },
        },
        tablet: {
          name: "Tablet",
          styles: {
            width: "768px",
            height: "1024px",
          },
        },
        pixel7: {
          name: "Pixel 7",
          styles: {
            width: "412px",
            height: "915px",
          },
        },
        iphone14: {
          name: "iPhone 14",
          styles: {
            width: "390px",
            height: "844px",
          },
        },
      },
    },
    options: {
      storySort: {
        order: ["Design Token", "*"],
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
