import { afterEach, describe, expect, it, vi } from "vitest";
import { CommentHighlight } from "../../src/selection/comment-highlight";

describe("CommentHighlight", () => {
  const highlights: CommentHighlight[] = [];

  afterEach(() => {
    highlights.forEach((highlight) => highlight.destroy());
    highlights.length = 0;
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("positions a production-owned visual layer over the visible comment anchor", () => {
    const anchor = document.createElement("article");
    document.body.append(anchor);
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(new DOMRect(24, 48, 320, 120));
    const highlight = new CommentHighlight(document);
    highlights.push(highlight);

    highlight.show(anchor);

    const layer = document.querySelector<HTMLElement>("[data-ccg-comment-highlight]");
    expect(layer).not.toBeNull();
    expect(layer?.style.width).toBe("320px");
    expect(layer?.style.height).toBe("120px");
    expect(layer?.style.transform).toBe("translate3d(24px, 46px, 0px)");
    expect(layer?.getAttribute("aria-hidden")).toBe("true");
  });

  it("repositions on document scroll and removes the layer on hide", () => {
    const anchor = document.createElement("article");
    document.body.append(anchor);
    let rect = new DOMRect(10, 20, 200, 80);
    vi.spyOn(anchor, "getBoundingClientRect").mockImplementation(() => rect);
    const highlight = new CommentHighlight(document);
    highlights.push(highlight);
    highlight.show(anchor);

    rect = new DOMRect(10, 140, 200, 80);
    document.dispatchEvent(new Event("scroll", { bubbles: true }));

    expect(document.querySelector<HTMLElement>("[data-ccg-comment-highlight]")?.style.transform).toBe(
      "translate3d(10px, 138px, 0px)",
    );
    highlight.hide();
    expect(document.querySelector("[data-ccg-comment-highlight]")).toBeNull();
  });

  it("reuses one layer with a smooth near transition and an immediate far jump", () => {
    const first = document.createElement("article");
    const near = document.createElement("article");
    const far = document.createElement("article");
    document.body.append(first, near, far);
    vi.spyOn(first, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 40, 300, 100));
    vi.spyOn(near, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 180, 300, 100));
    vi.spyOn(far, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 700, 300, 100));
    const highlight = new CommentHighlight(document);
    highlights.push(highlight);

    highlight.show(first);
    const layer = document.querySelector<HTMLElement>("[data-ccg-comment-highlight]")!;
    expect(layer.hasAttribute("data-ccg-smooth")).toBe(false);

    highlight.show(near);
    expect(document.querySelector("[data-ccg-comment-highlight]")).toBe(layer);
    expect(layer.hasAttribute("data-ccg-smooth")).toBe(true);

    highlight.show(far);
    expect(document.querySelector("[data-ccg-comment-highlight]")).toBe(layer);
    expect(layer.hasAttribute("data-ccg-smooth")).toBe(false);
  });
});
