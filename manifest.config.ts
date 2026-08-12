import type { ManifestV3Export } from "@crxjs/vite-plugin";

const manifest = {
  manifest_version: 3,
  name: "神评卡片",
  version: "0.1.0",
  permissions: ["storage", "downloads"],
  content_scripts: [
    {
      matches: ["https://www.bilibili.com/video/*"],
      js: ["src/content/index.ts"],
    },
  ],
} satisfies ManifestV3Export;

export default manifest;
