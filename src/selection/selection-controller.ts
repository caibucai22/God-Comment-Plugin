import type { CommentCardSource } from "../domain/types";
import type { PlatformAdapter } from "../platform/platform-adapter";

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

export class SelectionController {
  private hoveredElement: Element | null = null;
  private observer: MutationObserver | null = null;
  private observedParent: Node | null = null;
  private root: Element | null = null;
  private animationFrame: number | null = null;
  private destroyed = false;
  private isActive = false;

  constructor(private readonly dependencies: SelectionControllerDependencies) {}

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
    if (!this.isActive) return;
    this.setHover(this.dependencies.adapter.resolveComment(event.target));
  };

  private readonly handlePointerOut = (event: PointerEvent): void => {
    if (!this.isActive) return;

    const leaving = this.dependencies.adapter.resolveComment(event.target);
    const entering = this.dependencies.adapter.resolveComment(event.relatedTarget);
    if (leaving && leaving === this.hoveredElement && entering !== leaving) this.clearHover();
  };

  private readonly handleClick = (event: MouseEvent): void => {
    if (!this.isActive) return;

    const comment = this.dependencies.adapter.resolveComment(event.target);
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
    if (!this.isActive) return;

    event.preventDefault();
    event.stopPropagation();
    this.exit("contextmenu");
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.isActive && event.key === "Escape") this.exit("escape");
  };

  private setHover(comment: Element | null): void {
    if (comment === this.hoveredElement) return;

    this.clearHover();
    if (!comment) return;

    this.hoveredElement = comment;
    comment.classList.add(HOVER_CLASS);
    this.emitState();
  }

  private clearHover(): void {
    if (!this.hoveredElement) return;

    this.hoveredElement.classList.remove(HOVER_CLASS);
    this.hoveredElement = null;
    if (this.isActive) this.emitState();
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
    if (this.root?.isConnected && nextRoot === this.root) return;

    this.clearHover();
    this.observer?.disconnect();
    this.observer = null;
    this.root = nextRoot;
    this.observeParent(nextRoot?.parentNode ?? this.observedParent);
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
