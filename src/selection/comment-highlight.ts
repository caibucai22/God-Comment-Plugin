import highlightCss from "./comment-highlight.css?inline";

const HIGHLIGHT_SELECTOR = "[data-ccg-comment-highlight]";
const HIGHLIGHT_STYLE_SELECTOR = "style[data-ccg-comment-highlight-style]";

export class CommentHighlight {
  private anchor: Element | null = null;
  private layer: HTMLDivElement | null = null;
  private listening = false;
  private lastRect: DOMRect | null = null;

  constructor(private readonly document: Document) {}

  show(anchor: Element): void {
    this.anchor = anchor;
    this.ensureStyle();
    this.ensureLayer();
    this.startListening();
    this.reposition();
  }

  hide(): void {
    this.stopListening();
    this.layer?.remove();
    this.layer = null;
    this.anchor = null;
    this.lastRect = null;
  }

  destroy(): void {
    this.hide();
  }

  private ensureStyle(): void {
    if (this.document.querySelector(HIGHLIGHT_STYLE_SELECTOR)) return;

    const style = this.document.createElement("style");
    style.dataset.ccgCommentHighlightStyle = "";
    style.textContent = highlightCss;
    (this.document.head ?? this.document.documentElement).append(style);
  }

  private ensureLayer(): void {
    if (this.layer) return;

    this.layer = this.document.createElement("div");
    this.layer.dataset.ccgCommentHighlight = "";
    this.layer.setAttribute("aria-hidden", "true");
    this.document.body.append(this.layer);
  }

  private startListening(): void {
    if (this.listening) return;

    this.listening = true;
    this.document.addEventListener("scroll", this.reposition, true);
    this.document.defaultView?.addEventListener("resize", this.reposition);
  }

  private stopListening(): void {
    if (!this.listening) return;

    this.listening = false;
    this.document.removeEventListener("scroll", this.reposition, true);
    this.document.defaultView?.removeEventListener("resize", this.reposition);
  }

  private readonly reposition = (): void => {
    if (!this.layer || !this.anchor?.isConnected) {
      this.hide();
      return;
    }

    const rect = this.anchor.getBoundingClientRect();
    const { left, top, width, height } = rect;
    if (width <= 0 || height <= 0) {
      this.layer.hidden = true;
      return;
    }

    this.layer.hidden = false;
    const previous = this.lastRect;
    const distance = previous
      ? Math.hypot(
          left + width / 2 - (previous.left + previous.width / 2),
          top + height / 2 - (previous.top + previous.height / 2),
        )
      : Number.POSITIVE_INFINITY;
    this.layer.toggleAttribute("data-ccg-smooth", distance <= 240);
    this.layer.style.width = `${width}px`;
    this.layer.style.height = `${height}px`;
    this.layer.style.transform = `translate3d(${left}px, ${top - 2}px, 0px)`;
    this.lastRect = rect;
  };
}
