import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { auditProductionPackage } from "../../scripts/audit-production-package.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

async function createProductionDist(overrides: {
  readonly contentScriptText?: string;
  readonly contentScriptCssText?: string;
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
    "assets/content.css",
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
    const contents = relativePath.endsWith(".js")
      ? overrides.contentScriptText ?? "console.log('extension content');"
      : relativePath.endsWith(".css")
        ? overrides.contentScriptCssText ?? ".ccg-panel { color: #111; }"
        : "pixel";
    await writeFile(filePath, contents, "utf8");
  }

  return distDir;
}

async function createCliWorkingDirectory(overrides: Parameters<typeof createProductionDist>[0] = {}): Promise<string> {
  const distDir = await createProductionDist(overrides);
  const workingDirectory = await mkdtemp(join(tmpdir(), "ccg-production-package-audit-cli-"));
  temporaryDirectories.push(workingDirectory);
  await rename(distDir, join(workingDirectory, "dist"));
  return workingDirectory;
}

async function createSourceDirectory(files: Readonly<Record<string, string>>): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "ccg-production-package-source-"));
  temporaryDirectories.push(projectRoot);
  const sourceDir = join(projectRoot, "src");
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = join(sourceDir, relativePath);
    await mkdir(resolve(filePath, ".."), { recursive: true });
    await writeFile(filePath, contents, "utf8");
  }
  return sourceDir;
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

  it("rejects a missing or empty manifest-declared content stylesheet", async () => {
    const styledManifest = { content_scripts: [{ matches: ["https://www.bilibili.com/video/*"], js: ["assets/content.js"], css: ["assets/content.css"] }] };
    const missingDist = await createProductionDist({ manifest: styledManifest, filesToOmit: ["assets/content.css"] });
    const emptyDist = await createProductionDist({ manifest: styledManifest, contentScriptCssText: "" });

    await expect(auditProductionPackage({ distDir: missingDist })).rejects.toThrow("assets/content.css");
    await expect(auditProductionPackage({ distDir: emptyDist })).rejects.toThrow("assets/content.css");
  });

  it("rejects a missing required pixel-asset family", async () => {
    const distDir = await createProductionDist({ filesToOmit: ["assets/bottom-saved-example.png"] });

    await expect(auditProductionPackage({ distDir })).rejects.toThrow("bottom-saved");
  });

  it.each([
    ["navigator.sendBeacon", "navigator.sendBeacon('https://telemetry.example/collect', 'payload');"],
    ["external fetch", "fetch('https://telemetry.example/collect');"],
    ["XMLHttpRequest", "const request = new XMLHttpRequest(); request.open('POST', 'https://telemetry.example/collect');"],
    ["WebSocket", "new WebSocket('wss://telemetry.example/socket');"],
    ["telemetry endpoint", "const endpoint = 'https://api.example.com/telemetry/v1/events';"],
    ["comment upload endpoint", "const endpoint = 'https://api.example.com/api/comment/upload';"],
  ])("rejects the project-owned %s network sink or endpoint", async (_name, contentScriptText) => {
    const distDir = await createProductionDist({ contentScriptText });

    await expect(auditProductionPackage({ distDir })).rejects.toThrow("forbidden production network pattern");
  });

  it.each([
    "fetch('https://i0.hdslb.com/bfs/archive/cover.jpg');",
    "fetch('https://www.bilibili.com/images/cover.jpg');",
    "fetch('data:image/png;base64,AAAA');",
    "fetch('blob:https://www.bilibili.com/cover-artifact');",
  ])("allows an expected page-asset fetch source: %s", async (contentScriptText) => {
    const distDir = await createProductionDist({ contentScriptText });

    await expect(auditProductionPackage({ distDir })).resolves.toMatchObject({ forbiddenPatternFindings: [] });
  });

  it("rejects a dynamic collector fetch outside the image-loading allowlist", async () => {
    const distDir = await createProductionDist();
    const sourceDir = await createSourceDirectory({ "content/collector.ts": "export const collect = (collectorUrl: string) => fetch(collectorUrl);" });

    await expect(auditProductionPackage({ distDir, sourceDir })).rejects.toThrow("source-level network call");
  });

  it("rejects a Bilibili reply-add POST even from the image-loading allowlist file", async () => {
    const distDir = await createProductionDist();
    const sourceDir = await createSourceDirectory({
      "render/card-renderer.ts": "fetch('https://api.bilibili.com/x/v2/reply/add', { method: 'POST', body: 'reply=1' });",
    });

    await expect(auditProductionPackage({ distDir, sourceDir })).rejects.toThrow("source-level network call");
  });

  it("accepts an ordinary analytics-dashboard label and an allowlisted renderer image fetch", async () => {
    const distDir = await createProductionDist({ contentScriptText: "const label = '/analytics-dashboard';" });
    const sourceDir = await createSourceDirectory({
      "render/card-renderer.ts": "const coverUrl = 'https://i0.hdslb.com/bfs/archive/cover.jpg'; fetch(coverUrl, { method: 'GET' });",
    });

    await expect(auditProductionPackage({ distDir, sourceDir })).resolves.toMatchObject({ forbiddenPatternFindings: [] });
  });

  it("prints exactly one JSON line from the successful CLI", async () => {
    const workingDirectory = await createCliWorkingDirectory();
    const result = spawnSync(process.execPath, [resolve("scripts/audit-production-package.mjs")], { cwd: workingDirectory, encoding: "utf8", timeout: 10_000 });
    const stdout = String(result.stdout);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(stdout).toMatch(/^\{.*\}\r?\n$/);
    expect(stdout.trimEnd().split(/\r?\n/)).toHaveLength(1);
    expect(JSON.parse(stdout)).toMatchObject({ manifestVersion: 3, forbiddenPatternFindings: [] });
  });

  it("writes one concise error line and exits non-zero when the CLI audit fails", async () => {
    const workingDirectory = await createCliWorkingDirectory({
      manifest: { content_scripts: [{ matches: ["http://127.0.0.1/*"], js: ["assets/content.js"] }] },
    });
    const result = spawnSync(process.execPath, [resolve("scripts/audit-production-package.mjs")], { cwd: workingDirectory, encoding: "utf8", timeout: 10_000 });
    const stderr = String(result.stderr);

    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(stderr).toMatch(/^Production package audit failed: .+\r?\n$/);
    expect(stderr.trimEnd().split(/\r?\n/)).toHaveLength(1);
    expect(stderr.length).toBeLessThan(240);
  });
});
