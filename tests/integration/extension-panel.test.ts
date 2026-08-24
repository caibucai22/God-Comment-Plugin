import { describe, expect, it, vi } from "vitest";
import { createExtensionPanel } from "../../src/ui/extension-panel";
import type { PanelState, PanelViewModel } from "../../src/ui/panel-state";

const states: PanelState[] = ["editing", "generating", "failed", "generated", "saved"];

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
  it.each(states)("renders exactly one shared shell for %s", (state) => {
    const panel = createExtensionPanel(document, model(state), {});

    expect(panel.matches('.ccg-extension-panel[data-panel-state="' + state + '"]')).toBe(true);
    expect(panel.querySelectorAll(".ccg-extension-panel")).toHaveLength(0);
    expect(panel.querySelectorAll(".ccg-panel-header")).toHaveLength(1);
    expect(panel.querySelectorAll(".ccg-stepper")).toHaveLength(1);
    expect(panel.querySelectorAll(".ccg-state-viewport")).toHaveLength(1);
    expect(panel.querySelectorAll(".ccg-bottom-decoration")).toHaveLength(1);
    expect(panel.textContent).not.toContain("BETA");
    expect(panel.querySelector("[data-five-column-layout]")).toBeNull();
  });

  it("maps each state to one active step", () => {
    for (const state of states) {
      const panel = createExtensionPanel(document, model(state), {});
      expect(panel.querySelectorAll('.ccg-stepper [aria-current="step"]')).toHaveLength(1);
    }
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
    }, handlers);
    expect(generated.querySelector('img[alt="生成的评论卡片预览"]')).not.toBeNull();
    (generated.querySelector('[aria-label="确认保存"]') as HTMLButtonElement).click();
    expect(handlers.onConfirmSave).toHaveBeenCalledOnce();

    const failed = createExtensionPanel(document, model("failed"), handlers);
    (failed.querySelector('[aria-label="重新生成"]') as HTMLButtonElement).click();
    (failed.querySelector('[aria-label="返回修改"]') as HTMLButtonElement).click();
    expect(handlers.onRetryGeneration).toHaveBeenCalledOnce();
    expect(handlers.onReturnEditing).toHaveBeenCalledOnce();

    const generating = createExtensionPanel(document, model("generating"), handlers);
    (generating.querySelector('[aria-label="取消制作"]') as HTMLButtonElement).click();
    expect(handlers.onCancelGeneration).toHaveBeenCalledOnce();

    const saved = createExtensionPanel(document, model("saved"), handlers);
    (saved.querySelector('[aria-label="再做一张"]') as HTMLButtonElement).click();
    expect(handlers.onCreateAnother).toHaveBeenCalledOnce();
  });
});
