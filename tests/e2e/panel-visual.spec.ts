import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const stateContract = {
  editing: { required: ["内容设置", "制作卡片"], forbidden: ["制作中"] },
  generating: { required: ["制作中", "取消制作"], forbidden: ["确认保存"] },
  failed: { required: ["制作失败", "重新生成", "返回修改"], forbidden: ["保存成功"] },
  generated: { required: ["确认保存", "返回修改"], forbidden: ["保存成功"] },
  saved: { required: ["保存成功", "再做一张"], forbidden: ["确认保存"] },
} as const;

const states = Object.keys(stateContract) as Array<keyof typeof stateContract>;

test("enforces the five-state release geometry and semantic contract", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 850 });
  for (const state of states) {
    await page.goto(`/panel-preview.html?state=${state}`);
    const panel = page.locator(`.ccg-extension-panel[data-panel-state="${state}"]`);
    await expect(panel).toBeVisible();
    await expect(page.locator(".ccg-extension-panel")).toHaveCount(1);
    await expect(panel.locator(".ccg-panel-header")).toHaveCount(1);
    await expect(panel.locator(".ccg-state-viewport")).toHaveCount(1);
    const bounds = await panel.boundingBox();
    expect(bounds?.width).toBe(336);
    expect(bounds?.height).toBe(570);
    await expect(panel.locator(".ccg-stepper")).toHaveCount(0);
    await expect(panel.locator(".ccg-panel-action-area")).toHaveCount(1);
    await expect(panel.locator(".ccg-bottom-decoration")).toHaveCount(1);
    const ground = panel.locator(".ccg-bottom-decoration__ground");
    const groundBounds = await ground.boundingBox();
    expect(groundBounds?.width).toBe(bounds!.width - 2);
    expect(groundBounds?.height).toBe(18);
    await expect(panel.locator(".ccg-bottom-decoration__scene")).toHaveCSS("object-fit", "contain");
    for (const text of stateContract[state].required) await expect(panel).toContainText(text);
    for (const text of stateContract[state].forbidden) await expect(panel).not.toContainText(text);
    const controls = panel.locator("button, input, textarea");
    for (let index = 0; index < await controls.count(); index += 1) {
      const control = controls.nth(index);
      if (!await control.isVisible()) continue;
      const controlBounds = await control.boundingBox();
      expect(controlBounds, `visible ${state} control ${index} should have bounds`).not.toBeNull();
      expect(controlBounds!.x).toBeGreaterThanOrEqual(bounds!.x);
      expect(controlBounds!.y).toBeGreaterThanOrEqual(bounds!.y);
      expect(controlBounds!.x + controlBounds!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
      expect(controlBounds!.y + controlBounds!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
    }
    if (state === "generated") {
      await expect(panel.locator(".ccg-generated-preview")).not.toHaveCSS("image-rendering", "pixelated");
    }
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

test("keeps pixel as the default skin and applies the classic-dark visual surface", async ({ page }) => {
  await page.goto("/panel-preview.html?state=editing");
  const panel = page.locator(".ccg-extension-panel");

  await expect(panel).toHaveAttribute("data-panel-skin", "pixel");
  await expect(panel).toHaveCSS("background-color", "rgb(250, 250, 250)");
  await page.getByRole("button", { name: "更多选项设置" }).click();
  await page.locator('input[name="ccg-panel-skin"][value="classic-dark"]').check();

  await expect(panel).toHaveAttribute("data-panel-skin", "classic-dark");
  await expect(panel).toHaveClass(/ccg-extension-panel--classic-dark/u);
  await expect(panel).toHaveCSS("background-color", "rgb(18, 20, 27)");
  await expect(panel.locator(".ccg-panel-header")).toHaveCSS("background-color", "rgb(24, 27, 36)");
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
