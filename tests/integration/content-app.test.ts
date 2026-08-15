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
import { PngDownloadError, type RetainedPngDownload } from "../../src/export/export-service";
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
    getCommentHighlightAnchor: (element) => element,
    extractComment: () => null,
    getVideoCoverUrl: () => source.videoCoverUrl,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
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
    overrides: Partial<Pick<ContentAppDependencies, "renderCard" | "exportPng">> = {},
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
      savePreferences: async (input) => input,
      generateAttributes: () => attributes,
      renderCard: overrides.renderCard ?? (async () => ({
        canvas: document.createElement("canvas"),
        coverFallbackUsed: false,
      })),
      exportPng: overrides.exportPng ?? (async () => undefined),
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

  it("keeps real selection active when confirmation is cancelled inside the overlay", async () => {
    const harness = await makeRealDomHarness();
    (harness.overlay.shadowRoot!.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement).click();
    harness.comment.click();
    expect(harness.overlay.shadowRoot!.querySelector('[aria-label="取消生成"]')).not.toBeNull();

    (harness.overlay.shadowRoot!.querySelector('[aria-label="取消生成"]') as HTMLButtonElement).click();

    expect(harness.controller.active).toBe(true);
    expect(harness.overlay.shadowRoot!.querySelector('[aria-label="取消生成"]')).toBeNull();
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

  it("keeps current, retained, and programmatic cancel inert while real generation is busy", async () => {
    const rendering = deferred<{ canvas: HTMLCanvasElement; coverFallbackUsed: boolean }>();
    const exporting = deferred<void>();
    const exportPng = vi.fn(() => exporting.promise);
    const harness = await makeRealDomHarness({ renderCard: () => rendering.promise, exportPng });
    (harness.overlay.shadowRoot!.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement).click();
    harness.comment.click();
    const retainedCancel = harness.overlay.shadowRoot!.querySelector(
      '[aria-label="取消生成"]',
    ) as HTMLButtonElement;

    (harness.overlay.shadowRoot!.querySelector('[aria-label="生成卡片"]') as HTMLButtonElement).click();
    const renderingCancel = harness.overlay.shadowRoot!.querySelector(
      '[aria-label="取消生成"]',
    ) as HTMLButtonElement;
    expect(renderingCancel.disabled).toBe(true);

    retainedCancel.click();
    harness.overlay.dispatchEvent(new CustomEvent("cancel-generate"));
    expect(harness.overlay.shadowRoot!.querySelector('[aria-label="取消生成"]')).not.toBeNull();
    expect(harness.controller.active).toBe(true);

    rendering.resolve({ canvas: document.createElement("canvas"), coverFallbackUsed: false });
    await vi.waitFor(() => expect(exportPng).toHaveBeenCalledOnce());
    const exportingCancel = harness.overlay.shadowRoot!.querySelector(
      '[aria-label="取消生成"]',
    ) as HTMLButtonElement;
    expect(exportingCancel.disabled).toBe(true);

    exportingCancel.click();
    harness.overlay.dispatchEvent(new CustomEvent("cancel-generate"));
    expect(harness.overlay.shadowRoot!.querySelector('[aria-label="取消生成"]')).not.toBeNull();
    expect(harness.controller.active).toBe(true);

    exporting.resolve();
    await settle();
    expect(exportPng).toHaveBeenCalledOnce();
    expect(harness.controller.active).toBe(false);
    expect(harness.states.at(-1)?.reason).toBe("toggle");
  });

  it("shows the already-extracted source with current preferences and cancel preserves active selection", async () => {
    const harness = makeHarness();
    await createContentApp(harness.dependencies);
    harness.overlay.emit("toggle-selection");

    harness.controller.select(source);
    harness.overlay.emit("cancel-generate");

    expect(harness.overlay.confirmations).toEqual([{ source, preferences }]);
    expect(harness.controller.active).toBe(true);
    expect(harness.controller.exits).toEqual([]);
    expect(harness.overlay.selectionStates.at(-1)).toBe(true);
  });

  it("saves exactly four preferences then generates attributes, renders, exports, completes, and exits", async () => {
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
    expect(saved).toEqual([{ ...generatedOptions }]);
    expect(Object.keys(saved[0]).sort()).toEqual(["gameDecoration", "includeCover", "ratio", "style"]);
    expect(renderInputs).toEqual([{ source, options: generatedOptions, attributes }]);
    expect(exportInputs).toEqual([{
      canvas: harness.canvas,
      filename: "神评卡片-bilibili-20260815-123456.png",
    }]);
    expect(harness.overlay.statuses.at(-1)).toEqual({ kind: "success", message: "卡片已保存" });
    expect(harness.controller.exits).toEqual(["toggle"]);
    expect(harness.overlay.busyStates).toEqual([true, false]);
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
    expect(harness.controller.exits).toEqual(["toggle"]);
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
    expect(harness.controller.exits).toEqual([]);
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
