import * as a11yAddonAnnotations from "@storybook/addon-a11y/preview";
import { setProjectAnnotations } from "@storybook/nextjs-vite";
import * as previewAnnotations from "./preview.js";

setProjectAnnotations([a11yAddonAnnotations, previewAnnotations]);
