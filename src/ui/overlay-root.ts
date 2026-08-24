import type { CardPreferences, CommentCardSource, GenerateOptions } from "../domain/types";
import { createExtensionPanel } from "./extension-panel";
import type { PanelState } from "./panel-state";
import overlayCss from "./overlay.css?inline";

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
  private panelState: PanelState = "editing";
  private previewUrl: string | undefined;
  private destroyed = false;

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
    this.render();
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
    this.render();
  }

  showGenerated(previewUrl?: string): void {
    if (this.destroyed || !this.confirmation) return;
    this.panelState = "generated";
    this.previewUrl = previewUrl;
    this.render();
  }

  showFailed(message: string): void {
    if (this.destroyed || !this.confirmation) return;
    this.panelState = "failed";
    this.status = { kind: "error", message };
    this.render();
  }

  showSaved(dimensions: string): void {
    if (this.destroyed || !this.confirmation) return;
    this.panelState = "saved";
    this.previewUrl = undefined;
    this.status = null;
    this.confirmation.preferences = { ...this.confirmation.preferences };
    this.render();
    const panel = this.root?.querySelector(".ccg-extension-panel");
    panel?.setAttribute("data-saved-dimensions", dimensions);
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
    this.render();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.host?.remove();
    this.host = null;
    this.root = null;
    this.confirmation = null;
    this.status = null;
    this.generationBusy = false;
  }

  private render(): void {
    if (!this.root || this.destroyed) return;

    this.root.innerHTML = `<style>${overlayCss}</style><div class="ccg-ui">
      <button type="button" class="ccg-entry" aria-label="开启评论选择"><span>✦</span><span>流光卡片核</span></button>
      ${this.active ? `<div class="ccg-selection-prompt"><span>请选择一条评论</span><button type="button" aria-label="退出评论选择">退出</button></div>` : ""}
      <div class="ccg-panel-slot"></div>
      ${this.status ? `<div class="ccg-status ccg-status--${this.status.kind}" role="status"><span></span>${this.status.action === "retry-download" ? `<button type="button" aria-label="再次下载">再次下载</button>` : ""}<button type="button" aria-label="关闭提示">×</button></div>` : ""}
    </div>`;

    (this.root.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement).addEventListener("click", () => {
      this.emit("toggle-selection");
    });
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
        previewUrl: this.previewUrl,
      },
      {
        onClose: () => {
          if (this.destroyed || this.generationBusy) return;
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
        },
        onGenerate: (source, options) => {
          if (this.destroyed || !this.confirmation || this.generationBusy) return;
          this.emit("confirm-generate", { source, options });
        },
        onCancelGeneration: () => this.emit("cancel-generation"),
        onRetryGeneration: () => this.emit("retry-generation"),
        onReturnEditing: () => {
          if (this.destroyed || !this.confirmation) return;
          this.panelState = "editing";
          this.render();
          this.emit("return-editing");
        },
        onConfirmSave: () => this.emit("confirm-save"),
        onCreateAnother: () => {
          if (this.destroyed) return;
          this.confirmation = null;
          this.panelState = "editing";
          this.render();
          this.emit("create-another");
        },
      },
    );
    this.root.querySelector(".ccg-panel-slot")!.append(shell);
    const generate = shell.querySelector('[aria-label="制作卡片"]') as HTMLButtonElement | null;
    if (generate) generate.disabled = this.generationBusy;
    (shell.querySelector('[aria-label="关闭制作面板"]') as HTMLButtonElement).disabled = this.generationBusy;
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
