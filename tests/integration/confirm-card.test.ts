import { afterEach, describe, expect, it } from "vitest";
import type { CardPreferences, CommentCardSource, GenerateOptions } from "../../src/domain/types";
import { OverlayRoot } from "../../src/ui/overlay-root";

const source: CommentCardSource = {
  platform: "bilibili",
  content: "这是一条很有力量的评论。",
  authorName: "卡片用户",
  publishedAt: "2026-08-12",
  videoCoverUrl: "https://example.test/cover.jpg",
};

const preferences: CardPreferences = {
  style: "history",
  ratio: "16:9",
  includeCover: true,
  gameDecoration: false,
};

describe("OverlayRoot confirmation card", () => {
  const overlays: OverlayRoot[] = [];

  afterEach(() => {
    overlays.splice(0).forEach((overlay) => overlay.destroy());
    document.body.innerHTML = "";
  });

  function openConfirm(inputSource = source, inputPreferences = preferences): OverlayRoot {
    const overlay = new OverlayRoot(document);
    overlays.push(overlay);
    overlay.mount();
    overlay.showConfirm(inputSource, inputPreferences);
    return overlay;
  }

  it("renders an editable comment with every approved style and ratio in the shared panel", () => {
    const overlay = openConfirm();
    const root = overlay.shadowRoot!;

    expect((root.querySelector('[aria-label="评论文字"]') as HTMLTextAreaElement).value).toBe(source.content);
    expect(root.querySelectorAll('input[name="ccg-style"]')).toHaveLength(5);
    expect(Array.from(root.querySelectorAll<HTMLInputElement>('input[name="ccg-ratio"]')).map((input) => input.value)).toEqual([
      "3:4",
      "9:16",
      "16:9",
    ]);
    expect(root.querySelector('[aria-label="关闭制作面板"]')).not.toBeNull();
    expect(root.querySelector('[aria-label="制作卡片"]')).not.toBeNull();
    expect(root.querySelector('[aria-label="包含视频封面"]')).not.toBeNull();
    expect(root.querySelector('[aria-label="添加游戏化装饰"]')).not.toBeNull();
  });

  it("emits selected typed options on generate", () => {
    const overlay = openConfirm();
    let detail: { source: CommentCardSource; options: GenerateOptions } | undefined;
    overlay.addEventListener("confirm-generate", (event) => {
      detail = (event as CustomEvent<{ source: CommentCardSource; options: GenerateOptions }>).detail;
    });
    const root = overlay.shadowRoot!;

    (root.querySelector('input[value="sss"]') as HTMLInputElement).click();
    (root.querySelector('input[value="3:4"]') as HTMLInputElement).click();
    (root.querySelector('[aria-label="包含视频封面"]') as HTMLInputElement).click();
    (root.querySelector('[aria-label="添加游戏化装饰"]') as HTMLInputElement).click();
    (root.querySelector('[aria-label="制作卡片"]') as HTMLButtonElement).click();

    expect(detail).toEqual({
      source,
      options: {
        style: "sss",
        ratio: "3:4",
        includeCover: false,
        includeAttributes: false,
        gameDecoration: true,
        soundEnabled: false,
      },
    });
  });

  it("keeps a retained generate button inert after destroy", () => {
    const overlay = openConfirm();
    const generated: GenerateOptions[] = [];
    overlay.addEventListener("confirm-generate", (event) => {
      generated.push(
        (event as CustomEvent<{ source: CommentCardSource; options: GenerateOptions }>).detail.options,
      );
    });
    const generate = overlay.shadowRoot!.querySelector('[aria-label="制作卡片"]') as HTMLButtonElement;

    overlay.destroy();

    expect(() => generate.click()).not.toThrow();
    expect(generated).toEqual([]);
  });

  it("keeps retained cancel controls inert after destroy", () => {
    const overlay = openConfirm();
    let cancelled = false;
    overlay.addEventListener("cancel-generate", () => (cancelled = true));
    const cancel = overlay.shadowRoot!.querySelector('[aria-label="关闭制作面板"]') as HTMLButtonElement;

    overlay.destroy();

    expect(() => cancel.click()).not.toThrow();
    expect(cancelled).toBe(false);
  });

  it("disables and clears cover when the source has no cover URL", () => {
    const overlay = openConfirm({ ...source, videoCoverUrl: undefined });
    const cover = overlay.shadowRoot!.querySelector('[aria-label="包含视频封面"]') as HTMLInputElement;

    expect(cover.disabled).toBe(true);
    expect(cover.checked).toBe(false);
  });

  it("hides confirmation and emits cancel", () => {
    const overlay = openConfirm();
    let cancelled = false;
    overlay.addEventListener("cancel-generate", () => (cancelled = true));

    (overlay.shadowRoot!.querySelector('[aria-label="关闭制作面板"]') as HTMLButtonElement).click();

    expect(cancelled).toBe(true);
    expect(overlay.shadowRoot!.querySelector(".ccg-extension-panel")).toBeNull();
  });

  it("replaces and dismisses transient-ready status cards without timers", () => {
    const overlay = openConfirm();

    overlay.showStatus("info", "正在准备");
    overlay.showStatus("success", "已完成");
    expect(overlay.shadowRoot!.textContent).toContain("已完成");
    expect(overlay.shadowRoot!.textContent).not.toContain("正在准备");

    (overlay.shadowRoot!.querySelector('[aria-label="关闭提示"]') as HTMLButtonElement).click();
    expect(overlay.shadowRoot!.querySelector(".ccg-status")).toBeNull();
  });

  it("keeps motion safe for users who prefer reduced motion", () => {
    const overlay = openConfirm();
    const css = overlay.shadowRoot!.querySelector("style")!.textContent!;

    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("animation: none");
    expect(css).toContain("transition: none");
  });
});
