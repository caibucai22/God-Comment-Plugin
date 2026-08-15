import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface BuiltManifest {
  readonly manifest_version?: unknown;
  readonly permissions?: unknown;
  readonly host_permissions?: unknown;
  readonly content_scripts?: ReadonlyArray<{
    readonly matches?: unknown;
  }>;
}

export function buildExtension(mode?: "e2e"): void {
  const viteCli = resolve("node_modules/vite/bin/vite.js");
  const args = [viteCli, "build"];
  if (mode) args.push("--mode", mode);
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Vite ${mode ?? "production"} build failed with exit code ${String(result.status)}`);
  }
}

export async function verifyProductionManifest(): Promise<void> {
  const manifest = JSON.parse(await readFile(resolve("dist/manifest.json"), "utf8")) as BuiltManifest;
  const matches = manifest.content_scripts?.map((script) => script.matches);
  if (manifest.manifest_version !== 3) throw new Error("Production manifest must remain MV3");
  if (JSON.stringify(manifest.permissions) !== JSON.stringify(["storage", "downloads"])) {
    throw new Error(`Unexpected production permissions: ${JSON.stringify(manifest.permissions)}`);
  }
  if (manifest.host_permissions !== undefined) {
    throw new Error(`Production host_permissions must remain absent: ${JSON.stringify(manifest.host_permissions)}`);
  }
  if (JSON.stringify(matches) !== JSON.stringify([["https://www.bilibili.com/video/*"]])) {
    throw new Error(`Unexpected production content-script matches: ${JSON.stringify(matches)}`);
  }
}
