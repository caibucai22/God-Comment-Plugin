import type { CardPreferences, CommentCardSource, GenerateOptions } from "../domain/types";
import { createConfirmCard } from "./confirm-card";
import overlayCss from "./overlay.css?inline";

type StatusKind = "success" | "error" | "info";

interface Status {
  kind: StatusKind;
  message: string;
}

/** Isolated, document-owned host for all content-script UI. */
export class OverlayRoot extends EventTarget {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private active = false;
  private confirmation: { source: CommentCardSource; preferences: CardPreferences } | null = null;
  private status: Status | null = null;
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
    this.confirmation = { source, preferences };
    this.render();
  }

  showStatus(kind: StatusKind, message: string): void {
    if (this.destroyed) return;
    this.status = { kind, message };
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
  }

  private render(): void {
    if (!this.root || this.destroyed) return;

    this.root.innerHTML = `<style>${overlayCss}</style><div class="ccg-ui">
      <button type="button" class="ccg-entry" aria-label="开启评论选择"><span>✦</span><span>流光卡片核</span></button>
      ${this.active ? `<div class="ccg-selection-prompt"><span>请选择一条评论</span><button type="button" aria-label="退出评论选择">退出</button></div>` : ""}
      <div class="ccg-panel-slot"></div>
      ${this.status ? `<div class="ccg-status ccg-status--${this.status.kind}" role="status"><span></span><button type="button" aria-label="关闭提示">×</button></div>` : ""}
    </div>`;

    (this.root.querySelector('[aria-label="开启评论选择"]') as HTMLButtonElement).addEventListener("click", () => {
      this.emit("toggle-selection");
    });
    this.root.querySelector('[aria-label="退出评论选择"]')?.addEventListener("click", () => this.emit("exit-selection"));
    const statusMessage = this.root.querySelector(".ccg-status span");
    if (statusMessage && this.status) statusMessage.textContent = this.status.message;
    this.root.querySelector('[aria-label="关闭提示"]')?.addEventListener("click", () => {
      this.status = null;
      this.render();
    });

    if (!this.confirmation) return;
    const card = createConfirmCard(this.document, this.confirmation.source, this.confirmation.preferences, {
      onCancel: () => {
        this.confirmation = null;
        this.render();
        this.emit("cancel-generate");
      },
      onGenerate: (options) => this.emit("confirm-generate", { source: this.confirmation!.source, options }),
    });
    this.root.querySelector(".ccg-panel-slot")!.append(card);
  }

  private emit(type: "toggle-selection" | "exit-selection" | "cancel-generate"): void;
  private emit(type: "confirm-generate", detail: { source: CommentCardSource; options: GenerateOptions }): void;
  private emit(
    type: "toggle-selection" | "exit-selection" | "cancel-generate" | "confirm-generate",
    detail?: { source: CommentCardSource; options: GenerateOptions },
  ): void {
    if (!this.destroyed) this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
