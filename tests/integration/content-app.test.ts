/** @vitest-environment-options { "url": "https://www.bilibili.com/video/BV1supported" } */
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CardAttributes,
  CardPreferences,
  CommentCardSource,
  GenerateOptions,
} from "../../src/domain/types";
import type { PlatformAdapter } from "../../src/platform/platform-adapter";
import {
  SelectionController,
  type SelectionControllerDependencies,
  type SelectionExitReason,
  type SelectionState,
} from "../../src/selection/selection-controller";
import { OverlayRoot } from "../../src/ui/overlay-root";
import { PngDownloadError, type PngArtifact, type RetainedPngDownload } from "../../src/export/export-service";
import {
  bootstrapContentApp,
  createContentApp,
  type ContentAppDependencies,
} from "../../src/content/index";

const preferences: CardPreferences = {
  style: "history",
  ratio: "9:16",
  includeCover: true,
  gameDecoration: false,
};

const generatedOptions: GenerateOptions = {
  style: "sss",
  ratio: "3:4",
  includeCover: false,
  gameDecoration: true,
};

const source: CommentCardSource = {
  platform: "bilibili",
  content: "这是一条完整且仍然有效的评论",
  authorName: "测试用户",
  publishedAt: "2026-08-15",
  videoCoverUrl: "https://example.test/cover.jpg",
};

const attributes: CardAttributes = { humor: 91, warmth: 52, sarcasm: 78 };

class FakeOverlay extends EventTarget {
  mounts = 0;
  destroys = 0;
  selectionStates: boolean[] = [];
  confirmations: Array<{ source: CommentCardSource; preferences: CardPreferences }> = [];
  statuses: Array<{ kind: "success" | "error" | "info"; message: string }> = [];
  retryMessages: string[] = [];
  busyStates: boolean[] = [];

  mount(): void { this.mounts += 1; }
  destroy(): void { this.destroys += 1; }
  setSelectionActive(active: boolean): void { this.selectionStates.push(active); }
  showConfirm(inputSource: CommentCardSource, inputPreferences: CardPreferences): void {
    this.confirmations.push({ source: inputSource, preferences: inputPreferences });
  }
  showStatus(kind: "success" | "error" | "info", message: string): void {
    this.statuses.push({ kind, message });
  }
  showDownloadRetry(message: string): void { this.retryMessages.push(message); }
  setGenerationBusy(busy: boolean): void { this.busyStates.push(busy); }
  emit(type: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

class FakeSelectionController {
  active = false;
  enters = 0;
  exits: SelectionExitReason[] = [];
  destroys = 0;

  constructor(private readonly dependencies: SelectionControllerDependencies) {}

  enter(): void {
    if (this.active) return;
    this.active = true;
    this.enters += 1;
    this.dependencies.onStateChange({ active: true, hoveredElement: null });
  }

  exit(reason: SelectionExitReason): void {
    if (!this.active) return;
    this.active = false;
    this.exits.push(reason);
    this.dependencies.onStateChange({ active: false, hoveredElement: null, reason });
  }

  destroy(): void {
    if (this.destroys > 0) return;
    this.destroys += 1;
    if (this.active) this.exit("toggle");
  }

  select(inputSource: CommentCardSource): void {
    this.dependencies.onSelect(inputSource);
  }
}

function adapter(): PlatformAdapter {
  return {
    platform: "bilibili",
    matches: () => true,
    findCommentRoot: () => null,
    resolveComment: () => null,
    resolveCommentTarget: () => null,
    getCommentHighlightAnchor: (element) => element,
    extractComment: () => null,
    getVideoCoverUrl: () => source.videoCoverUrl,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeHarness(overrides: Partial<ContentAppDependencies> = {}) {
  const overlay = new FakeOverlay();
  let controller: FakeSelectionController | undefined;
  const canvas = document.createElement("canvas");
  const calls: string[] = [];
  const dependencies: ContentAppDependencies = {
    document,
    location: window.location,
    resolvePlatformAdapter: () => adapter(),
    createOverlay: () => overlay,
    createSelectionController: (controllerDependencies) => {
      controller = new FakeSelectionController(controllerDependencies);
      return controller;
    },
    loadPreferences: async () => ({ ...preferences }),
    savePreferences: async () => ({ ...generatedOptions }),
    generateAttributes: () => attributes,
    renderCard: async () => ({ canvas, coverFallbackUsed: false }),
    exportPng: async () => undefined,
    createFilename: () => "神评卡片-bilibili-20260815-123456.png",
    ...overrides,
  };
  return {
    overlay,
    calls,
    canvas,
    dependencies,
    get controller(): FakeSelectionController {
      if (!controller) throw new Error("controller not created");
      return controller;
    },
  };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("content application composition", () => {
  const realApps: Array<{ destroy(): void }> = [];

  afterEach(() => {
    realApps.splice(0).forEach((app) => app.destroy());
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function makeRealDomHarness(
    overrides: Partial<ContentAppDependencies> = {},
  ) {
    document.body.innerHTML = '<div data-real-comment>真实评论节点</div>';
    const comment = document.querySelector("[data-real-comment]") as HTMLElement;
    const states: SelectionState[] = [];
    let overlay: OverlayRoot | undefined;
    let controller: SelectionController | undefined;
    const realAdapter: PlatformAdapter = {
      platform: "bilibili",
      matches: () => true,
      findCommentRoot: () => document.body,
      resolveComment: (target) => {
        const element = target instanceof Element ? target : null;
        return element?.closest("[data-real-comment]") ?? null;
      },
      resolveCommentTarget: (target) => {
        const element = target instanceof Element ? target : null;
        const host = element?.closest("[data-real-comment]") ?? null;
        return host ? { host, anchor: host, kind: "legacy" } : null;
      },
      getCommentHighlightAnchor: (element) => element,
      extractComment: (element) => element === comment ? source : null,
      getVideoCoverUrl: () => source.videoCoverUrl,
    };
    const app = await createContentApp({
      document,
      location: window.location,
      resolvePlatformAdapter: () => realAdapter,
      createOverlay: (ownerDocument) => (overlay = new OverlayRoot(ownerDocument)),
      createSelectionController: (controllerDependencies) => {
        controller = new SelectionController({
          ...controllerDependencies,
          onStateChange: (state) => {
            states.push(state);
            controllerDependencies.onStateChange(state);
          },
        });
        return controller;
      },
      loadPreferences: async () => preferences,
      savePreferences: overrides.savePreferences ?? (async (input) => input),
      generateAttributes: () => attributes,
      renderCard: overrides.renderCard ?? (async () => ({
        canvas: document.createElement("canvas"),
        coverFallbackUsed: false,
      })),
      exportPng: overrides.exportPng ?? (async () => undefined),
      createPngArtifact: overrides.createPngArtifact,
      downloadPngArtifact: overrides.downloadPngArtifact,
      playGenerationSound: overrides.playGenerationSound,
      createFilename: () => "card.png",
    });
    if (!app || !overlay || !controller) throw new Error("real content app did not initialize");
    realApps.push(app);
    return { app, comment, overlay, controller, states };
  }

  it("does not mount or load preferences on an unsupported page", async () => {
    const overlayFactory = vi.fn(() => new FakeOverlay());
    const loadPreferences = vi.fn(async () => ({ ...preferences }));
    const harness = makeHarness({
      resolvePlatformAdapter: () => null,
      createOverlay: overlayFactory,
      loadPreferences,
    });

    const app = await createContentApp(harness.dependencies);

    expect(app).toBeNull();
    expect(overlayFactory).not.toHaveBeenCalled();
    expect(loadPreferences).not.toHaveBeenCalled();
  });

  it("does not expose the overlay while preferences are still loading", async () => {
    const pendingPreferences = deferred<CardPreferences>();
    const harness = makeHarness({ loadPreferences: () => pendingPreferences.promise });

    const initialization = createContentApp(harness.dependencies);
    await Promise.resolve();

    expect(harness.overlay.mounts).toBe(0);
    pendingPreferences.resolve({ ...preferences });
    await initialization;
    expect(harness.overlay.mounts).toBe(1);
  });

  it("loads preferences before mounting and toggles selection enter/exit with synchronized state", async () => {
    const order: string[] = [];
    const harness = makeHarness({
      createOverlay: () => {
        const originalMount = harness.overlay.mount.bind(harness.overlay);
        harness.overlay.mount = () => { order.push("mount"); originalMount(); };
        return harness.overlay;
      },
      loadPreferences: async () => { order.push("load"); return { ...preferences }; },
    });
    await createContentApp(harness.dependencies);

    harness.overlay.emit("toggle-selection");
    harness.overlay.emit("toggle-selection");
    harness.overlay.emit("toggle-selection");
    harness.overlay.emit("exit-selection");

    expect(order).toEqual(["load", "mount"]);
    expect(harness.controller.enters).toBe(2);
    expect(harness.controller.exits).toEqual(["toggle", "hint"]);
    expect(harness.overlay.selectionStates).toEqual([false, true, false, true, false]);
  });

  it("lets the real overlay entry toggle active selection off without an outside-click exit", async () => {
    const harness = await makeRealDomHarness();
    (harness.overlay.shadowRoot!.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement).click();
    expect(harness.controller.active).toBe(true);

    (harness.overlay.shadowRoot!.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement).click();

    expect(harness.controller.active).toBe(false);
    expect(harness.states.at(-1)?.reason).toBe("toggle");
  });

  it("lets the real overlay exit hint produce the hint reason", async () => {
    const harness = await makeRealDomHarness();
    (harness.overlay.shadowRoot!.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement).click();

    (harness.overlay.shadowRoot!.querySelector('[aria-label="退出评论选择"]') as HTMLButtonElement).click();

    expect(harness.controller.active).toBe(false);
    expect(harness.states.at(-1)?.reason).toBe("hint");
  });

  it("exits selection on panel close and restores native comment click and contextmenu handling", async () => {
    const harness = await makeRealDomHarness();
    (harness.overlay.shadowRoot!.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement).click();
    harness.comment.click();
    expect(harness.overlay.shadowRoot!.querySelector('[aria-label="关闭制作面板"]')).not.toBeNull();

    (harness.overlay.shadowRoot!.querySelector('[aria-label="关闭制作面板"]') as HTMLButtonElement).click();

    expect(harness.controller.active).toBe(false);
    expect(harness.states.at(-1)?.reason).toBe("panel-close");
    expect(harness.overlay.shadowRoot!.querySelector('[aria-label="关闭制作面板"]')).toBeNull();

    const nativeEvents: string[] = [];
    harness.comment.addEventListener("click", () => nativeEvents.push("click"));
    harness.comment.addEventListener("contextmenu", () => nativeEvents.push("contextmenu"));
    const click = new MouseEvent("click", { bubbles: true, composed: true, cancelable: true });
    const contextmenu = new MouseEvent("contextmenu", { bubbles: true, composed: true, cancelable: true });
    harness.comment.dispatchEvent(click);
    harness.comment.dispatchEvent(contextmenu);

    expect(click.defaultPrevented).toBe(false);
    expect(contextmenu.defaultPrevented).toBe(false);
    expect(nativeEvents).toEqual(["click", "contextmenu"]);
    expect(harness.overlay.shadowRoot!.querySelector(".ccg-extension-panel")).toBeNull();

    const stateCount = harness.states.length;
    harness.app.destroy();
    harness.app.destroy();
    expect(harness.states).toHaveLength(stateCount);
  });

  it("does not consume a context menu opened inside the real overlay", async () => {
    const harness = await makeRealDomHarness();
    (harness.overlay.shadowRoot!.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement).click();
    const entry = harness.overlay.shadowRoot!.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement;
    const event = new MouseEvent("contextmenu", { bubbles: true, composed: true, cancelable: true });

    entry.dispatchEvent(event);

    expect(harness.controller.active).toBe(true);
    expect(event.defaultPrevented).toBe(false);
  });

  it("waits at generated preview and downloads only after confirmation", async () => {
    const rendering = deferred<{ canvas: HTMLCanvasElement; coverFallbackUsed: boolean }>();
    const exporting = deferred<void>();
    const exportPng = vi.fn(async () => undefined);
    const artifact: PngArtifact = {
      blob: new Blob(["png"]),
      url: "blob:preview-card",
      width: 1200,
      height: 1600,
      release: vi.fn(),
    };
    const createPngArtifact = vi.fn(async () => artifact);
    const downloadPngArtifact = vi.fn(() => exporting.promise);
    const harness = await makeRealDomHarness({
      renderCard: () => rendering.promise,
      exportPng,
      createPngArtifact,
      downloadPngArtifact,
    });
    (harness.overlay.shadowRoot!.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement).click();
    harness.comment.click();
    (harness.overlay.shadowRoot!.querySelector('[aria-label="制作卡片"]') as HTMLButtonElement).click();
    const renderingCancel = harness.overlay.shadowRoot!.querySelector(
      '[aria-label="关闭制作面板"]',
    ) as HTMLButtonElement;
    expect(renderingCancel.disabled).toBe(true);

    const renderedCanvas = document.createElement("canvas");
    renderedCanvas.width = 1200;
    renderedCanvas.height = 1600;
    rendering.resolve({ canvas: renderedCanvas, coverFallbackUsed: false });
    await vi.waitFor(() => {
      expect(harness.overlay.shadowRoot!.querySelector('.ccg-extension-panel[data-panel-state="generated"]')).not.toBeNull();
    });
    expect((harness.overlay.shadowRoot!.querySelector('[alt="生成的评论卡片预览"]') as HTMLImageElement).src).toBe("blob:preview-card");
    expect(harness.overlay.shadowRoot!.textContent).toContain("1200 × 1600");
    expect(exportPng).not.toHaveBeenCalled();
    expect(downloadPngArtifact).not.toHaveBeenCalled();
    expect(harness.controller.active).toBe(true);

    (harness.overlay.shadowRoot!.querySelector('[aria-label="确认保存"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(downloadPngArtifact).toHaveBeenCalledWith(artifact, "card.png"));
    expect((harness.overlay.shadowRoot!.querySelector('[aria-label="确认保存"]') as HTMLButtonElement).disabled).toBe(true);
    expect((harness.overlay.shadowRoot!.querySelector('[aria-label="关闭制作面板"]') as HTMLButtonElement).disabled).toBe(true);
    expect((harness.overlay.shadowRoot!.querySelector('[aria-label="返回修改"]') as HTMLButtonElement).disabled).toBe(true);
    expect(harness.controller.active).toBe(false);

    exporting.resolve();
    await settle();
    expect(exportPng).not.toHaveBeenCalled();
    expect(harness.overlay.shadowRoot!.querySelector('.ccg-extension-panel[data-panel-state="saved"]')).not.toBeNull();
    expect(harness.controller.active).toBe(false);
    expect(harness.states.at(-1)?.reason).toBe("toggle");
  });

  it("releases the pending preview artifact when the generated panel is closed", async () => {
    const artifact: PngArtifact = {
      blob: new Blob(["png"]),
      url: "blob:preview-to-close",
      width: 1200,
      height: 1600,
      release: vi.fn(),
    };
    const harness = await makeRealDomHarness({
      createPngArtifact: async () => artifact,
      downloadPngArtifact: async () => undefined,
    });
    (harness.overlay.shadowRoot!.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement).click();
    harness.comment.click();
    (harness.overlay.shadowRoot!.querySelector('[aria-label="制作卡片"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(harness.overlay.shadowRoot!.querySelector('.ccg-extension-panel[data-panel-state="generated"]')).not.toBeNull();
    });

    (harness.overlay.shadowRoot!.querySelector('[aria-label="关闭制作面板"]') as HTMLButtonElement).click();

    expect(artifact.release).toHaveBeenCalledOnce();
    expect(harness.overlay.shadowRoot!.querySelector(".ccg-extension-panel")).toBeNull();
  });

  it("returns to editing when an in-flight generation is cancelled", async () => {
    const rendering = deferred<{ canvas: HTMLCanvasElement; coverFallbackUsed: boolean }>();
    const harness = await makeRealDomHarness({ renderCard: () => rendering.promise });
    (harness.overlay.shadowRoot!.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement).click();
    harness.comment.click();
    (harness.overlay.shadowRoot!.querySelector('[aria-label="制作卡片"]') as HTMLButtonElement).click();

    (harness.overlay.shadowRoot!.querySelector('[aria-label="取消制作"]') as HTMLButtonElement).click();

    expect(harness.overlay.shadowRoot!.querySelector('.ccg-extension-panel[data-panel-state="editing"]')).not.toBeNull();
    rendering.resolve({ canvas: document.createElement("canvas"), coverFallbackUsed: false });
    await settle();
    expect(harness.overlay.shadowRoot!.querySelector('.ccg-extension-panel[data-panel-state="generated"]')).toBeNull();
  });

  it("ignores a cancelled render that later rejects", async () => {
    const rendering = deferred<{ canvas: HTMLCanvasElement; coverFallbackUsed: boolean }>();
    const renderCard = vi.fn(() => rendering.promise);
    const harness = await makeRealDomHarness({ renderCard });
    (harness.overlay.shadowRoot!.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement).click();
    harness.comment.click();
    (harness.overlay.shadowRoot!.querySelector('[aria-label="制作卡片"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(renderCard).toHaveBeenCalledOnce());
    (harness.overlay.shadowRoot!.querySelector('[aria-label="取消制作"]') as HTMLButtonElement).click();

    rendering.reject(new Error("late render failure"));
    await settle();

    expect(harness.overlay.shadowRoot!.querySelector('.ccg-extension-panel[data-panel-state="editing"]')).not.toBeNull();
    expect(harness.overlay.shadowRoot!.querySelector('.ccg-extension-panel[data-panel-state="failed"]')).toBeNull();
  });

  it("keeps a newly selected comment when the previous render finishes late", async () => {
    const rendering = deferred<{ canvas: HTMLCanvasElement; coverFallbackUsed: boolean }>();
    const renderCard = vi.fn(() => rendering.promise);
    const exportPng = vi.fn(async () => undefined);
    const harness = makeHarness({ renderCard, exportPng });
    await createContentApp(harness.dependencies);
    harness.overlay.emit("toggle-selection");
    harness.controller.select(source);
    harness.overlay.emit("confirm-generate", { source, options: generatedOptions });
    await vi.waitFor(() => expect(renderCard).toHaveBeenCalledOnce());
    const replacement = { ...source, content: "新选择的评论" };
    harness.controller.select(replacement);

    rendering.resolve({ canvas: document.createElement("canvas"), coverFallbackUsed: false });
    await settle();

    expect(harness.overlay.confirmations.at(-1)?.source).toEqual(replacement);
    expect(harness.overlay.busyStates).toEqual([true, false]);
    expect(exportPng).not.toHaveBeenCalled();
  });

  it("ignores an artifact creation failure that arrives after cancellation", async () => {
    const artifactCreation = deferred<PngArtifact>();
    const createPngArtifact = vi.fn(() => artifactCreation.promise);
    const harness = await makeRealDomHarness({
      createPngArtifact,
      downloadPngArtifact: async () => undefined,
    });
    (harness.overlay.shadowRoot!.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement).click();
    harness.comment.click();
    (harness.overlay.shadowRoot!.querySelector('[aria-label="制作卡片"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(createPngArtifact).toHaveBeenCalledOnce());
    (harness.overlay.shadowRoot!.querySelector('[aria-label="取消制作"]') as HTMLButtonElement).click();

    artifactCreation.reject(new Error("late artifact failure"));
    await settle();

    expect(harness.overlay.shadowRoot!.querySelector('.ccg-extension-panel[data-panel-state="editing"]')).not.toBeNull();
    expect(harness.overlay.shadowRoot!.querySelector('.ccg-extension-panel[data-panel-state="failed"]')).toBeNull();
  });

  it("moves a successful retained-download retry from generated to saved", async () => {
    const retained: RetainedPngDownload = {
      retry: vi.fn(async () => undefined),
      release: vi.fn(),
    };
    const artifact: PngArtifact = {
      blob: new Blob(["png"]),
      url: "blob:retry-preview",
      width: 1920,
      height: 1080,
      release: vi.fn(),
    };
    const renderedCanvas = document.createElement("canvas");
    renderedCanvas.width = 1920;
    renderedCanvas.height = 1080;
    const harness = await makeRealDomHarness({
      renderCard: async () => ({ canvas: renderedCanvas, coverFallbackUsed: false }),
      createPngArtifact: async () => artifact,
      downloadPngArtifact: async () => { throw new PngDownloadError("download failed", retained); },
    });
    (harness.overlay.shadowRoot!.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement).click();
    harness.comment.click();
    (harness.overlay.shadowRoot!.querySelector('[aria-label="制作卡片"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(harness.overlay.shadowRoot!.querySelector('.ccg-extension-panel[data-panel-state="generated"]')).not.toBeNull();
    });
    (harness.overlay.shadowRoot!.querySelector('[aria-label="确认保存"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(harness.overlay.shadowRoot!.querySelector('[aria-label="再次下载"]')).not.toBeNull();
    });

    (harness.overlay.shadowRoot!.querySelector('[aria-label="再次下载"]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(harness.overlay.shadowRoot!.querySelector('.ccg-extension-panel[data-panel-state="saved"]')).not.toBeNull();
    });
    expect(harness.overlay.shadowRoot!.textContent).toContain("1920 × 1080");
    expect(retained.retry).toHaveBeenCalledOnce();
    expect(harness.controller.active).toBe(false);
  });

  it("shows the failed state when PNG artifact creation fails", async () => {
    const harness = await makeRealDomHarness({
      createPngArtifact: async () => { throw new Error("blob failed"); },
      downloadPngArtifact: async () => undefined,
    });
    (harness.overlay.shadowRoot!.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement).click();
    harness.comment.click();

    (harness.overlay.shadowRoot!.querySelector('[aria-label="制作卡片"]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(harness.overlay.shadowRoot!.querySelector('.ccg-extension-panel[data-panel-state="failed"]')).not.toBeNull();
    });
    expect(harness.overlay.shadowRoot!.textContent).toContain("卡片生成失败");
  });

  it("shows the already-extracted source with current preferences and panel close exits selection", async () => {
    const harness = makeHarness();
    await createContentApp(harness.dependencies);
    harness.overlay.emit("toggle-selection");

    harness.controller.select(source);
    harness.overlay.emit("cancel-generate");

    expect(harness.overlay.confirmations).toEqual([{ source, preferences }]);
    expect(harness.controller.active).toBe(false);
    expect(harness.controller.exits).toEqual(["panel-close"]);
    expect(harness.overlay.selectionStates.at(-1)).toBe(false);
  });

  it("saves production preferences then generates, renders, exports, completes, and exits", async () => {
    const order: string[] = [];
    const saved: CardPreferences[] = [];
    const renderInputs: unknown[] = [];
    const exportInputs: unknown[] = [];
    const harness = makeHarness({
      savePreferences: async (input) => { order.push("save"); saved.push(input); return input; },
      generateAttributes: (content, style) => {
        order.push("attributes");
        expect([content, style]).toEqual([source.content, generatedOptions.style]);
        return attributes;
      },
      renderCard: async (input) => {
        order.push("render");
        renderInputs.push(input);
        return { canvas: harness.canvas, coverFallbackUsed: false };
      },
      exportPng: async (canvas, filename) => {
        order.push("export");
        exportInputs.push({ canvas, filename });
      },
    });
    await createContentApp(harness.dependencies);
    harness.overlay.emit("toggle-selection");
    harness.controller.select(source);

    harness.overlay.emit("confirm-generate", { source, options: generatedOptions });
    await settle();

    expect(order).toEqual(["save", "attributes", "render", "export"]);
    const exactOptions = { ...generatedOptions, includeAttributes: false, soundEnabled: false, panelSkin: "pixel" };
    expect(saved).toEqual([exactOptions]);
    expect(Object.keys(saved[0]).sort()).toEqual([
      "gameDecoration",
      "includeAttributes",
      "includeCover",
      "panelSkin",
      "ratio",
      "soundEnabled",
      "style",
    ]);
    expect(renderInputs).toEqual([{ source, options: exactOptions, attributes }]);
    expect(exportInputs).toEqual([{
      canvas: harness.canvas,
      filename: "神评卡片-bilibili-20260815-123456.png",
    }]);
    expect(harness.overlay.statuses.at(-1)).toEqual({ kind: "success", message: "卡片已保存" });
    expect(harness.controller.exits).toEqual(["toggle"]);
    expect(harness.overlay.busyStates).toEqual([true, false]);
  });

  it("preserves an adapter video title through confirmation and card rendering", async () => {
    const titledSource = { ...source, videoTitle: "来自 B站页面的真实视频标题" };
    const renderCard = vi.fn(async () => ({ canvas: document.createElement("canvas"), coverFallbackUsed: false }));
    const harness = makeHarness({ renderCard });
    await createContentApp(harness.dependencies);
    harness.overlay.emit("toggle-selection");

    harness.controller.select(titledSource);
    harness.overlay.emit("confirm-generate", { source: titledSource, options: generatedOptions });
    await settle();

    expect(harness.overlay.confirmations).toEqual([{ source: titledSource, preferences }]);
    expect(renderCard).toHaveBeenCalledWith(expect.objectContaining({ source: titledSource }));
  });

  it("plays enabled generation sound exactly once under reduced motion and persists every exact preference", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const playGenerationSound = vi.fn();
    const savePreferences = vi.fn(async (input: CardPreferences) => input);
    const renderCard = vi.fn(async () => ({ canvas: document.createElement("canvas"), coverFallbackUsed: false }));
    const harness = await makeRealDomHarness({ playGenerationSound, savePreferences, renderCard });
    (harness.overlay.shadowRoot!.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement).click();
    harness.comment.click();
    (harness.overlay.shadowRoot!.querySelector('[aria-label="更多选项设置"]') as HTMLButtonElement).click();
    (harness.overlay.shadowRoot!.querySelector('[aria-label="播放制作声效"]') as HTMLInputElement).click();
    (harness.overlay.shadowRoot!.querySelector('input[name="ccg-panel-skin"][value="classic-dark"]') as HTMLInputElement).click();
    const generate = harness.overlay.shadowRoot!.querySelector('[aria-label="制作卡片"]') as HTMLButtonElement;

    generate.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    generate.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await settle();

    const exactPreferences: CardPreferences = {
      style: "history",
      ratio: "9:16",
      includeCover: true,
      includeAttributes: false,
      gameDecoration: false,
      soundEnabled: true,
      panelSkin: "classic-dark",
    };
    expect(playGenerationSound).toHaveBeenCalledOnce();
    expect(savePreferences).toHaveBeenCalledWith(exactPreferences);
    expect(renderCard).toHaveBeenCalledWith(expect.objectContaining({ options: exactPreferences }));
  });

  it("keeps generation non-blocking when enabled sound playback throws or rejects", async () => {
    for (const playGenerationSound of [
      vi.fn(() => { throw new Error("audio constructor failed"); }),
      vi.fn(() => Promise.reject(new Error("audio resume failed"))),
    ]) {
      const renderCard = vi.fn(async () => ({ canvas: document.createElement("canvas"), coverFallbackUsed: false }));
      const harness = makeHarness({ playGenerationSound, renderCard });
      await createContentApp(harness.dependencies);
      harness.overlay.emit("confirm-generate", {
        source,
        options: { ...generatedOptions, soundEnabled: true },
      });
      await settle();

      expect(playGenerationSound).toHaveBeenCalledOnce();
      expect(renderCard).toHaveBeenCalledOnce();
      expect(harness.overlay.statuses.at(-1)).toEqual({ kind: "success", message: "卡片已保存" });
    }
  });

  it("does not request generation sound when the preference is disabled", async () => {
    const playGenerationSound = vi.fn();
    const harness = makeHarness({ playGenerationSound });
    await createContentApp(harness.dependencies);

    harness.overlay.emit("confirm-generate", {
      source,
      options: { ...generatedOptions, soundEnabled: false },
    });
    await settle();

    expect(playGenerationSound).not.toHaveBeenCalled();
  });

  it("includes the no-cover degradation in the user-perceivable success message", async () => {
    const harness = makeHarness({
      renderCard: async () => ({ canvas: document.createElement("canvas"), coverFallbackUsed: true }),
    });
    await createContentApp(harness.dependencies);
    harness.overlay.emit("toggle-selection");

    harness.overlay.emit("confirm-generate", { source, options: generatedOptions });
    await settle();

    expect(harness.overlay.statuses.at(-1)).toEqual({
      kind: "success",
      message: "封面加载失败，已使用无封面布局；卡片已保存",
    });
  });

  it("rejects stale source before render and remains in selection mode", async () => {
    const renderCard = vi.fn(async () => ({ canvas: document.createElement("canvas"), coverFallbackUsed: false }));
    const exportPng = vi.fn(async () => undefined);
    const harness = makeHarness({ renderCard, exportPng });
    await createContentApp(harness.dependencies);
    harness.overlay.emit("toggle-selection");
    const stale = { ...source, content: "   " };

    harness.overlay.emit("confirm-generate", { source: stale, options: generatedOptions });
    await settle();

    expect(renderCard).not.toHaveBeenCalled();
    expect(exportPng).not.toHaveBeenCalled();
    expect(harness.overlay.statuses.at(-1)).toEqual({ kind: "error", message: "评论已失效，请重新选择" });
    expect(harness.controller.active).toBe(true);
    expect(harness.overlay.busyStates).toEqual([true, false]);
  });

  it("shows render errors while keeping selection and generation available for retry", async () => {
    const harness = makeHarness({ renderCard: async () => { throw new Error("canvas failed"); } });
    await createContentApp(harness.dependencies);
    harness.overlay.emit("toggle-selection");

    harness.overlay.emit("confirm-generate", { source, options: generatedOptions });
    await settle();

    expect(harness.overlay.statuses.at(-1)).toEqual({
      kind: "error",
      message: "卡片生成失败，请重新选择或重试",
    });
    expect(harness.controller.active).toBe(true);
    expect(harness.overlay.busyStates).toEqual([true, false]);
  });

  it("retains a failed download, retries it without rendering again, then completes and exits", async () => {
    const retained: RetainedPngDownload = {
      retry: vi.fn(async () => undefined),
      release: vi.fn(),
    };
    const renderCard = vi.fn(async () => ({ canvas: document.createElement("canvas"), coverFallbackUsed: false }));
    const exportPng = vi.fn(async () => { throw new PngDownloadError("download failed", retained); });
    const harness = makeHarness({ renderCard, exportPng });
    await createContentApp(harness.dependencies);
    harness.overlay.emit("toggle-selection");

    harness.overlay.emit("confirm-generate", { source, options: generatedOptions });
    await settle();
    expect(harness.overlay.retryMessages).toEqual(["下载失败，请再次下载"]);
    expect(harness.controller.active).toBe(true);

    harness.overlay.emit("retry-download");
    await settle();

    expect(retained.retry).toHaveBeenCalledOnce();
    expect(retained.release).not.toHaveBeenCalled();
    expect(renderCard).toHaveBeenCalledOnce();
    expect(exportPng).toHaveBeenCalledOnce();
    expect(harness.overlay.statuses.at(-1)).toEqual({ kind: "success", message: "卡片已保存" });
    expect(harness.controller.exits).toEqual(["toggle", "toggle"]);
  });

  it("does not complete or restore a retained download after retry is cancelled in flight", async () => {
    const retrying = deferred<void>();
    const retained: RetainedPngDownload = {
      retry: vi.fn(() => retrying.promise),
      release: vi.fn(),
    };
    const harness = makeHarness({
      exportPng: async () => { throw new PngDownloadError("download failed", retained); },
    });
    await createContentApp(harness.dependencies);
    harness.overlay.emit("toggle-selection");
    harness.overlay.emit("confirm-generate", { source, options: generatedOptions });
    await settle();

    harness.overlay.emit("retry-download");
    harness.overlay.emit("cancel-download");
    retrying.resolve();
    await settle();

    expect(retained.release).toHaveBeenCalledOnce();
    expect(harness.overlay.statuses.some((status) => status.kind === "success")).toBe(false);
    expect(harness.controller.active).toBe(true);
    expect(harness.controller.exits).toEqual(["toggle", "toggle"]);
  });

  it("releases retained downloads on replacement, cancel, status dismissal, and idempotent destroy", async () => {
    const retainedDownloads: RetainedPngDownload[] = [];
    const exportPng = vi.fn(async () => {
      const retained: RetainedPngDownload = { retry: vi.fn(async () => undefined), release: vi.fn() };
      retainedDownloads.push(retained);
      throw new PngDownloadError("download failed", retained);
    });
    const harness = makeHarness({ exportPng });
    const app = await createContentApp(harness.dependencies);
    if (!app) throw new Error("expected supported app");
    harness.overlay.emit("toggle-selection");

    harness.overlay.emit("confirm-generate", { source, options: generatedOptions });
    await settle();
    harness.overlay.emit("confirm-generate", { source, options: generatedOptions });
    await settle();
    expect(retainedDownloads[0].release).toHaveBeenCalledOnce();

    harness.overlay.emit("cancel-generate");
    expect(retainedDownloads[1].release).toHaveBeenCalledOnce();

    harness.overlay.emit("confirm-generate", { source, options: generatedOptions });
    await settle();
    harness.overlay.emit("cancel-download");
    expect(retainedDownloads[2].release).toHaveBeenCalledOnce();

    harness.overlay.emit("confirm-generate", { source, options: generatedOptions });
    await settle();
    app.destroy();
    app.destroy();

    expect(retainedDownloads[3].release).toHaveBeenCalledOnce();
    expect(harness.controller.destroys).toBe(1);
    expect(harness.overlay.destroys).toBe(1);
  });

  it("guards duplicate concurrent generation until the first operation settles", async () => {
    const saving = deferred<CardPreferences>();
    const savePreferences = vi.fn(() => saving.promise);
    const renderCard = vi.fn(async () => ({ canvas: document.createElement("canvas"), coverFallbackUsed: false }));
    const harness = makeHarness({ savePreferences, renderCard });
    await createContentApp(harness.dependencies);
    harness.overlay.emit("toggle-selection");

    harness.overlay.emit("confirm-generate", { source, options: generatedOptions });
    harness.overlay.emit("confirm-generate", { source, options: generatedOptions });
    await Promise.resolve();

    expect(savePreferences).toHaveBeenCalledOnce();
    expect(renderCard).not.toHaveBeenCalled();
    expect(harness.overlay.busyStates).toEqual([true]);

    saving.resolve(generatedOptions);
    await settle();
    expect(renderCard).toHaveBeenCalledOnce();
    expect(harness.overlay.busyStates).toEqual([true, false]);
  });

  it("does not start export when the app is destroyed while rendering", async () => {
    const rendering = deferred<{ canvas: HTMLCanvasElement; coverFallbackUsed: boolean }>();
    const exportPng = vi.fn(async () => undefined);
    const harness = makeHarness({ renderCard: () => rendering.promise, exportPng });
    const app = await createContentApp(harness.dependencies);
    if (!app) throw new Error("expected supported app");
    harness.overlay.emit("toggle-selection");

    harness.overlay.emit("confirm-generate", { source, options: generatedOptions });
    await Promise.resolve();
    app.destroy();
    rendering.resolve({ canvas: harness.canvas, coverFallbackUsed: false });
    await settle();

    expect(exportPng).not.toHaveBeenCalled();
    expect(harness.overlay.destroys).toBe(1);
    expect(harness.controller.destroys).toBe(1);
  });

  it("bootstraps only one app instance for the same page", async () => {
    const page = document.implementation.createHTMLDocument("isolated page");
    const harness = makeHarness({ document: page, location: window.location });

    const first = await bootstrapContentApp(harness.dependencies);
    const second = await bootstrapContentApp(harness.dependencies);

    expect(first).toBe(second);
    expect(harness.overlay.mounts).toBe(1);
  });

  it("does not auto-mount when imported in test mode on a supported page", async () => {
    document.body.innerHTML = '<main id="supported-page"></main>';
    vi.resetModules();

    await import("../../src/content/index");
    await Promise.resolve();

    expect(document.querySelector("[data-ccg-overlay-root]")).toBeNull();
    expect(document.querySelector("#supported-page")).not.toBeNull();
  });
});
