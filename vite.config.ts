import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import { manifestForMode } from "./manifest.config";

export default defineConfig(({ mode }) => ({
  plugins: [crx({ manifest: manifestForMode(mode) })],
  test: {
    environment: "jsdom",
    css: true,
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
  },
}));
