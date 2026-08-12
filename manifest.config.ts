import type { ManifestV3Export } from "@crxjs/vite-plugin";

const manifest: ManifestV3Export = {
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
};

export default manifest;
