import { defineConfig } from "@playwright/test";

// Playwright forces color in workers; inheriting NO_COLOR at the same time makes Node emit a warning.
delete process.env.NO_COLOR;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 8_000,
  },
  reporter: [["list"]],
  outputDir: "test-results/e2e",
  globalSetup: "./tests/e2e/support/global-setup.ts",
  globalTeardown: "./tests/e2e/support/global-teardown.ts",
  use: {
    trace: "retain-on-failure",
  },
});
