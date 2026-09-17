import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

async function runVerifier(tag: string, manifestVersion: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const directory = await mkdtemp(join(tmpdir(), "comment-card-release-version-"));
  temporaryDirectories.push(directory);
  const manifestPath = join(directory, "manifest.json");
  await writeFile(manifestPath, JSON.stringify({ version: manifestVersion }), "utf8");
  try {
    const result = await execFileAsync(process.execPath, [
      resolve("scripts/verify-release-version.mjs"),
      tag,
      manifestPath,
    ]);
    return { ...result, exitCode: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      exitCode: failure.code ?? 1,
    };
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("tagged extension release", () => {
  it("accepts only an exact tag, package, and manifest version match", async () => {
    const result = await runVerifier("v0.1.0", "0.1.0");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("Release version verified: 0.1.0\n");
    expect(result.stderr).toBe("");
  });

  it.each(["0.1.0", "v01.1.0", "v1.2", "v1.2.3-beta.1"])("rejects invalid release tag %s", async (tag) => {
    const result = await runVerifier(tag, "0.1.0");

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/^Release version verification failed: /u);
  });

  it("rejects a version mismatch", async () => {
    const result = await runVerifier("v0.1.1", "0.1.1");

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("package.json version 0.1.0 does not match tag v0.1.1");
  });

  it("packages verified production files and publishes only for version tags", async () => {
    const workflow = await readFile(resolve(".github/workflows/release.yml"), "utf8");

    expect(workflow).toMatch(/tags:\s*\["v\*"\]/u);
    expect(workflow).toMatch(/permissions:\s*\n\s+contents:\s*write/u);
    expect(workflow).toContain("run: npm run verify:ci");
    expect(workflow).toContain('node scripts/verify-release-version.mjs "$GITHUB_REF_NAME" dist/manifest.json');
    expect(workflow).toMatch(/cd dist\s*\n\s*zip -r "\.\.\/release\/comment-card-extension-\$\{GITHUB_REF_NAME\}\.zip" \./u);
    expect(workflow).toMatch(/unzip -Z1 .*\| grep -qx "manifest\.json"/u);
    expect(workflow).toMatch(/sha256sum "[^"]+\.zip" > "[^"]+\.zip\.sha256"/u);
    expect(workflow).toMatch(/gh release create "\$GITHUB_REF_NAME"/u);
    expect(workflow).toContain("comment-card-extension-${GITHUB_REF_NAME}.zip.sha256");
  });
});
