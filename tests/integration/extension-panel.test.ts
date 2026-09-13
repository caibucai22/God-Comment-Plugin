import { describe, expect, it, vi } from "vitest";
import { createExtensionPanel } from "../../src/ui/extension-panel";
import type { PanelState, PanelViewModel } from "../../src/ui/panel-state";

const stateContract = {
  editing: { required: ["内容设置", "制作卡片"], forbidden: ["制作中"] },
  generating: { required: ["制作中", "取消制作"], forbidden: ["确认保存"] },
  failed: { required: ["制作失败", "重新生成", "返回修改"], forbidden: ["保存成功"] },
  generated: { required: ["确认保存", "返回修改"], forbidden: ["保存成功"] },
  saved: { required: ["保存成功", "再做一张"], forbidden: ["确认保存"] },
} as const satisfies Record<PanelState, {
  readonly required: readonly string[];
  readonly forbidden: readonly string[];
}>;

const states = Object.keys(stateContract) as PanelState[];

function model(state: PanelState): PanelViewModel {
  return {
    state,
    source: {
      platform: "bilibili",
      content: "有时候一句来自陌生人的话，也能让普通的一天突然变得明亮。",
      authorName: "山风经过",
      publishedAt: "2026-08-16",
    },
    preferences: { style: "warm", ratio: "3:4", includeCover: false, gameDecoration: false },
  };
}

describe("ExtensionPanel shared shell", () => {
  it.each(Object.entries(stateContract) as Array<[PanelState, (typeof stateContract)[PanelState]]>)(
    "keeps the release semantic contract for %s",
    (state, contract) => {
      const panel = createExtensionPanel(document, model(state), {});

      expect(panel.querySelectorAll(".ccg-panel-header")).toHaveLength(1);
      expect(panel.querySelectorAll(".ccg-state-viewport")).toHaveLength(1);
      expect(panel.querySelectorAll(".ccg-panel-action-area")).toHaveLength(1);
      expect(panel.querySelectorAll(".ccg-bottom-decoration")).toHaveLength(1);
      for (const text of contract.required) expect(panel.textContent).toContain(text);
      for (const text of contract.forbidden) expect(panel.textContent).not.toContain(text);
    },
  );

  it.each(states)("renders exactly one shared shell for %s", (state) => {
    const panel = createExtensionPanel(document, model(state), {});

    expect(panel.matches('.ccg-extension-panel[data-panel-state="' + state + '"]')).toBe(true);
    expect(panel.querySelectorAll(".ccg-extension-panel")).toHaveLength(0);
    expect(panel.querySelectorAll(".ccg-panel-header")).toHaveLength(1);
    expect(panel.querySelectorAll(".ccg-stepper")).toHaveLength(0);
    expect(panel.querySelectorAll(".ccg-state-viewport")).toHaveLength(1);
    expect(panel.querySelectorAll(".ccg-panel-action-area")).toHaveLength(1);
    expect(panel.querySelectorAll(".ccg-bottom-decoration")).toHaveLength(1);
    expect(panel.textContent).not.toContain("BETA");
    expect(panel.querySelector("[data-five-column-layout]")).toBeNull();
  });

  it.each(states)("renders real pixel assets without missing placeholders for %s", (state) => {
    const panel = createExtensionPanel(document, model(state), {});
    const logo = panel.querySelector<HTMLImageElement>('[data-pixel-asset="panel-logo"]');
    const decoration = panel.querySelector<HTMLImageElement>(`[data-pixel-asset="bottom-${state}"]`);

    expect(logo?.getAttribute("src")).toContain("mascot-master.png");
    expect(decoration?.getAttribute("src")).toContain(`bottom-${state}.png`);
    expect(decoration?.closest(".ccg-bottom-decoration")).not.toBeNull();
    expect(panel.querySelector('[data-pixel-asset="bottom-ground"]')).not.toBeNull();
    expect(panel.querySelector("[data-missing-asset]")).toBeNull();
  });

  it.each(["generating", "failed", "saved"] as const)("uses the matching state illustration for %s", (state) => {
    const panel = createExtensionPanel(document, model(state), {});
    const illustration = panel.querySelector<HTMLImageElement>(`[data-pixel-asset="state-${state}"]`);

    expect(illustration?.getAttribute("src")).toContain(`state-${state}.png`);
    expect(illustration?.alt).toBe("");
  });

  it("reuses one ground asset across all panel states", () => {
    const sources = states.map((state) =>
      createExtensionPanel(document, model(state), {})
        .querySelector<HTMLImageElement>('[data-pixel-asset="bottom-ground"]')?.src,
    );

    expect(new Set(sources).size).toBe(1);
  });

  it("renders the reference editing controls in three accordion sections", () => {
    const panel = createExtensionPanel(document, model("editing"), {});

    expect(panel.querySelectorAll("[data-accordion-trigger]")).toHaveLength(3);
    expect(panel.querySelector('[data-accordion-trigger="content"]')?.getAttribute("aria-expanded")).toBe("true");
    expect(panel.querySelectorAll('input[name="ccg-style"]')).toHaveLength(5);
    expect(panel.querySelector('input[name="ccg-style"][value="bilibili"]')).not.toBeNull();
    expect(panel.querySelector('input[name="ccg-ratio"][value="16:9"]')).not.toBeNull();
    expect((panel.querySelector('[aria-label="显示趣味属性"]') as HTMLInputElement).checked).toBe(false);
    expect(panel.querySelector('input[name="ccg-panel-skin"][value="pixel"]')).not.toBeNull();
    expect(panel.querySelector('[data-accordion-summary="style"]')?.textContent).toBe("温暖 · 3:4");
    expect(panel.querySelector('[data-accordion-summary="more"]')?.textContent).toBe("默认设置");
    expect(panel.querySelector('[aria-label="恢复原文"]')?.textContent).toBe("恢复原文");
    expect(panel.querySelector(".ccg-character-count")?.textContent).toBe(`${model("editing").source.content.length} / 500`);
  });

  it("marks the default pixel skin and applies an explicit classic-dark data/class contract", () => {
    const pixel = createExtensionPanel(document, model("editing"), {});
    const classic = createExtensionPanel(document, {
      ...model("editing"),
      preferences: { ...model("editing").preferences, panelSkin: "classic-dark" },
    }, {});

    expect(pixel.dataset.panelSkin).toBe("pixel");
    expect(pixel.classList.contains("ccg-extension-panel--classic-dark")).toBe(false);
    expect(classic.dataset.panelSkin).toBe("classic-dark");
    expect(classic.classList.contains("ccg-extension-panel--classic-dark")).toBe(true);
  });

  it("edits, restores, validates, and emits a trimmed comment", () => {
    const onGenerate = vi.fn();
    const onDraftChange = vi.fn();
    const onRestoreOriginal = vi.fn();
    const panel = createExtensionPanel(document, model("editing"), {
      onGenerate,
      onDraftChange,
      onRestoreOriginal,
    });
    document.body.append(panel);
    const textarea = panel.querySelector('[aria-label="评论文字"]') as HTMLTextAreaElement;

    textarea.value = " 修改后的评论 ";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onDraftChange).toHaveBeenCalledWith(" 修改后的评论 ");
    expect(panel.querySelector(".ccg-character-count")?.textContent).toBe("8 / 500");
    (panel.querySelector('[aria-label="恢复原文"]') as HTMLButtonElement).click();
    expect(onRestoreOriginal).toHaveBeenCalledOnce();

    textarea.value = "   ";
    (panel.querySelector('[aria-label="制作卡片"]') as HTMLButtonElement).click();
    expect(onGenerate).not.toHaveBeenCalled();
    expect(panel.textContent).toContain("评论文字不能为空");

    textarea.value = "  可生成正文  ";
    (panel.querySelector('[aria-label="制作卡片"]') as HTMLButtonElement).click();
    expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({ content: "可生成正文" }), expect.any(Object));
  });

  it("updates accordion summaries and restores initial controls when reset", () => {
    const onPanelSkinChange = vi.fn();
    const panel = createExtensionPanel(document, model("editing"), { onPanelSkinChange });
    document.body.append(panel);

    const style = panel.querySelector('input[name="ccg-style"][value="history"]') as HTMLInputElement;
    style.click();
    expect(panel.querySelector('[data-accordion-summary="style"]')?.textContent).toBe("历史 · 3:4");

    const attributes = panel.querySelector('[aria-label="显示趣味属性"]') as HTMLInputElement;
    attributes.click();
    expect(panel.querySelector('[data-accordion-summary="more"]')?.textContent).toBe("已选 1 项");

    const textarea = panel.querySelector('[aria-label="评论文字"]') as HTMLTextAreaElement;
    textarea.value = "已修改";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    (panel.querySelector('[aria-label="重置卡片设置"]') as HTMLButtonElement).click();

    expect(textarea.value).toBe(model("editing").source.content);
    expect((panel.querySelector('input[name="ccg-style"][value="warm"]') as HTMLInputElement).checked).toBe(true);
    expect(attributes.checked).toBe(false);
    expect(panel.querySelector('[data-accordion-summary="style"]')?.textContent).toBe("温暖 · 3:4");
    expect(panel.querySelector('[data-accordion-summary="more"]')?.textContent).toBe("默认设置");
  });

  it("allows the open accordion to collapse", () => {
    const panel = createExtensionPanel(document, model("editing"), {});
    const trigger = panel.querySelector('[data-accordion-trigger="content"]') as HTMLButtonElement;
    const content = panel.querySelector('[data-accordion-panel="content"]') as HTMLElement;

    trigger.click();

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(content.hidden).toBe(true);
  });

  it("renders state-specific actions without changing the shared shell", () => {
    const handlers = {
      onCancelGeneration: vi.fn(),
      onRetryGeneration: vi.fn(),
      onReturnEditing: vi.fn(),
      onConfirmSave: vi.fn(),
      onCreateAnother: vi.fn(),
    };
    const generated = createExtensionPanel(document, {
      ...model("generated"),
      previewUrl: "data:image/png;base64,cHJldmlldw==",
      previewInfo: { ratio: "16:9", dimensions: "1920 × 1080" },
    }, handlers);
    expect(generated.querySelector('img[alt="生成的评论卡片预览"]')).not.toBeNull();
    expect(generated.textContent).toContain("预览比例：16:9");
    expect(generated.textContent).toContain("1920 × 1080");
    expect(generated.querySelector(".ccg-state-content .ccg-panel-actions")).toBeNull();
    expect(generated.querySelector(".ccg-panel-action-area .ccg-panel-actions")).not.toBeNull();
    (generated.querySelector('[aria-label="确认保存"]') as HTMLButtonElement).click();
    expect(handlers.onConfirmSave).toHaveBeenCalledOnce();

    const failed = createExtensionPanel(document, model("failed"), handlers);
    (failed.querySelector('[aria-label="重新生成"]') as HTMLButtonElement).click();
    (failed.querySelector('[aria-label="返回修改"]') as HTMLButtonElement).click();
    expect(handlers.onRetryGeneration).toHaveBeenCalledOnce();
    expect(handlers.onReturnEditing).toHaveBeenCalledOnce();

    const generating = createExtensionPanel(document, model("generating"), handlers);
    expect(generating.querySelector('[role="progressbar"]')?.hasAttribute("aria-valuenow")).toBe(false);
    expect(generating.textContent).toContain("制作中");
    (generating.querySelector('[aria-label="取消制作"]') as HTMLButtonElement).click();
    expect(handlers.onCancelGeneration).toHaveBeenCalledOnce();

    const saved = createExtensionPanel(document, model("saved"), handlers);
    expect((saved.querySelector('[aria-label="打开文件夹"]') as HTMLButtonElement).disabled).toBe(true);
    (saved.querySelector('[aria-label="再做一张"]') as HTMLButtonElement).click();
    expect(handlers.onCreateAnother).toHaveBeenCalledOnce();
  });
});
