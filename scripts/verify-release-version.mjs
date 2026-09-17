import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const strictVersion = "(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)";
const strictTagPattern = new RegExp(`^v(${strictVersion})$`, "u");

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

async function main() {
  const [tag, manifestPath] = process.argv.slice(2);
  if (!tag || !manifestPath) {
    throw new Error("usage: node scripts/verify-release-version.mjs <vMAJOR.MINOR.PATCH> <manifest-path>");
  }

  const tagMatch = strictTagPattern.exec(tag);
  if (!tagMatch) throw new Error(`tag ${tag} must match vMAJOR.MINOR.PATCH`);
  const version = tagMatch[1];
  const packageJson = await readJson("package.json");
  const manifest = await readJson(manifestPath);

  if (packageJson.version !== version) {
    throw new Error(`package.json version ${String(packageJson.version)} does not match tag ${tag}`);
  }
  if (manifest.version !== version) {
    throw new Error(`manifest version ${String(manifest.version)} does not match tag ${tag}`);
  }

  process.stdout.write(`Release version verified: ${version}\n`);
}

main().catch((error) => {
  process.stderr.write(`Release version verification failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
