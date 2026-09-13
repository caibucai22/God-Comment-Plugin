import { generateAttributes as defaultGenerateAttributes } from "../attributes/generator";
import type {
  CardRatio,
  CardAttributes,
  CardPreferences,
  CommentCardSource,
  GenerateOptions,
} from "../domain/types";
import {
  PngDownloadError,
  createExportService,
  createPngFilename,
  exportPng as defaultExportPng,
  type PngArtifact,
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
  setSaveBusy?(busy: boolean): void;
  showGenerated?(previewUrl?: string, dimensions?: string, ratio?: CardRatio): void;
  showFailed?(message: string): void;
  showSaved?(dimensions: string): void;
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
  readonly createPngArtifact?: (canvas: HTMLCanvasElement) => Promise<PngArtifact>;
  readonly downloadPngArtifact?: (artifact: PngArtifact, filename: string) => Promise<void>;
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

  let preferences: CardPreferences;
  try {
    preferences = await dependencies.loadPreferences();
  } catch (error) {
    overlay.destroy();
    throw error;
  }
  overlay.mount();

  let destroyed = false;
  let generating = false;
  let saving = false;
  let retainedDownload: RetainedPngDownload | null = null;
  let retainedSuccessMessage = "卡片已保存";
  let pendingRendered: RenderCardResult | null = null;
  let pendingFilename: string | null = null;
  let pendingArtifact: PngArtifact | null = null;
  let lastGenerateDetail: GenerateDetail | null = null;
  let generationVersion = 0;

  const controller = dependencies.createSelectionController({
    adapter,
    document: dependencies.document,
    onSelect: (selectedSource) => {
      if (!destroyed && !saving) {
        const wasGenerating = generating;
        generationVersion += 1;
        generating = false;
        pendingRendered = null;
        pendingFilename = null;
        releasePendingArtifact();
        releaseRetained();
        if (wasGenerating) overlay.setGenerationBusy(false);
        overlay.showConfirm(selectedSource, preferences);
      }
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

  const releasePendingArtifact = (): void => {
    pendingArtifact?.release();
    pendingArtifact = null;
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
    const operationVersion = ++generationVersion;
    lastGenerateDetail = { source, options };
    releasePendingArtifact();
    pendingRendered = null;
    pendingFilename = null;
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
        includeAttributes: options.includeAttributes ?? false,
        soundEnabled: options.soundEnabled ?? false,
      };

      let rendered: RenderCardResult;
      try {
        await dependencies.savePreferences(exactPreferences);
        if (destroyed || operationVersion !== generationVersion) return;
        preferences = exactPreferences;
        const generatedAttributes = dependencies.generateAttributes(source.content, options.style);
        rendered = await dependencies.renderCard({ source, options: exactPreferences, attributes: generatedAttributes });
        if (destroyed || operationVersion !== generationVersion) return;
      } catch {
        if (!destroyed && operationVersion === generationVersion) {
          if (overlay.showFailed) overlay.showFailed("卡片生成失败，请重新选择或重试");
          else overlay.showStatus("error", "卡片生成失败，请重新选择或重试");
          ensureSelectionActive();
        }
        return;
      }

      pendingRendered = rendered;
      pendingFilename = dependencies.createFilename();
      retainedSuccessMessage = completionMessage(rendered.coverFallbackUsed);
      if (dependencies.createPngArtifact) {
        let artifact: PngArtifact;
        try {
          artifact = await dependencies.createPngArtifact(rendered.canvas);
        } catch {
          if (destroyed || operationVersion !== generationVersion) return;
          pendingRendered = null;
          pendingFilename = null;
          if (overlay.showFailed) overlay.showFailed("卡片生成失败，请返回修改或重试");
          else overlay.showStatus("error", "卡片生成失败，请返回修改或重试");
          ensureSelectionActive();
          return;
        }
        if (destroyed || operationVersion !== generationVersion) {
          artifact.release();
          return;
        }
        pendingArtifact = artifact;
      }
      if (overlay.showGenerated) {
        overlay.showGenerated(
          pendingArtifact?.url,
          `${rendered.canvas.width} × ${rendered.canvas.height}`,
          options.ratio,
        );
      }
      else await handleConfirmSave(true);
    } finally {
      if (operationVersion === generationVersion) {
        generating = false;
        if (!destroyed) overlay.setGenerationBusy(false);
      }
    }
  };

  const handleConfirmSave = async (fromGeneration = false): Promise<void> => {
    if (destroyed || (!fromGeneration && generating) || !pendingRendered || !pendingFilename) return;
    generating = true;
    saving = true;
    const saveVersion = generationVersion;
    const rendered = pendingRendered;
    const filename = pendingFilename;
    overlay.setSaveBusy?.(true);
    controller.exit("toggle");
    try {
      if (pendingArtifact && dependencies.downloadPngArtifact) {
        await dependencies.downloadPngArtifact(pendingArtifact, filename);
      } else {
        await dependencies.exportPng(rendered.canvas, filename);
      }
      if (destroyed || saveVersion !== generationVersion) return;
      pendingRendered = null;
      pendingFilename = null;
      pendingArtifact = null;
      const dimensions = `${rendered.canvas.width} × ${rendered.canvas.height}`;
      if (overlay.showSaved) overlay.showSaved(dimensions);
      else complete(retainedSuccessMessage);
      controller.exit("toggle");
    } catch (error) {
      if (destroyed || saveVersion !== generationVersion) return;
      if (error instanceof PngDownloadError) {
        pendingArtifact = null;
        retainedDownload = error.retained;
        overlay.showDownloadRetry("下载失败，请再次下载");
      } else {
        overlay.showStatus("error", "下载失败，请重新保存");
      }
      ensureSelectionActive();
    } finally {
      if (saveVersion === generationVersion) {
        generating = false;
        saving = false;
        if (!destroyed) overlay.setSaveBusy?.(false);
      }
    }
  };

  const handleRetry = async (): Promise<void> => {
    if (destroyed || generating || !retainedDownload) return;
    generating = true;
    saving = true;
    const retryVersion = generationVersion;
    overlay.setSaveBusy?.(true);
    controller.exit("toggle");
    const retained = retainedDownload;

    try {
      await retained.retry();
      if (destroyed || retryVersion !== generationVersion) return;
      if (retainedDownload !== retained) return;
      retainedDownload = null;
      const rendered = pendingRendered;
      pendingRendered = null;
      pendingFilename = null;
      if (rendered && overlay.showSaved) {
        overlay.showSaved(`${rendered.canvas.width} × ${rendered.canvas.height}`);
        controller.exit("toggle");
      } else {
        complete(retainedSuccessMessage);
      }
    } catch (error) {
      if (destroyed || retryVersion !== generationVersion) {
        retained.release();
      } else if (retainedDownload !== retained) {
        return;
      } else {
        if (error instanceof PngDownloadError) retainedDownload = error.retained;
        overlay.showDownloadRetry("下载失败，请再次下载");
        ensureSelectionActive();
      }
    } finally {
      if (retryVersion === generationVersion) {
        generating = false;
        saving = false;
        if (!destroyed) overlay.setSaveBusy?.(false);
      }
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
    if (destroyed || generating) return;
    pendingRendered = null;
    pendingFilename = null;
    releasePendingArtifact();
    if (releaseRetained()) overlay.showStatus("info", "已取消下载");
    overlay.setSelectionActive(controller.active);
  };
  const onConfirmGenerate: EventListener = (event) => {
    const detail = (event as CustomEvent<GenerateDetail>).detail;
    if (detail) void handleGenerate(detail);
  };
  const onRetryDownload: EventListener = () => { void handleRetry(); };
  const onCancelDownload: EventListener = () => {
    releaseRetained();
    if (saving) {
      generationVersion += 1;
      generating = false;
      saving = false;
      overlay.setSaveBusy?.(false);
      ensureSelectionActive();
    }
  };
  const onCancelGeneration: EventListener = () => {
    if (destroyed) return;
    generationVersion += 1;
    generating = false;
    pendingRendered = null;
    pendingFilename = null;
    releasePendingArtifact();
    overlay.setGenerationBusy(false);
  };
  const onRetryGeneration: EventListener = () => {
    if (!destroyed && !generating && lastGenerateDetail) void handleGenerate(lastGenerateDetail);
  };
  const onConfirmSave: EventListener = () => { void handleConfirmSave(); };
  const onReturnEditing: EventListener = () => {
    pendingRendered = null;
    pendingFilename = null;
    releasePendingArtifact();
  };
  const onCreateAnother: EventListener = () => { ensureSelectionActive(); };

  const listeners: ReadonlyArray<[string, EventListener]> = [
    ["toggle-selection", onToggleSelection],
    ["exit-selection", onExitSelection],
    ["cancel-generate", onCancelGenerate],
    ["confirm-generate", onConfirmGenerate],
    ["retry-download", onRetryDownload],
    ["cancel-download", onCancelDownload],
    ["cancel-generation", onCancelGeneration],
    ["retry-generation", onRetryGeneration],
    ["return-editing", onReturnEditing],
    ["confirm-save", onConfirmSave],
    ["create-another", onCreateAnother],
  ];
  listeners.forEach(([type, listener]) => overlay.addEventListener(type, listener));
  overlay.setSelectionActive(false);

  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      listeners.forEach(([type, listener]) => overlay.removeEventListener(type, listener));
      releaseRetained();
      releasePendingArtifact();
      controller.destroy();
      overlay.destroy();
    },
  };
}

function productionDependencies(): ContentAppDependencies {
  const exportService = createExportService();
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
    createPngArtifact: (canvas) => exportService.createPngArtifact(canvas),
    downloadPngArtifact: (artifact, filename) => exportService.downloadPngArtifact(artifact, filename),
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
