import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const states = ["editing", "generating", "failed", "generated", "saved"] as const;

test("renders one fixed-size extension panel for every state", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 850 });
  for (const state of states) {
    await page.goto(`/panel-preview.html?state=${state}`);
    const panel = page.locator(`.ccg-extension-panel[data-panel-state="${state}"]`);
    await expect(panel).toBeVisible();
    await expect(page.locator(".ccg-extension-panel")).toHaveCount(1);
    const bounds = await panel.boundingBox();
    expect(bounds?.width).toBe(336);
    expect(bounds?.height).toBe(570);
    await expect(panel.locator(".ccg-stepper")).toHaveCount(0);
    await expect(panel.locator(".ccg-panel-action-area")).toHaveCount(1);
    await expect(panel).not.toContainText("BETA");
    await expect(page.locator("[data-five-column-layout]")).toHaveCount(0);
  }
});

test("follows the primary state transition path in one panel", async ({ page }) => {
  await page.goto("/panel-preview.html?state=editing");
  await page.getByRole("button", { name: "制作卡片" }).click();
  await expect(page.locator('[data-panel-state="generating"]')).toBeVisible();
  await page.goto("/panel-preview.html?state=generated");
  await page.getByRole("button", { name: "确认保存" }).click();
  await expect(page.locator('[data-panel-state="saved"]')).toBeVisible();
  await page.getByRole("button", { name: "再做一张" }).click();
  await expect(page.locator('[data-panel-state="editing"]')).toBeVisible();
});

test("keeps generated preview actions fully inside the fixed state viewport", async ({ page }) => {
  await page.goto("/panel-preview.html?state=generated");
  const viewport = page.locator(".ccg-state-viewport");
  const actions = page.locator(".ccg-panel-action-area");
  const viewportBounds = await viewport.boundingBox();
  const actionBounds = await actions.boundingBox();

  expect(actionBounds).not.toBeNull();
  expect(viewportBounds).not.toBeNull();
  expect(actionBounds!.y).toBeGreaterThanOrEqual(viewportBounds!.y + viewportBounds!.height);
  expect(actionBounds!.y + actionBounds!.height).toBeLessThanOrEqual(
    (await page.locator(".ccg-extension-panel").boundingBox())!.y + 570,
  );
});

test("captures explicitly requested visual QA artifacts", async ({ page }) => {
  const round = process.env.CCG_VISUAL_QA_ROUND;
  test.skip(!round, "Set CCG_VISUAL_QA_ROUND to capture visual QA screenshots");
  const output = resolve(process.cwd(), ".superpowers", "visual-qa", `round-${round}`);
  mkdirSync(output, { recursive: true });
  await page.setViewportSize({ width: 900, height: 850 });
  for (const state of states) {
    await page.goto(`/panel-preview.html?state=${state}`);
    await page.locator(".ccg-extension-panel").screenshot({
      path: resolve(output, `${state}.png`),
      animations: "disabled",
    });
  }
});
