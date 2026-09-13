import type { CommentCardSource } from "../domain/types";
import type { PlatformAdapter, ResolvedCommentTarget } from "../platform/platform-adapter";
import { CommentHighlight } from "./comment-highlight";
import { deepElementFromPoint } from "./deep-element-from-point";

export type SelectionExitReason = "escape" | "contextmenu" | "outside" | "hint" | "toggle" | "panel-close";

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
  resolveElementFromPoint?: (document: Document, clientX: number, clientY: number) => Element | null;
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
  private rootRefreshFrame: number | null = null;
  private pointerReconcileFrame: number | null = null;
  private lastPointerPosition: { clientX: number; clientY: number } | null = null;
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
    document.addEventListener("pointermove", this.handlePointerMove, true);
    document.addEventListener("pointerout", this.handlePointerOut, true);
    document.addEventListener("click", this.handleClick, true);
    document.addEventListener("contextmenu", this.handleContextMenu, true);
    document.addEventListener("keydown", this.handleKeyDown, true);
    document.addEventListener("scroll", this.handleViewportChange, true);
    document.defaultView?.addEventListener("resize", this.handleViewportChange);
  }

  private removeListeners(): void {
    const { document } = this.dependencies;
    document.removeEventListener("pointerover", this.handlePointerOver, true);
    document.removeEventListener("pointermove", this.handlePointerMove, true);
    document.removeEventListener("pointerout", this.handlePointerOut, true);
    document.removeEventListener("click", this.handleClick, true);
    document.removeEventListener("contextmenu", this.handleContextMenu, true);
    document.removeEventListener("keydown", this.handleKeyDown, true);
    document.removeEventListener("scroll", this.handleViewportChange, true);
    document.defaultView?.removeEventListener("resize", this.handleViewportChange);
  }

  private readonly handlePointerOver = (event: PointerEvent): void => {
    if (!this.isActive || this.isOverlayEvent(event)) return;
    const target = this.resolveTargetFromEvent(event);
    if (target) this.setHoverTarget(target);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.isActive) return;
    if (this.isOverlayEvent(event)) {
      this.clearHover();
      return;
    }

    this.lastPointerPosition = { clientX: event.clientX, clientY: event.clientY };
    this.schedulePointerReconciliation();
  };

  private readonly handlePointerOut = (event: PointerEvent): void => {
    if (!this.isActive || this.isOverlayEvent(event)) return;

    const leaving = this.resolveTargetFromEvent(event)?.host ?? null;
    const entering = this.dependencies.adapter.resolveCommentTarget(event.relatedTarget)?.host ?? null;
    if (!leaving || leaving !== this.hoveredElement || entering === leaving) return;

    const enteringOverlay = event.relatedTarget instanceof Element
      && event.relatedTarget.closest("[data-ccg-overlay-root]") !== null;
    if (enteringOverlay || event.relatedTarget === null) this.clearHover();
  };

  private readonly handleClick = (event: MouseEvent): void => {
    if (!this.isActive || this.isOverlayEvent(event)) return;

    const target = this.resolveTargetFromEvent(event)
      ?? this.resolveTargetAt(event.clientX, event.clientY);
    if (!target) {
      this.exit("outside");
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const source = this.dependencies.adapter.extractComment(target.host);
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

  private readonly handleViewportChange = (): void => {
    if (this.isActive && this.lastPointerPosition) this.schedulePointerReconciliation();
  };

  private isOverlayEvent(event: Event): boolean {
    return event.composedPath().some(
      (target) => target instanceof Element && target.hasAttribute("data-ccg-overlay-root"),
    );
  }

  private resolveTargetFromEvent(event: Event): ResolvedCommentTarget | null {
    for (const target of event.composedPath()) {
      const comment = this.dependencies.adapter.resolveCommentTarget(target);
      if (comment) return comment;
    }

    return this.dependencies.adapter.resolveCommentTarget(event.target);
  }

  private resolveTargetAt(clientX: number, clientY: number): ResolvedCommentTarget | null {
    const element = this.dependencies.resolveElementFromPoint
      ? this.dependencies.resolveElementFromPoint(this.dependencies.document, clientX, clientY)
      : deepElementFromPoint(this.dependencies.document, clientX, clientY);
    return this.dependencies.adapter.resolveCommentTarget(element);
  }

  private schedulePointerReconciliation(): void {
    if (this.pointerReconcileFrame !== null || !this.lastPointerPosition) return;

    this.pointerReconcileFrame = requestAnimationFrame(() => {
      this.pointerReconcileFrame = null;
      if (!this.isActive || !this.lastPointerPosition) return;
      const { clientX, clientY } = this.lastPointerPosition;
      this.setHoverTarget(this.resolveTargetAt(clientX, clientY));
    });
  }

  private setHoverTarget(target: ResolvedCommentTarget | null): void {
    const comment = target?.host ?? null;
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
    this.commentHighlight.show(target?.anchor ?? this.dependencies.adapter.getCommentHighlightAnchor(comment));
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
    if (!this.isActive || this.rootRefreshFrame !== null) return;

    this.rootRefreshFrame = requestAnimationFrame(() => {
      this.rootRefreshFrame = null;
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
    if (this.rootRefreshFrame !== null) {
      cancelAnimationFrame(this.rootRefreshFrame);
      this.rootRefreshFrame = null;
    }
    if (this.pointerReconcileFrame !== null) {
      cancelAnimationFrame(this.pointerReconcileFrame);
      this.pointerReconcileFrame = null;
    }
    this.lastPointerPosition = null;
  }

  private emitState(reason?: SelectionExitReason): void {
    this.dependencies.onStateChange({
      active: this.isActive,
      hoveredElement: this.hoveredElement,
      ...(reason ? { reason } : {}),
    });
  }
}
