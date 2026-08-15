import type { CommentCardSource } from "../domain/types";
import type { PlatformAdapter } from "../platform/platform-adapter";
import { CommentHighlight } from "./comment-highlight";

export type SelectionExitReason = "escape" | "contextmenu" | "outside" | "hint" | "toggle";

export interface SelectionState {
  active: boolean;
  hoveredElement: Element | null;
  reason?: SelectionExitReason;
}

export interface SelectionControllerDependencies {
  adapter: PlatformAdapter;
  document: Document;
  onSelect: (source: CommentCardSource) => void;
  onStateChange: (state: SelectionState) => void;
}

const HOVER_CLASS = "ccg-comment-hover";

interface InlineHoverStyle {
  readonly outline: string;
  readonly outlinePriority: string;
  readonly outlineOffset: string;
  readonly outlineOffsetPriority: string;
  readonly borderRadius: string;
  readonly borderRadiusPriority: string;
  readonly boxShadow: string;
  readonly boxShadowPriority: string;
}

export class SelectionController {
  private hoveredElement: Element | null = null;
  private observer: MutationObserver | null = null;
  private observedParent: Node | null = null;
  private root: Element | null = null;
  private animationFrame: number | null = null;
  private readonly commentHighlight: CommentHighlight;
  private inlineHoverStyle: InlineHoverStyle | null = null;
  private destroyed = false;
  private isActive = false;

  constructor(private readonly dependencies: SelectionControllerDependencies) {
    this.commentHighlight = new CommentHighlight(dependencies.document);
  }

  get active(): boolean {
    return this.isActive;
  }

  enter(): void {
    if (this.destroyed || this.isActive) return;

    this.isActive = true;
    this.addListeners();
    this.root = this.dependencies.adapter.findCommentRoot();
    this.observeCurrentRootParent();
    this.emitState();
  }

  exit(reason: SelectionExitReason): void {
    if (this.destroyed || !this.isActive) return;

    this.isActive = false;
    this.clearHover();
    this.removeListeners();
    this.stopObserving();
    this.commentHighlight.destroy();
    this.emitState(reason);
  }

  destroy(): void {
    if (this.destroyed) return;

    if (this.isActive) this.exit("toggle");
    this.destroyed = true;
    this.clearHover();
    this.removeListeners();
    this.stopObserving();
  }

  private addListeners(): void {
    const { document } = this.dependencies;
    document.addEventListener("pointerover", this.handlePointerOver, true);
    document.addEventListener("pointerout", this.handlePointerOut, true);
    document.addEventListener("click", this.handleClick, true);
    document.addEventListener("contextmenu", this.handleContextMenu, true);
    document.addEventListener("keydown", this.handleKeyDown, true);
  }

  private removeListeners(): void {
    const { document } = this.dependencies;
    document.removeEventListener("pointerover", this.handlePointerOver, true);
    document.removeEventListener("pointerout", this.handlePointerOut, true);
    document.removeEventListener("click", this.handleClick, true);
    document.removeEventListener("contextmenu", this.handleContextMenu, true);
    document.removeEventListener("keydown", this.handleKeyDown, true);
  }

  private readonly handlePointerOver = (event: PointerEvent): void => {
    if (!this.isActive || this.isOverlayEvent(event)) return;
    this.setHover(this.resolveCommentFromEvent(event));
  };

  private readonly handlePointerOut = (event: PointerEvent): void => {
    if (!this.isActive || this.isOverlayEvent(event)) return;

    const leaving = this.resolveCommentFromEvent(event);
    const entering = this.dependencies.adapter.resolveComment(event.relatedTarget);
    if (!leaving || leaving !== this.hoveredElement || entering === leaving) return;

    const enteringOverlay = event.relatedTarget instanceof Element
      && event.relatedTarget.closest("[data-ccg-overlay-root]") !== null;
    if (enteringOverlay || event.relatedTarget === null) this.clearHover();
  };

  private readonly handleClick = (event: MouseEvent): void => {
    if (!this.isActive || this.isOverlayEvent(event)) return;

    const comment = this.resolveCommentFromEvent(event);
    if (!comment) {
      this.exit("outside");
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const source = this.dependencies.adapter.extractComment(comment);
    if (source) this.dependencies.onSelect(source);
    this.clearHover();
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    if (!this.isActive || this.isOverlayEvent(event)) return;

    event.preventDefault();
    event.stopPropagation();
    this.exit("contextmenu");
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.isActive && event.key === "Escape") this.exit("escape");
  };

  private isOverlayEvent(event: Event): boolean {
    return event.composedPath().some(
      (target) => target instanceof Element && target.hasAttribute("data-ccg-overlay-root"),
    );
  }

  private resolveCommentFromEvent(event: Event): Element | null {
    for (const target of event.composedPath()) {
      const comment = this.dependencies.adapter.resolveComment(target);
      if (comment) return comment;
    }

    return this.dependencies.adapter.resolveComment(event.target);
  }

  private setHover(comment: Element | null): void {
    if (comment === this.hoveredElement) return;

    if (!comment) {
      this.clearHover();
      return;
    }
    this.clearHover(true, false);

    this.hoveredElement = comment;
    const style = comment instanceof HTMLElement ? comment.style : null;
    this.inlineHoverStyle = style ? {
      outline: style.getPropertyValue("outline"),
      outlinePriority: style.getPropertyPriority("outline"),
      outlineOffset: style.getPropertyValue("outline-offset"),
      outlineOffsetPriority: style.getPropertyPriority("outline-offset"),
      borderRadius: style.getPropertyValue("border-radius"),
      borderRadiusPriority: style.getPropertyPriority("border-radius"),
      boxShadow: style.getPropertyValue("box-shadow"),
      boxShadowPriority: style.getPropertyPriority("box-shadow"),
    } : null;
    comment.classList.add(HOVER_CLASS);
    this.commentHighlight.show(this.dependencies.adapter.getCommentHighlightAnchor(comment));
    style?.setProperty("outline", "2px solid #76e9ff", "important");
    style?.setProperty("outline-offset", "2px", "important");
    style?.setProperty("border-radius", "8px", "important");
    style?.setProperty("box-shadow", "0 0 0 4px rgb(118 233 255 / 20%)", "important");
    this.emitState();
  }

  private clearHover(preserveHighlight = false, emitState = true): void {
    if (!this.hoveredElement) return;

    const { hoveredElement, inlineHoverStyle } = this;
    if (!preserveHighlight) this.commentHighlight.hide();
    hoveredElement.classList.remove(HOVER_CLASS);
    if (inlineHoverStyle && hoveredElement instanceof HTMLElement) {
      hoveredElement.style.setProperty("outline", inlineHoverStyle.outline, inlineHoverStyle.outlinePriority);
      hoveredElement.style.setProperty("outline-offset", inlineHoverStyle.outlineOffset, inlineHoverStyle.outlineOffsetPriority);
      hoveredElement.style.setProperty("border-radius", inlineHoverStyle.borderRadius, inlineHoverStyle.borderRadiusPriority);
      hoveredElement.style.setProperty("box-shadow", inlineHoverStyle.boxShadow, inlineHoverStyle.boxShadowPriority);
    }
    this.hoveredElement = null;
    this.inlineHoverStyle = null;
    if (this.isActive && emitState) this.emitState();
  }

  private observeCurrentRootParent(): void {
    const parent = this.root?.parentNode ?? null;
    if (!parent) return;

    this.observer = new MutationObserver(this.handleRootMutation);
    this.observer.observe(parent, { childList: true });
    this.observedParent = parent;
  }

  private readonly handleRootMutation = (): void => {
    if (!this.isActive || this.animationFrame !== null) return;

    this.animationFrame = requestAnimationFrame(() => {
      this.animationFrame = null;
      this.refreshRoot();
    });
  };

  private refreshRoot(): void {
    if (!this.isActive) return;

    const nextRoot = this.dependencies.adapter.findCommentRoot();
    const nextParent = nextRoot?.parentNode ?? this.observedParent;
    if (this.root?.isConnected && nextRoot === this.root && nextParent === this.observedParent) return;

    this.clearHover();
    this.observer?.disconnect();
    this.observer = null;
    this.root = nextRoot;
    this.observeParent(nextParent);
    this.emitState();
  }

  private observeParent(parent: Node | null): void {
    if (!parent) return;

    this.observer = new MutationObserver(this.handleRootMutation);
    this.observer.observe(parent, { childList: true });
    this.observedParent = parent;
  }

  private stopObserving(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.observedParent = null;
    this.root = null;
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  private emitState(reason?: SelectionExitReason): void {
    this.dependencies.onStateChange({
      active: this.isActive,
      hoveredElement: this.hoveredElement,
      ...(reason ? { reason } : {}),
    });
  }
}
