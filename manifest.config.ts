import type { ManifestV3Export } from "@crxjs/vite-plugin";

const manifest = {
  manifest_version: 3,
  name: "有神评",
  version: "0.1.0",
  permissions: ["storage", "downloads"],
  content_scripts: [
    {
      matches: ["https://www.bilibili.com/video/*"],
      js: ["src/content/index.ts"],
    },
  ],
} satisfies ManifestV3Export;

export function manifestForMode(mode: string): ManifestV3Export {
  if (mode !== "e2e") return manifest;

  return {
    ...manifest,
    content_scripts: [
      {
        matches: ["http://127.0.0.1/*"],
        js: ["src/content/index.ts"],
      },
    ],
  };
}

export default manifest;
