import { expect, test as base, chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdtemp, mkdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startStaticFixtureServer } from "./support/static-server";

interface ExtensionFixture {
  readonly context: BrowserContext;
  readonly page: Page;
  readonly url: string;
  readonly errors: string[];
}

const test = base.extend<{ extension: ExtensionFixture }>({
  extension: async ({}, use) => {
    let server: Awaited<ReturnType<typeof startStaticFixtureServer>> | null = null;
    let profileDirectory: string | null = null;
    let context: BrowserContext | null = null;
    let operationError: unknown;

    try {
      server = await startStaticFixtureServer();
      profileDirectory = await mkdtemp(join(tmpdir(), "comment-card-e2e-profile-"));
      const downloadDirectory = join(profileDirectory, "downloads");
      await mkdir(downloadDirectory);
      const extensionPath = resolve("dist");
      context = await chromium.launchPersistentContext(profileDirectory, {
        acceptDownloads: true,
        channel: "chromium",
        downloadsPath: downloadDirectory,
        headless: true,
        args: [
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
        ],
      });
      const page = context.pages()[0] ?? await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });
      await use({ context, page, url: server.url, errors });
    } catch (error) {
      operationError = error;
      throw error;
    } finally {
      const cleanupErrors: unknown[] = [];
      const cleanup = async (action: (() => Promise<void>) | null): Promise<void> => {
        if (!action) return;
        try {
          await action();
        } catch (error) {
          cleanupErrors.push(error);
        }
      };
      await cleanup(context ? () => context!.close() : null);
      await cleanup(server ? () => server!.close() : null);
      await cleanup(profileDirectory ? () => rm(profileDirectory!, { recursive: true, force: true }) : null);
      if (operationError === undefined && cleanupErrors.length > 0) {
        throw new AggregateError(cleanupErrors, "Failed to clean up the E2E browser resources");
      }
    }
  },
});

async function enterSelection(page: Page): Promise<void> {
  await page.getByRole("button", { name: "开启评论选择" }).click();
  await expect(page.getByText("请选择一条评论")).toBeVisible();
}

test("loads the unpacked extension and downloads a non-empty PNG through the full selection flow", async ({ extension }) => {
  const { page, url, errors } = extension;
  await page.goto(url);

  const entry = page.getByRole("button", { name: "开启评论选择" });
  await expect(entry).toBeVisible();
  await enterSelection(page);

  const comment = page.getByTestId("comment-item").first();
  await comment.hover();
  await expect(comment).toHaveClass(/ccg-comment-hover/);
  const highlight = page.locator("[data-ccg-comment-highlight]");
  await expect(highlight).toBeVisible();
  expect(await highlight.evaluate((element) => getComputedStyle(element, "::before").animationName)).toBe(
    "ccg-comment-border-flow",
  );
  await comment.click();

  const confirm = page.getByRole("region", { name: "生成评论卡片" });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText("历史不是过去的回声，而是今天仍在发生的选择。")).toBeVisible();
  await expect(confirm.locator('input[name="ccg-style"]')).toHaveCount(4);
  await expect(confirm.locator('input[name="ccg-ratio"][value="3:4"]')).toBeChecked();
  await expect(confirm.getByRole("checkbox", { name: "包含视频封面" })).toBeEnabled();
  await expect(confirm.getByRole("checkbox", { name: "包含视频封面" })).toBeChecked();
  await expect(confirm.getByRole("checkbox", { name: "添加游戏化装饰" })).not.toBeChecked();

  const observedDownload = page.waitForEvent("download", { timeout: 20_000 });
  await confirm.getByRole("button", { name: "生成卡片" }).click();
  const download = await observedDownload;
  await expect(page.getByRole("status").locator("span")).toHaveText("卡片已保存", { timeout: 20_000 });
  expect(download.suggestedFilename()).toMatch(/\.png$/u);
  expect(await download.failure()).toBeNull();
  const pngPath = await download.path();
  expect(pngPath).not.toBeNull();
  if (!pngPath) throw new Error("Playwright did not retain the PNG download");
  expect((await stat(pngPath)).size).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("supports every selection exit while wheel keeps selection active", async ({ extension }) => {
  const { page, url } = extension;
  await page.goto(url);
  const prompt = page.getByText("请选择一条评论");
  const comment = page.getByTestId("comment-item").first();

  await enterSelection(page);
  await page.mouse.wheel(0, 240);
  await expect(prompt).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(prompt).toBeHidden();

  await enterSelection(page);
  await page.evaluate(() => {
    (window as typeof window & { fixtureContextMenus?: number }).fixtureContextMenus = 0;
    document.addEventListener("contextmenu", () => {
      (window as typeof window & { fixtureContextMenus: number }).fixtureContextMenus += 1;
    });
  });
  await comment.click({ button: "right" });
  await expect(prompt).toBeHidden();
  expect(await page.evaluate(() => (window as typeof window & { fixtureContextMenus?: number }).fixtureContextMenus)).toBe(0);

  await enterSelection(page);
  await page.getByTestId("outside").click();
  await expect(prompt).toBeHidden();

  await enterSelection(page);
  await page.getByRole("button", { name: "开启评论选择" }).click();
  await expect(prompt).toBeHidden();

  await enterSelection(page);
  await page.getByRole("button", { name: "退出评论选择" }).click();
  await expect(prompt).toBeHidden();
});

test("reduced motion disables the cyclic entry animation without blocking selection", async ({ extension }) => {
  const { page, url } = extension;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url);
  const entry = page.getByRole("button", { name: "开启评论选择" });
  await expect(entry).toBeVisible();
  expect(await entry.evaluate((element) => getComputedStyle(element, "::before").animationName)).toBe("none");

  await enterSelection(page);
  const comment = page.getByTestId("comment-item").nth(1);
  await comment.hover();
  const highlight = page.locator("[data-ccg-comment-highlight]");
  await expect(highlight).toBeVisible();
  expect(await highlight.evaluate((element) => getComputedStyle(element, "::before").animationName)).toBe("none");
  await comment.click();
  await expect(page.getByRole("region", { name: "生成评论卡片" })).toBeVisible();
});

test("uses the production visual layer for a nested modern Shadow DOM comment", async ({ extension }) => {
  const { page, url, errors } = extension;
  await page.goto(url);
  await enterSelection(page);
  const comment = page.getByTestId("modern-comment-text");

  await comment.hover();
  await expect(page.locator("[data-ccg-comment-highlight]")).toBeVisible();
  await comment.click();

  const confirm = page.getByRole("region", { name: "生成评论卡片" });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText("嵌套 Shadow DOM 评论。")).toBeVisible();
  expect(errors).toEqual([]);
});
