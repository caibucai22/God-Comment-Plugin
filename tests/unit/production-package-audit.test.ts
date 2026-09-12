import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditProductionPackage, FORBIDDEN_PRODUCTION_SOURCE_TOKENS } from "../../scripts/audit-production-package.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

async function createProductionDist(overrides: {
  readonly contentScriptText?: string;
  readonly filesToOmit?: readonly string[];
  readonly manifest?: Record<string, unknown>;
} = {}): Promise<string> {
  const distDir = await mkdtemp(join(tmpdir(), "ccg-production-package-audit-"));
  temporaryDirectories.push(distDir);
  await mkdir(join(distDir, "assets"));

  const manifest = {
    manifest_version: 3,
    permissions: ["storage", "downloads"],
    content_scripts: [{ matches: ["https://www.bilibili.com/video/*"], js: ["assets/content.js"] }],
    ...overrides.manifest,
  };
  const files = [
    "assets/content.js",
    "assets/mascot-master-example.png",
    "assets/bottom-ground-example.png",
    "assets/state-generating-example.png",
    "assets/state-failed-example.png",
    "assets/state-saved-example.png",
    "assets/bottom-editing-example.png",
    "assets/bottom-generating-example.png",
    "assets/bottom-failed-example.png",
    "assets/bottom-generated-example.png",
    "assets/bottom-saved-example.png",
  ];

  await writeFile(join(distDir, "manifest.json"), JSON.stringify(manifest), "utf8");
  for (const relativePath of files) {
    if (overrides.filesToOmit?.includes(relativePath)) continue;
    const filePath = join(distDir, relativePath);
    await writeFile(filePath, relativePath.endsWith(".js") ? overrides.contentScriptText ?? "console.log('extension content');" : "pixel", "utf8");
  }

  return distDir;
}

describe("auditProductionPackage", () => {
  it("returns an immutable normalized audit for a valid production package", async () => {
    const validDist = await createProductionDist();

    const result = await auditProductionPackage({ distDir: validDist });

    expect(result).toMatchObject({
      manifestVersion: 3,
      matches: [["https://www.bilibili.com/video/*"]],
      permissions: ["storage", "downloads"],
      requiredFiles: expect.arrayContaining([
        expect.objectContaining({ path: "assets/content.js", size: expect.any(Number) }),
        expect.objectContaining({ path: "assets/mascot-master-example.png", size: expect.any(Number) }),
      ]),
      forbiddenPatternFindings: [],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.requiredFiles)).toBe(true);
  });

  it("rejects a localhost content-script match", async () => {
    const distDir = await createProductionDist({
      manifest: { content_scripts: [{ matches: ["http://127.0.0.1/*"], js: ["assets/content.js"] }] },
    });

    await expect(auditProductionPackage({ distDir })).rejects.toThrow("content-script matches");
  });

  it("rejects permissions outside the production allowlist", async () => {
    const distDir = await createProductionDist({ manifest: { permissions: ["storage", "downloads", "tabs"] } });

    await expect(auditProductionPackage({ distDir })).rejects.toThrow("permissions");
  });

  it("rejects a manifest that declares host permissions", async () => {
    const distDir = await createProductionDist({ manifest: { host_permissions: ["https://example.com/*"] } });

    await expect(auditProductionPackage({ distDir })).rejects.toThrow("host_permissions");
  });

  it("rejects a missing or empty content script", async () => {
    const missingDist = await createProductionDist({ filesToOmit: ["assets/content.js"] });
    const emptyDist = await createProductionDist({ contentScriptText: "" });

    await expect(auditProductionPackage({ distDir: missingDist })).rejects.toThrow("assets/content.js");
    await expect(auditProductionPackage({ distDir: emptyDist })).rejects.toThrow("assets/content.js");
  });

  it("rejects a missing required pixel-asset family", async () => {
    const distDir = await createProductionDist({ filesToOmit: ["assets/bottom-saved-example.png"] });

    await expect(auditProductionPackage({ distDir })).rejects.toThrow("bottom-saved");
  });

  it("rejects an emitted telemetry or upload marker", async () => {
    const distDir = await createProductionDist({ contentScriptText: `const endpoint = "${FORBIDDEN_PRODUCTION_SOURCE_TOKENS[0]}";` });

    await expect(auditProductionPackage({ distDir })).rejects.toThrow("forbidden project-owned source token");
  });
});
