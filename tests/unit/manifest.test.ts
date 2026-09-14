import { describe, expect, it } from "vitest";
import manifest from "../../manifest.config";

describe("extension manifest", () => {
  it("uses MV3 with the production Bilibili video match and exact permissions", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe("有神评");
    expect(manifest.content_scripts).toEqual([
      {
        matches: ["https://www.bilibili.com/video/*"],
        js: ["src/content/index.ts"],
      },
    ]);
    expect(manifest.permissions).toEqual(["storage", "downloads"]);
  });
});
