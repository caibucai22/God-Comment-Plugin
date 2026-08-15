import { generateAttributes as defaultGenerateAttributes } from "../attributes/generator";
import type {
  CardAttributes,
  CardPreferences,
  CommentCardSource,
  GenerateOptions,
} from "../domain/types";
import {
  PngDownloadError,
  createPngFilename,
  exportPng as defaultExportPng,
  type RetainedPngDownload,
} from "../export/export-service";
import { resolvePlatformAdapter as defaultResolvePlatformAdapter } from "../platform/adapter-registry";
import type { PlatformAdapter } from "../platform/platform-adapter";
import {
  renderCard as defaultRenderCard,
  type RenderCardInput,
  type RenderCardResult,
} from "../render/card-renderer";
import {
  SelectionController,
  type SelectionControllerDependencies,
  type SelectionExitReason,
} from "../selection/selection-controller";
import {
  loadPreferences as defaultLoadPreferences,
  savePreferences as defaultSavePreferences,
} from "../storage/preferences";
import { OverlayRoot } from "../ui/overlay-root";

type StatusKind = "success" | "error" | "info";

export interface ContentOverlay {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  mount(): void;
  destroy(): void;
  setSelectionActive(active: boolean): void;
  showConfirm(source: CommentCardSource, preferences: CardPreferences): void;
  showStatus(kind: StatusKind, message: string): void;
  showDownloadRetry(message: string): void;
  setGenerationBusy(busy: boolean): void;
}

export interface ContentSelectionController {
  readonly active: boolean;
  enter(): void;
  exit(reason: SelectionExitReason): void;
  destroy(): void;
}

export interface ContentAppDependencies {
  readonly document: Document;
  readonly location: Location;
  readonly resolvePlatformAdapter: (document: Document, location: Location) => PlatformAdapter | null;
  readonly createOverlay: (document: Document) => ContentOverlay;
  readonly createSelectionController: (
    dependencies: SelectionControllerDependencies,
  ) => ContentSelectionController;
  readonly loadPreferences: () => Promise<CardPreferences>;
  readonly savePreferences: (preferences: CardPreferences) => Promise<CardPreferences>;
  readonly generateAttributes: (content: string, style: GenerateOptions["style"]) => CardAttributes;
  readonly renderCard: (input: RenderCardInput) => Promise<RenderCardResult>;
  readonly exportPng: (canvas: HTMLCanvasElement, filename: string) => Promise<void>;
  readonly createFilename: () => string;
}

export interface ContentApp {
  destroy(): void;
}

interface GenerateDetail {
  readonly source: CommentCardSource;
  readonly options: GenerateOptions;
}

function validSource(source: CommentCardSource, adapter: PlatformAdapter): boolean {
  return source.platform === adapter.platform && source.content.trim().length > 0;
}

function completionMessage(coverFallbackUsed: boolean): string {
  return coverFallbackUsed
    ? "封面加载失败，已使用无封面布局；卡片已保存"
    : "卡片已保存";
}

export async function createContentApp(
  dependencies: ContentAppDependencies,
): Promise<ContentApp | null> {
  const adapter = dependencies.resolvePlatformAdapter(dependencies.document, dependencies.location);
  if (!adapter) return null;

  const overlay = dependencies.createOverlay(dependencies.document);
  overlay.mount();

  let preferences: CardPreferences;
  try {
    preferences = await dependencies.loadPreferences();
  } catch (error) {
    overlay.destroy();
    throw error;
  }

  let destroyed = false;
  let generating = false;
  let retainedDownload: RetainedPngDownload | null = null;
  let retainedSuccessMessage = "卡片已保存";

  const controller = dependencies.createSelectionController({
    adapter,
    document: dependencies.document,
    onSelect: (selectedSource) => {
      if (!destroyed) overlay.showConfirm(selectedSource, preferences);
    },
    onStateChange: (state) => {
      if (!destroyed) overlay.setSelectionActive(state.active);
    },
  });

  const releaseRetained = (): boolean => {
    if (!retainedDownload) return false;
    const retained = retainedDownload;
    retainedDownload = null;
    retained.release();
    return true;
  };

  const ensureSelectionActive = (): void => {
    if (!controller.active) controller.enter();
    else overlay.setSelectionActive(true);
  };

  const complete = (message: string): void => {
    if (destroyed) return;
    overlay.showStatus("success", message);
    controller.exit("toggle");
  };

  const handleGenerate = async ({ source, options }: GenerateDetail): Promise<void> => {
    if (destroyed || generating) return;
    generating = true;
    overlay.setGenerationBusy(true);
    if (releaseRetained()) overlay.showStatus("info", "正在生成卡片");

    try {
      if (!validSource(source, adapter)) {
        overlay.showStatus("error", "评论已失效，请重新选择");
        ensureSelectionActive();
        return;
      }

      const exactPreferences: CardPreferences = {
        style: options.style,
        ratio: options.ratio,
        includeCover: options.includeCover,
        gameDecoration: options.gameDecoration,
      };

      let rendered: RenderCardResult;
      try {
        await dependencies.savePreferences(exactPreferences);
        if (destroyed) return;
        preferences = exactPreferences;
        const generatedAttributes = dependencies.generateAttributes(source.content, options.style);
        rendered = await dependencies.renderCard({ source, options: exactPreferences, attributes: generatedAttributes });
        if (destroyed) return;
      } catch {
        if (!destroyed) {
          overlay.showStatus("error", "卡片生成失败，请重新选择或重试");
          ensureSelectionActive();
        }
        return;
      }

      const successMessage = completionMessage(rendered.coverFallbackUsed);
      try {
        await dependencies.exportPng(rendered.canvas, dependencies.createFilename());
      } catch (error) {
        if (error instanceof PngDownloadError) {
          if (destroyed) {
            error.retained.release();
          } else {
            retainedDownload = error.retained;
            retainedSuccessMessage = successMessage;
            overlay.showDownloadRetry("下载失败，请再次下载");
            ensureSelectionActive();
          }
        } else if (!destroyed) {
          overlay.showStatus("error", "下载失败，请重新生成");
          ensureSelectionActive();
        }
        return;
      }

      complete(successMessage);
    } finally {
      generating = false;
      if (!destroyed) overlay.setGenerationBusy(false);
    }
  };

  const handleRetry = async (): Promise<void> => {
    if (destroyed || generating || !retainedDownload) return;
    generating = true;
    overlay.setGenerationBusy(true);
    const retained = retainedDownload;

    try {
      await retained.retry();
      if (retainedDownload !== retained) return;
      retainedDownload = null;
      complete(retainedSuccessMessage);
    } catch (error) {
      if (destroyed) {
        retained.release();
      } else if (retainedDownload !== retained) {
        return;
      } else {
        if (error instanceof PngDownloadError) retainedDownload = error.retained;
        overlay.showDownloadRetry("下载失败，请再次下载");
        ensureSelectionActive();
      }
    } finally {
      generating = false;
      if (!destroyed) overlay.setGenerationBusy(false);
    }
  };

  const onToggleSelection: EventListener = () => {
    if (destroyed) return;
    if (controller.active) controller.exit("toggle");
    else controller.enter();
  };
  const onExitSelection: EventListener = () => {
    if (!destroyed) controller.exit("hint");
  };
  const onCancelGenerate: EventListener = () => {
    if (destroyed) return;
    if (releaseRetained()) overlay.showStatus("info", "已取消下载");
    overlay.setSelectionActive(controller.active);
  };
  const onConfirmGenerate: EventListener = (event) => {
    const detail = (event as CustomEvent<GenerateDetail>).detail;
    if (detail) void handleGenerate(detail);
  };
  const onRetryDownload: EventListener = () => { void handleRetry(); };
  const onCancelDownload: EventListener = () => { releaseRetained(); };

  const listeners: ReadonlyArray<[string, EventListener]> = [
    ["toggle-selection", onToggleSelection],
    ["exit-selection", onExitSelection],
    ["cancel-generate", onCancelGenerate],
    ["confirm-generate", onConfirmGenerate],
    ["retry-download", onRetryDownload],
    ["cancel-download", onCancelDownload],
  ];
  listeners.forEach(([type, listener]) => overlay.addEventListener(type, listener));
  overlay.setSelectionActive(false);

  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      listeners.forEach(([type, listener]) => overlay.removeEventListener(type, listener));
      releaseRetained();
      controller.destroy();
      overlay.destroy();
    },
  };
}

function productionDependencies(): ContentAppDependencies {
  return {
    document,
    location,
    resolvePlatformAdapter: defaultResolvePlatformAdapter,
    createOverlay: (ownerDocument) => new OverlayRoot(ownerDocument),
    createSelectionController: (dependencies) => new SelectionController(dependencies),
    loadPreferences: defaultLoadPreferences,
    savePreferences: defaultSavePreferences,
    generateAttributes: defaultGenerateAttributes,
    renderCard: defaultRenderCard,
    exportPng: defaultExportPng,
    createFilename: createPngFilename,
  };
}

const pageApps = new WeakMap<Document, Promise<ContentApp | null>>();

export function bootstrapContentApp(
  dependencies: ContentAppDependencies = productionDependencies(),
): Promise<ContentApp | null> {
  const existing = pageApps.get(dependencies.document);
  if (existing) return existing;

  const app = createContentApp(dependencies);
  pageApps.set(dependencies.document, app);
  return app;
}

if (import.meta.env.MODE !== "test") {
  void bootstrapContentApp().catch((error: unknown) => {
    console.error("Failed to bootstrap comment card content app", error);
  });
}
