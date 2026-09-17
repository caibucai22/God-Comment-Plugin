import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

async function readProjectFile(path: string): Promise<string> {
  return readFile(resolve(path), "utf8");
}

describe("GitHub CI workflow", () => {
  it("validates pull requests and master with minimal permissions and concurrency cancellation", async () => {
    const workflow = await readProjectFile(".github/workflows/ci.yml");

    expect(workflow).toMatch(/pull_request:\s*$/mu);
    expect(workflow).toMatch(/push:\s*\n\s+branches:\s*\[master\]/u);
    expect(workflow).toMatch(/permissions:\s*\n\s+contents:\s*read/u);
    expect(workflow).toMatch(/group:\s*ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}/u);
    expect(workflow).toMatch(/cancel-in-progress:\s*true/u);
  });

  it("uses Node 22 and runs every shared gate on Ubuntu", async () => {
    const workflow = await readProjectFile(".github/workflows/ci.yml");

    expect(workflow).toMatch(/runs-on:\s*ubuntu-latest/u);
    expect(workflow).toMatch(/actions\/checkout@v4/u);
    expect(workflow).toMatch(/actions\/setup-node@v4/u);
    expect(workflow).toMatch(/node-version:\s*22/u);
    expect(workflow).toMatch(/cache:\s*npm/u);
    expect(workflow).toContain("run: npm ci");
    expect(workflow).toContain("run: npx playwright install --with-deps chromium");
    expect(workflow).toContain("run: npm run verify:ci");
    expect(workflow).not.toMatch(/pwsh|powershell/iu);
  });

  it("uploads Playwright diagnostics only after failure", async () => {
    const workflow = await readProjectFile(".github/workflows/ci.yml");

    expect(workflow).toMatch(/if:\s*failure\(\)/u);
    expect(workflow).toMatch(/actions\/upload-artifact@v4/u);
    expect(workflow).toMatch(/path:\s*\|\s*\n\s+playwright-report\/\s*\n\s+test-results\//u);
  });

  it("exposes cross-platform scripts for the shared release gates", async () => {
    const packageJson = JSON.parse(await readProjectFile("package.json")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts).toMatchObject({
      typecheck: "tsc --noEmit",
      "audit:production": "node scripts/audit-production-package.mjs",
      "test:ci": "vitest --run",
      "verify:ci": "npm run test:ci && npm run typecheck && npm run build && npm run audit:production && npm run test:e2e",
    });
  });
});
