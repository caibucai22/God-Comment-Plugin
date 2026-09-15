import type { CardPreferences, CardRatio, CommentCardSource, GenerateOptions } from "../domain/types";
import {
  DEFAULT_FLOATING_ENTRY_PLACEMENT,
  clampFloatingEntryPlacement,
  loadFloatingEntryPlacement,
  saveFloatingEntryPlacement,
  snapFloatingEntryPlacement,
  type FloatingEntryPlacement,
} from "../storage/floating-entry-placement";
import { createExtensionPanel } from "./extension-panel";
import type { PanelState } from "./panel-state";
import overlayCss from "./overlay.css?inline";

const floatingMascotAsset = new URL("../assets/pixel-panel/generated/mascot-master.png", import.meta.url).href;

type StatusKind = "success" | "error" | "info";

interface Status {
  kind: StatusKind;
  message: string;
  action?: "retry-download";
}

/** Isolated, document-owned host for all content-script UI. */
export class OverlayRoot extends EventTarget {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private active = false;
  private confirmation: { source: CommentCardSource; preferences: CardPreferences; originalContent: string } | null = null;
  private status: Status | null = null;
  private generationBusy = false;
  private saveBusy = false;
  private panelState: PanelState = "editing";
  private failureMessage: string | undefined;
  private previewUrl: string | undefined;
  private previewDimensions: string | undefined;
  private previewRatio: CardRatio | undefined;
  private savedDimensions: string | undefined;
  private destroyed = false;
  private floatingPlacement: FloatingEntryPlacement = { ...DEFAULT_FLOATING_ENTRY_PLACEMENT };
  private drag: { pointerId: number; startX: number; startY: number; moved: boolean } | null = null;
  private suppressEntryClick = false;
  private floatingPlacementRevision = 0;
  private readonly handleResize = (): void => this.applyFloatingPlacement();

  constructor(private readonly document: Document) {
    super();
  }

  get shadowRoot(): ShadowRoot | null {
    return this.root;
  }

  mount(): void {
    if (this.destroyed || this.host) return;

    this.host = this.document.createElement("div");
    this.host.dataset.ccgOverlayRoot = "";
    this.root = this.host.attachShadow({ mode: "open" });
    this.document.body.append(this.host);
    this.document.defaultView?.addEventListener("resize", this.handleResize);
    this.render();
    const placementRevision = this.floatingPlacementRevision;
    void loadFloatingEntryPlacement().then((placement) => {
      if (this.destroyed || placementRevision !== this.floatingPlacementRevision) return;
      this.floatingPlacement = placement;
      this.applyFloatingPlacement();
    });
  }

  setSelectionActive(active: boolean): void {
    if (this.destroyed) return;
    this.active = active;
    this.render();
  }

  showConfirm(source: CommentCardSource, preferences: CardPreferences): void {
    if (this.destroyed) return;
    this.confirmation = { source, preferences, originalContent: source.content };
    this.panelState = "editing";
    this.previewUrl = undefined;
    this.previewDimensions = undefined;
    this.previewRatio = undefined;
    this.drag = null;
    this.savedDimensions = undefined;
    this.failureMessage = undefined;
    this.status = null;
    this.render();
  }

  showGenerated(previewUrl?: string, dimensions?: string, ratio?: CardRatio): void {
    if (this.destroyed || !this.confirmation) return;
    this.panelState = "generated";
    this.previewUrl = previewUrl;
    this.previewDimensions = dimensions;
    this.previewRatio = ratio;
    this.failureMessage = undefined;
    this.status = null;
    this.render();
  }

  showFailed(message: string): void {
    if (this.destroyed || !this.confirmation) return;
    this.panelState = "failed";
    this.failureMessage = message;
    this.status = null;
    this.render();
  }

  showSaved(dimensions: string): void {
    if (this.destroyed || !this.confirmation) return;
    this.panelState = "saved";
    this.previewUrl = undefined;
    this.previewDimensions = undefined;
    this.previewRatio = undefined;
    this.savedDimensions = dimensions;
    this.failureMessage = undefined;
    this.status = null;
    this.render();
  }

  showStatus(kind: StatusKind, message: string): void {
    if (this.destroyed) return;
    this.status = { kind, message };
    this.render();
  }

  showDownloadRetry(message: string): void {
    if (this.destroyed) return;
    this.status = { kind: "error", message, action: "retry-download" };
    this.render();
  }

  setGenerationBusy(busy: boolean): void {
    if (this.destroyed || this.generationBusy === busy) return;
    this.generationBusy = busy;
    if (busy && this.confirmation) this.panelState = "generating";
    else if (!busy && this.panelState === "generating") this.panelState = "editing";
    this.render();
  }

  setSaveBusy(busy: boolean): void {
    if (this.destroyed || this.saveBusy === busy) return;
    this.saveBusy = busy;
    this.render();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.document.defaultView?.removeEventListener("resize", this.handleResize);
    this.host?.remove();
    this.host = null;
    this.root = null;
    this.confirmation = null;
    this.status = null;
    this.generationBusy = false;
    this.saveBusy = false;
    this.savedDimensions = undefined;
    this.failureMessage = undefined;
    this.previewDimensions = undefined;
    this.previewRatio = undefined;
  }

  private render(): void {
    if (!this.root || this.destroyed) return;

    this.root.innerHTML = `<style>${overlayCss}</style><div class="ccg-ui">
      ${this.confirmation ? "" : `<button type="button" class="ccg-entry" aria-label="开启评论选择"><span class="ccg-entry__mascot"><img src="${floatingMascotAsset}" alt="" data-pixel-asset="floating-mascot"></span><span class="ccg-entry__mini-card">有神评</span></button>`}
      ${this.active && !this.confirmation ? `<div class="ccg-selection-prompt"><span>请选择一条评论</span><button type="button" aria-label="退出评论选择">退出</button></div>` : ""}
      <div class="ccg-panel-slot"></div>
      ${this.status ? `<div class="ccg-status ccg-status--${this.status.kind}" role="status"><span></span>${this.status.action === "retry-download" ? `<button type="button" aria-label="再次下载">再次下载</button>` : ""}<button type="button" aria-label="关闭提示">×</button></div>` : ""}
    </div>`;

    const entry = this.root.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement | null;
    if (entry) this.bindFloatingEntry(entry);
    this.root.querySelector('[aria-label="退出评论选择"]')?.addEventListener("click", () => this.emit("exit-selection"));
    const statusMessage = this.root.querySelector(".ccg-status span");
    if (statusMessage && this.status) statusMessage.textContent = this.status.message;
    this.root.querySelector('[aria-label="再次下载"]')?.addEventListener("click", () => this.emit("retry-download"));
    this.root.querySelector('[aria-label="关闭提示"]')?.addEventListener("click", () => {
      const cancelledDownload = this.status?.action === "retry-download";
      this.status = null;
      this.render();
      if (cancelledDownload) this.emit("cancel-download");
    });

    if (!this.confirmation) return;
    const confirmation = this.confirmation;
    const shell = createExtensionPanel(
      this.document,
      {
        state: this.panelState,
        source: confirmation.source,
        preferences: confirmation.preferences,
        draftContent: confirmation.source.content,
        errorMessage: this.failureMessage,
        previewUrl: this.previewUrl,
        previewInfo: this.panelState === "generated" && this.previewDimensions
          ? {
              ratio: this.previewRatio ?? confirmation.preferences.ratio,
              dimensions: this.previewDimensions,
            }
          : undefined,
        saveInfo: this.panelState === "saved"
          ? { format: "PNG", dimensions: this.savedDimensions ?? "1200 × 1600", location: "本地下载" }
          : undefined,
      },
      {
        onClose: () => {
          if (this.destroyed || this.generationBusy || this.saveBusy) return;
          this.confirmation = null;
          this.render();
          this.emit("cancel-generate");
        },
        onDraftChange: (content) => {
          if (!this.confirmation || this.destroyed) return;
          this.confirmation.source = { ...this.confirmation.source, content };
        },
        onRestoreOriginal: () => {
          if (!this.confirmation || this.destroyed) return;
          this.confirmation.source = {
            ...this.confirmation.source,
            content: this.confirmation.originalContent,
          };
          this.render();
        },
        onPanelSkinChange: (panelSkin) => {
          if (!this.confirmation || this.destroyed) return;
          this.confirmation.preferences = { ...this.confirmation.preferences, panelSkin };
          const panel = this.root?.querySelector(".ccg-extension-panel");
          if (panel instanceof HTMLElement) {
            panel.dataset.panelSkin = panelSkin;
            panel.classList.toggle("ccg-extension-panel--classic-dark", panelSkin === "classic-dark");
          }
        },
        onGenerate: (source, options) => {
          if (this.destroyed || !this.confirmation || this.generationBusy) return;
          const preferences = { ...this.confirmation.preferences, ...options };
          this.confirmation = { ...this.confirmation, source, preferences };
          this.emit("confirm-generate", { source, options: preferences });
        },
        onCancelGeneration: () => this.emit("cancel-generation"),
        onRetryGeneration: () => this.emit("retry-generation"),
        onReturnEditing: () => {
          if (this.destroyed || !this.confirmation || this.saveBusy) return;
          this.panelState = "editing";
          this.savedDimensions = undefined;
          this.render();
          this.emit("return-editing");
        },
        onConfirmSave: () => this.emit("confirm-save"),
        onCreateAnother: () => {
          if (this.destroyed) return;
          this.confirmation = null;
          this.panelState = "editing";
          this.savedDimensions = undefined;
          this.render();
          this.emit("create-another");
        },
      },
    );
    this.root.querySelector(".ccg-panel-slot")!.append(shell);
    const generate = shell.querySelector('[aria-label="制作卡片"]') as HTMLButtonElement | null;
    if (generate) generate.disabled = this.generationBusy;
    const save = shell.querySelector('[aria-label="确认保存"]') as HTMLButtonElement | null;
    if (save) save.disabled = this.saveBusy;
    const returnEditing = shell.querySelector('[aria-label="返回修改"]') as HTMLButtonElement | null;
    if (returnEditing) returnEditing.disabled = this.saveBusy;
    (shell.querySelector('[aria-label="关闭制作面板"]') as HTMLButtonElement).disabled = this.generationBusy || this.saveBusy;
  }

  private bindFloatingEntry(entry: HTMLButtonElement): void {
    this.applyFloatingPlacement(entry);
    entry.addEventListener("click", () => {
      if (this.destroyed) return;
      if (this.suppressEntryClick) {
        this.suppressEntryClick = false;
        return;
      }
      this.emit("toggle-selection");
    });
    entry.addEventListener("pointerdown", (event) => {
      if (this.destroyed) return;
      this.drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
      entry.setPointerCapture?.(event.pointerId);
    });
    entry.addEventListener("pointermove", (event) => {
      if (this.destroyed || !this.drag || event.pointerId !== this.drag.pointerId) return;
      const distance = Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY);
      if (distance < 6) return;
      this.drag.moved = true;
      this.floatingPlacementRevision += 1;
      const view = this.document.defaultView;
      if (!view) return;
      this.floatingPlacement = snapFloatingEntryPlacement(
        event.clientX,
        event.clientY,
        view.innerWidth,
        view.innerHeight,
      );
      this.applyFloatingPlacement(entry);
    });
    entry.addEventListener("pointerup", (event) => {
      if (this.destroyed || !this.drag || event.pointerId !== this.drag.pointerId) return;
      entry.releasePointerCapture?.(event.pointerId);
      if (this.drag.moved) {
        this.suppressEntryClick = true;
        void saveFloatingEntryPlacement(this.floatingPlacement);
      }
      this.drag = null;
    });
    entry.addEventListener("pointercancel", (event) => {
      if (this.destroyed || !this.drag || event.pointerId !== this.drag.pointerId) return;
      entry.releasePointerCapture?.(event.pointerId);
      this.drag = null;
      this.applyFloatingPlacement(entry);
    });
  }

  private applyFloatingPlacement(entry?: HTMLButtonElement): void {
    const target = entry ?? this.root?.querySelector<HTMLButtonElement>('[aria-label="开启评论选择"]');
    const view = this.document.defaultView;
    if (!target || !view) return;
    const rendered = clampFloatingEntryPlacement(
      this.floatingPlacement,
      view.innerHeight,
      target.offsetHeight || 64,
    );
    target.style.top = `${rendered.top}px`;
    target.style.left = rendered.side === "left" ? "16px" : "auto";
    target.style.right = rendered.side === "right" ? "16px" : "auto";
    target.dataset.side = rendered.side;
  }

  private emit(
    type: "toggle-selection" | "exit-selection" | "cancel-generate" | "retry-download" | "cancel-download" | "cancel-generation" | "retry-generation" | "return-editing" | "confirm-save" | "create-another",
  ): void;
  private emit(type: "confirm-generate", detail: { source: CommentCardSource; options: GenerateOptions }): void;
  private emit(
    type: "toggle-selection" | "exit-selection" | "cancel-generate" | "confirm-generate" | "retry-download" | "cancel-download" | "cancel-generation" | "retry-generation" | "return-editing" | "confirm-save" | "create-another",
    detail?: { source: CommentCardSource; options: GenerateOptions },
  ): void {
    if (!this.destroyed) this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
