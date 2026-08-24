import { afterEach, describe, expect, it } from "vitest";
import { OverlayRoot } from "../../src/ui/overlay-root";

describe("OverlayRoot", () => {
  const overlays: OverlayRoot[] = [];

  afterEach(() => {
    overlays.splice(0).forEach((overlay) => overlay.destroy());
    document.body.innerHTML = "";
  });

  function createOverlay(): OverlayRoot {
    const overlay = new OverlayRoot(document);
    overlays.push(overlay);
    return overlay;
  }

  it("mounts one isolated shadow-DOM entry and is idempotent", () => {
    const overlay = createOverlay();

    overlay.mount();
    overlay.mount();

    expect(document.querySelectorAll("[data-ccg-overlay-root]")).toHaveLength(1);
    expect(document.head.querySelector("style[data-ccg-overlay]")).toBeNull();
    expect(overlay.shadowRoot?.querySelector(".ccg-entry")).not.toBeNull();
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

  it("removes its host and keeps retained entry and exit controls inert after destroy", () => {
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
    expect(() => exit.click()).not.toThrow();
    overlay.mount();

    expect(document.querySelector("[data-ccg-overlay-root]")).toBeNull();
    expect(overlay.shadowRoot).toBeNull();
    expect(toggles).toEqual([]);
    expect(exits).toEqual([]);
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
    expect(overlay.shadowRoot!.querySelector('.ccg-extension-panel[data-panel-state="generating"]')).not.toBeNull();
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
    expect(overlay.shadowRoot!.textContent).not.toContain("BETA");
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
