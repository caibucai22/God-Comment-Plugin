import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardPreferences, CommentCardSource } from "../../src/domain/types";
import { OverlayRoot } from "../../src/ui/overlay-root";

const editableSource: CommentCardSource = {
  platform: "bilibili",
  content: "原始评论正文",
  authorName: "测试用户",
  videoCoverUrl: "https://i0.hdslb.com/cover.jpg",
};

const initialPreferences: CardPreferences = {
  style: "bilibili",
  ratio: "3:4",
  includeCover: true,
  includeAttributes: false,
  gameDecoration: false,
  soundEnabled: false,
  panelSkin: "pixel",
};

const expectedDraftPreferences: CardPreferences = {
  style: "sss",
  ratio: "16:9",
  includeCover: false,
  includeAttributes: true,
  gameDecoration: true,
  soundEnabled: true,
  panelSkin: "classic-dark",
};

describe("OverlayRoot", () => {
  const overlays: OverlayRoot[] = [];

  afterEach(() => {
    overlays.splice(0).forEach((overlay) => overlay.destroy());
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  function createOverlay(): OverlayRoot {
    const overlay = new OverlayRoot(document);
    overlays.push(overlay);
    return overlay;
  }

  function beginEditedDraft(overlay: OverlayRoot): void {
    overlay.mount();
    overlay.showConfirm(editableSource, initialPreferences);
    const root = overlay.shadowRoot!;
    const textarea = root.querySelector('[aria-label="评论文字"]') as HTMLTextAreaElement;
    textarea.value = "用户编辑后的正文草稿";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    (root.querySelector('input[name="ccg-style"][value="sss"]') as HTMLInputElement).click();
    (root.querySelector('input[name="ccg-ratio"][value="16:9"]') as HTMLInputElement).click();
    (root.querySelector('[aria-label="包含视频封面"]') as HTMLInputElement).click();
    (root.querySelector('[aria-label="显示趣味属性"]') as HTMLInputElement).click();
    (root.querySelector('[aria-label="添加游戏化装饰"]') as HTMLInputElement).click();
    (root.querySelector('[aria-label="播放制作声效"]') as HTMLInputElement).click();
    (root.querySelector('input[name="ccg-panel-skin"][value="classic-dark"]') as HTMLInputElement).click();
  }

  function expectEditedDraft(overlay: OverlayRoot): void {
    const root = overlay.shadowRoot!;
    expect(root.querySelector('[aria-label="评论文字"]')).toHaveProperty("value", "用户编辑后的正文草稿");
    expect(root.querySelector('input[name="ccg-style"][value="sss"]')).toHaveProperty("checked", true);
    expect(root.querySelector('input[name="ccg-ratio"][value="16:9"]')).toHaveProperty("checked", true);
    expect(root.querySelector('[aria-label="包含视频封面"]')).toHaveProperty("checked", false);
    expect(root.querySelector('[aria-label="显示趣味属性"]')).toHaveProperty("checked", true);
    expect(root.querySelector('[aria-label="添加游戏化装饰"]')).toHaveProperty("checked", true);
    expect(root.querySelector('[aria-label="播放制作声效"]')).toHaveProperty("checked", true);
    expect(root.querySelector('input[name="ccg-panel-skin"][value="classic-dark"]')).toHaveProperty("checked", true);
  }

  it("mounts one isolated shadow-DOM entry and is idempotent", () => {
    const overlay = createOverlay();

    overlay.mount();
    overlay.mount();

    expect(document.querySelectorAll("[data-ccg-overlay-root]")).toHaveLength(1);
    expect(document.head.querySelector("style[data-ccg-overlay]")).toBeNull();
    expect(overlay.shadowRoot?.querySelector(".ccg-entry")).not.toBeNull();
    expect(overlay.shadowRoot?.querySelector(".ccg-entry-cluster")?.textContent).toContain("有神评");
  });

  it("emits selection commands from the entry and active prompt", () => {
    const overlay = createOverlay();
    const events: string[] = [];
    overlay.addEventListener("toggle-selection", () => events.push("toggle"));
    overlay.addEventListener("exit-selection", () => events.push("exit"));
    overlay.mount();

    (overlay.shadowRoot!.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement).click();
    overlay.setSelectionActive(true);
    (overlay.shadowRoot!.querySelector('[aria-label="退出评论选择"]') as HTMLButtonElement).click();

    expect(overlay.shadowRoot!.textContent).toContain("请选择一条评论");
    expect(events).toEqual(["toggle", "exit"]);
  });

  it("renders the idle mascot with four restrained spray cards in one floating cluster", () => {
    const overlay = createOverlay();
    overlay.mount();
    const entry = overlay.shadowRoot!.querySelector('[aria-label="开启评论选择"]')!;
    const cluster = overlay.shadowRoot!.querySelector(".ccg-entry-cluster");

    expect(entry.querySelector('[data-pixel-asset="floating-mascot"]')).not.toBeNull();
    expect(cluster?.contains(entry)).toBe(true);
    expect(cluster?.querySelectorAll(".ccg-entry-spray__card")).toHaveLength(4);
    expect(cluster?.querySelector(".ccg-selection-prompt")).toBeNull();
    expect(overlay.shadowRoot?.querySelector("style")?.textContent).toContain("ccg-card-spray 5s");
  });

  it("anchors a quieter single-card selection prompt below the same mascot cluster", () => {
    const overlay = createOverlay();
    overlay.mount();

    overlay.setSelectionActive(true);

    const cluster = overlay.shadowRoot!.querySelector(".ccg-entry-cluster");
    const prompt = cluster?.querySelector(".ccg-selection-prompt");
    expect(cluster?.getAttribute("data-selection-active")).toBe("true");
    expect(cluster?.querySelectorAll(".ccg-entry-spray__card")).toHaveLength(1);
    expect(cluster?.querySelector(".ccg-entry-spray__card")?.textContent).toBe("有神评");
    expect(prompt?.textContent).toContain("请选择一条评论");
    expect(prompt?.querySelector('[aria-label="退出评论选择"]')).not.toBeNull();
  });

  it("prevents native image dragging from cancelling the pointer drag gesture", () => {
    const overlay = createOverlay();
    overlay.mount();
    const entry = overlay.shadowRoot!.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement;
    const mascot = entry.querySelector('[data-pixel-asset="floating-mascot"]') as HTMLImageElement;
    const dragStart = new Event("dragstart", { bubbles: true, cancelable: true });

    mascot.dispatchEvent(dragStart);

    expect(mascot.draggable).toBe(false);
    expect(dragStart.defaultPrevented).toBe(true);
  });

  it("clicks below 6px movement but drags and persists at 6px without toggling", async () => {
    const set = vi.fn(async () => undefined);
    vi.stubGlobal("chrome", { storage: { local: { get: vi.fn(async () => ({})), set } } });
    const overlay = createOverlay();
    const toggles: string[] = [];
    overlay.addEventListener("toggle-selection", () => toggles.push("toggle"));
    overlay.mount();
    const entry = overlay.shadowRoot!.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement;
    Object.defineProperty(entry, "offsetHeight", { value: 64 });
    const dispatchPointer = (type: string, clientX: number, clientY: number, pointerId = 1) => {
      const event = new Event(type, { bubbles: true });
      Object.assign(event, { clientX, clientY, pointerId });
      entry.dispatchEvent(event);
    };

    dispatchPointer("pointerdown", 900, 400);
    dispatchPointer("pointermove", 904, 403);
    dispatchPointer("pointerup", 904, 403);
    entry.click();
    expect(toggles).toEqual(["toggle"]);

    dispatchPointer("pointerdown", 900, 400);
    dispatchPointer("pointermove", 906, 400);
    dispatchPointer("pointerup", 906, 400);
    entry.click();
    await Promise.resolve();

    expect(toggles).toEqual(["toggle"]);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it("removes its host and keeps retained entry, drag, and exit controls inert after destroy", async () => {
    const set = vi.fn(async () => undefined);
    vi.stubGlobal("chrome", { storage: { local: { get: vi.fn(async () => ({})), set } } });
    const overlay = createOverlay();
    const toggles: string[] = [];
    const exits: string[] = [];
    overlay.addEventListener("toggle-selection", () => toggles.push("toggle"));
    overlay.addEventListener("exit-selection", () => exits.push("exit"));
    overlay.mount();
    const entry = overlay.shadowRoot!.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement;
    overlay.setSelectionActive(true);
    const exit = overlay.shadowRoot!.querySelector('[aria-label="退出评论选择"]') as HTMLButtonElement;

    overlay.destroy();
    expect(() => entry.click()).not.toThrow();
    const pointerDown = new Event("pointerdown", { bubbles: true });
    Object.assign(pointerDown, { clientX: 100, clientY: 100, pointerId: 1 });
    const pointerMove = new Event("pointermove", { bubbles: true });
    Object.assign(pointerMove, { clientX: 200, clientY: 200, pointerId: 1 });
    const pointerUp = new Event("pointerup", { bubbles: true });
    Object.assign(pointerUp, { clientX: 200, clientY: 200, pointerId: 1 });
    expect(() => entry.dispatchEvent(pointerDown)).not.toThrow();
    expect(() => entry.dispatchEvent(pointerMove)).not.toThrow();
    expect(() => entry.dispatchEvent(pointerUp)).not.toThrow();
    expect(() => exit.click()).not.toThrow();
    await Promise.resolve();
    overlay.mount();

    expect(document.querySelector("[data-ccg-overlay-root]")).toBeNull();
    expect(overlay.shadowRoot).toBeNull();
    expect(toggles).toEqual([]);
    expect(exits).toEqual([]);
    expect(set).not.toHaveBeenCalled();
  });

  it("replaces editing with the generating state while busy", () => {
    const overlay = createOverlay();
    overlay.mount();
    overlay.showConfirm(
      { platform: "bilibili", content: "忙碌状态测试" },
      { style: "warm", ratio: "3:4", includeCover: false, gameDecoration: false },
    );

    overlay.setGenerationBusy(true);
    expect(overlay.shadowRoot!.querySelector('.ccg-extension-panel[data-panel-state="generating"]')).not.toBeNull();
    expect(overlay.shadowRoot!.querySelector('[aria-label="制作卡片"]')).toBeNull();
    expect(overlay.shadowRoot!.querySelector('[aria-label="取消制作"]')).not.toBeNull();

    overlay.setGenerationBusy(false);
    expect(overlay.shadowRoot!.querySelector('.ccg-extension-panel[data-panel-state="editing"]')).not.toBeNull();
  });

  it("mounts confirmation inside the single shared extension panel shell", () => {
    const overlay = createOverlay();
    overlay.mount();

    overlay.showConfirm(
      { platform: "bilibili", content: "共享外壳测试" },
      { style: "warm", ratio: "3:4", includeCover: false, gameDecoration: false },
    );

    expect(overlay.shadowRoot!.querySelectorAll(".ccg-extension-panel")).toHaveLength(1);
    expect(overlay.shadowRoot!.querySelector('.ccg-extension-panel[data-panel-state="editing"]')).not.toBeNull();
    expect(overlay.shadowRoot!.querySelector(".ccg-extension-panel .ccg-state-content--editing")).not.toBeNull();
    expect(overlay.shadowRoot!.querySelector(".ccg-entry")).toBeNull();
    expect(overlay.shadowRoot!.querySelector(".ccg-selection-prompt")).toBeNull();
    expect(overlay.shadowRoot!.textContent).not.toContain("BETA");
  });

  it("hides active selection controls while editing a selected comment", () => {
    const overlay = createOverlay();
    overlay.mount();
    overlay.setSelectionActive(true);
    expect(overlay.shadowRoot!.querySelector(".ccg-selection-prompt")).not.toBeNull();

    overlay.showConfirm(
      { platform: "bilibili", content: "进入编辑态" },
      { style: "warm", ratio: "3:4", includeCover: false, gameDecoration: false },
    );

    expect(overlay.shadowRoot!.querySelector(".ccg-entry")).toBeNull();
    expect(overlay.shadowRoot!.querySelector(".ccg-selection-prompt")).toBeNull();
  });

  it("emits the complete current editing draft instead of stale confirmation preferences", () => {
    const overlay = createOverlay();
    const onGenerate = vi.fn();
    overlay.addEventListener("confirm-generate", onGenerate);
    beginEditedDraft(overlay);

    (overlay.shadowRoot!.querySelector('[aria-label="制作卡片"]') as HTMLButtonElement).click();

    expect(onGenerate).toHaveBeenCalledOnce();
    expect((onGenerate.mock.calls[0][0] as CustomEvent).detail).toEqual({
      source: { ...editableSource, content: "用户编辑后的正文草稿" },
      options: expectedDraftPreferences,
    });
  });

  it("applies a newly selected classic-dark skin to the current panel immediately", () => {
    const overlay = createOverlay();
    overlay.mount();
    overlay.showConfirm(editableSource, initialPreferences);

    (overlay.shadowRoot!.querySelector('[aria-label="更多选项设置"]') as HTMLButtonElement).click();
    (overlay.shadowRoot!.querySelector('input[name="ccg-panel-skin"][value="classic-dark"]') as HTMLInputElement).click();

    const panel = overlay.shadowRoot!.querySelector(".ccg-extension-panel") as HTMLElement;
    expect(panel.dataset.panelSkin).toBe("classic-dark");
    expect(panel.classList.contains("ccg-extension-panel--classic-dark")).toBe(true);
  });

  it.each([
    ["generating cancellation", (overlay: OverlayRoot) => {
      overlay.addEventListener("cancel-generation", () => overlay.setGenerationBusy(false), { once: true });
      overlay.setGenerationBusy(true);
      (overlay.shadowRoot!.querySelector('[aria-label="取消制作"]') as HTMLButtonElement).click();
    }],
    ["failed return", (overlay: OverlayRoot) => {
      overlay.setGenerationBusy(true);
      overlay.showFailed("fixture failure");
      overlay.setGenerationBusy(false);
      (overlay.shadowRoot!.querySelector('[aria-label="返回修改"]') as HTMLButtonElement).click();
    }],
    ["generated return", (overlay: OverlayRoot) => {
      overlay.setGenerationBusy(true);
      overlay.showGenerated("blob:fixture-preview", "1920 × 1080", "16:9");
      overlay.setGenerationBusy(false);
      (overlay.shadowRoot!.querySelector('[aria-label="返回修改"]') as HTMLButtonElement).click();
    }],
  ] as const)("retains the complete current editing draft after %s", (_name, transition) => {
    const overlay = createOverlay();
    beginEditedDraft(overlay);
    (overlay.shadowRoot!.querySelector('[aria-label="制作卡片"]') as HTMLButtonElement).click();

    transition(overlay);

    expect(overlay.shadowRoot!.querySelector('.ccg-extension-panel[data-panel-state="editing"]')).not.toBeNull();
    expectEditedDraft(overlay);
  });

  it("shows the actual exported dimensions in the saved state", () => {
    const overlay = createOverlay();
    overlay.mount();
    overlay.showConfirm(
      { platform: "bilibili", content: "横版尺寸测试" },
      { style: "bilibili", ratio: "16:9", includeCover: false, gameDecoration: false },
    );

    overlay.showSaved("1920 × 1080");

    const panel = overlay.shadowRoot!.querySelector('.ccg-extension-panel[data-panel-state="saved"]');
    expect(panel?.textContent).toContain("1920 × 1080");
  });

  it("keeps generation failure inside the fixed panel without an external status", () => {
    const overlay = createOverlay();
    overlay.mount();
    overlay.showConfirm(
      { platform: "bilibili", content: "失败态测试" },
      { style: "warm", ratio: "3:4", includeCover: false, gameDecoration: false },
    );

    overlay.showFailed("渲染失败，请重试");

    expect(overlay.shadowRoot!.querySelector('.ccg-extension-panel[data-panel-state="failed"]')?.textContent).toContain("渲染失败，请重试");
    expect(overlay.shadowRoot!.querySelector(".ccg-status")).toBeNull();
  });

  it("renders a retry action and distinguishes retry from dismissing the retained download", () => {
    const overlay = createOverlay();
    const events: string[] = [];
    overlay.addEventListener("retry-download", () => events.push("retry"));
    overlay.addEventListener("cancel-download", () => events.push("cancel"));
    overlay.mount();

    overlay.showDownloadRetry("下载失败，请再次下载");
    (overlay.shadowRoot!.querySelector('[aria-label="再次下载"]') as HTMLButtonElement).click();
    expect(events).toEqual(["retry"]);

    overlay.showDownloadRetry("下载失败，请再次下载");
    (overlay.shadowRoot!.querySelector('[aria-label="关闭提示"]') as HTMLButtonElement).click();
    expect(events).toEqual(["retry", "cancel"]);
  });
});
