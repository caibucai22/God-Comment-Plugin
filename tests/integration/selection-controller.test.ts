import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommentCardSource } from "../../src/domain/types";
import type { PlatformAdapter } from "../../src/platform/platform-adapter";
import { SelectionController } from "../../src/selection/selection-controller";

class TestAdapter implements PlatformAdapter {
  readonly platform = "bilibili" as const;
  extracted: CommentCardSource | null = {
    platform: "bilibili",
    content: "A useful comment",
  };
  findRootCalls = 0;

  matches(): boolean {
    return true;
  }

  findCommentRoot(): Element | null {
    this.findRootCalls += 1;
    return document.querySelector("#comments");
  }

  resolveComment(target: EventTarget | null): Element | null {
    return target instanceof Element ? target.closest("[data-comment]") : null;
  }

  extractComment(): CommentCardSource | null {
    return this.extracted;
  }

  getVideoCoverUrl(): string | undefined {
    return undefined;
  }
}

function dispatch(type: string, target: Element, init: EventInit = {}): Event {
  const event = new Event(type, { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function fixture(): { root: Element; first: Element; second: Element; outside: Element } {
  document.body.innerHTML = `
    <main>
      <section id="comments">
        <article data-comment><span data-target="first">First</span></article>
        <article data-comment><span data-target="second">Second</span></article>
      </section>
      <button data-target="outside">Outside</button>
    </main>`;

  return {
    root: document.querySelector("#comments")!,
    first: document.querySelector('[data-target="first"]')!,
    second: document.querySelector('[data-target="second"]')!,
    outside: document.querySelector('[data-target="outside"]')!,
  };
}

describe("SelectionController", () => {
  let adapter: TestAdapter;
  let onSelect: ReturnType<typeof vi.fn>;
  let onStateChange: ReturnType<typeof vi.fn>;
  let controllers: SelectionController[];

  beforeEach(() => {
    fixture();
    adapter = new TestAdapter();
    onSelect = vi.fn();
    onStateChange = vi.fn();
    controllers = [];
  });

  afterEach(() => {
    controllers.forEach((controller) => controller.destroy());
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  function createController(): SelectionController {
    const controller = new SelectionController({ adapter, document, onSelect, onStateChange });
    controllers.push(controller);
    return controller;
  }

  it("enters and emits an active state", () => {
    const controller = createController();

    controller.enter();

    expect(controller.active).toBe(true);
    expect(onStateChange).toHaveBeenLastCalledWith({ active: true, hoveredElement: null });
  });

  it("moves the hover class between resolved comments", () => {
    const controller = createController();
    controller.enter();
    const { first, second } = fixture();

    dispatch("pointerover", first);
    dispatch("pointerover", second);

    expect(first.closest("[data-comment]")!.classList.contains("ccg-comment-hover")).toBe(false);
    expect(second.closest("[data-comment]")!.classList.contains("ccg-comment-hover")).toBe(true);
  });

  it("selects a legal extracted comment and keeps selection mode active", () => {
    const controller = createController();
    controller.enter();
    const { first } = fixture();

    const event = dispatch("click", first);

    expect(event.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledWith({ platform: "bilibili", content: "A useful comment" });
    expect(first.closest("[data-comment]")!.classList.contains("ccg-comment-hover")).toBe(false);
    expect(controller.active).toBe(true);
  });

  it("does not select when extraction returns null", () => {
    adapter.extracted = null;
    const controller = createController();
    controller.enter();

    dispatch("click", document.querySelector('[data-target="first"]')!);

    expect(onSelect).not.toHaveBeenCalled();
    expect(controller.active).toBe(true);
  });

  it("exits when Escape is pressed", () => {
    const controller = createController();
    controller.enter();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(controller.active).toBe(false);
    expect(onStateChange).toHaveBeenLastCalledWith({ active: false, hoveredElement: null, reason: "escape" });
  });

  it("prevents the context menu and exits", () => {
    const controller = createController();
    controller.enter();
    const { first } = fixture();

    const event = dispatch("contextmenu", first);

    expect(event.defaultPrevented).toBe(true);
    expect(controller.active).toBe(false);
    expect(onStateChange).toHaveBeenLastCalledWith({ active: false, hoveredElement: null, reason: "contextmenu" });
  });

  it("exits when a non-comment is clicked", () => {
    const controller = createController();
    controller.enter();
    const { outside } = fixture();

    dispatch("click", outside);

    expect(controller.active).toBe(false);
    expect(onStateChange).toHaveBeenLastCalledWith({ active: false, hoveredElement: null, reason: "outside" });
  });

  it("supports caller-directed exits without treating wheel events as an exit", () => {
    const controller = createController();
    controller.enter();

    dispatch("wheel", document.body);
    expect(controller.active).toBe(true);

    controller.exit("hint");
    expect(onStateChange).toHaveBeenLastCalledWith({ active: false, hoveredElement: null, reason: "hint" });
  });

  it("rebinds only when the comment root is replaced without scanning comments", async () => {
    const controller = createController();
    const queryAll = vi.spyOn(document, "querySelectorAll");
    controller.enter();
    const root = document.querySelector("#comments")!;
    const replacement = root.cloneNode(true) as Element;

    root.replaceWith(replacement);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(queryAll).not.toHaveBeenCalled();
    expect(controller.active).toBe(true);
    expect(onStateChange).toHaveBeenLastCalledWith({ active: true, hoveredElement: null });
  });

  it("stays active and resumes observation when a replacement root returns to the same parent", async () => {
    const controller = createController();
    controller.enter();
    const root = document.querySelector("#comments")!;
    const callsBeforeRemoval = adapter.findRootCalls;

    root.remove();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(controller.active).toBe(true);
    expect(adapter.findRootCalls).toBe(callsBeforeRemoval + 1);

    const replacement = document.createElement("section");
    replacement.id = "comments";
    document.querySelector("main")!.prepend(replacement);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(adapter.findRootCalls).toBe(callsBeforeRemoval + 2);
    expect(onStateChange).toHaveBeenLastCalledWith({ active: true, hoveredElement: null });
  });

  it("removes listeners and makes future events inert when destroyed", () => {
    const controller = createController();
    controller.enter();
    controller.destroy();
    const { first } = fixture();

    const event = dispatch("click", first);

    expect(event.defaultPrevented).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
    expect(controller.active).toBe(false);
  });
});
