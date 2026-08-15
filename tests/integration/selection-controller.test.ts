import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommentCardSource } from "../../src/domain/types";
import { BilibiliAdapter } from "../../src/platform/bilibili-adapter";
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

  getCommentHighlightAnchor(element: Element): Element {
    return element;
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

function createLiveShadowBilibiliFixture(): { comment: HTMLElement; content: HTMLSpanElement } {
  document.body.innerHTML = '<section id="commentapp"></section>';
  const comments = document.createElement("bili-comments");
  document.querySelector("#commentapp")!.append(comments);
  const commentsRoot = comments.attachShadow({ mode: "open" });
  const feed = document.createElement("div");
  feed.id = "feed";
  commentsRoot.append(feed);

  const thread = document.createElement("bili-comment-thread-renderer");
  feed.append(thread);
  const threadRoot = thread.attachShadow({ mode: "open" });
  const comment = document.createElement("bili-comment-renderer");
  threadRoot.append(comment);
  const commentRoot = comment.attachShadow({ mode: "open" });

  const contentHost = document.createElement("bili-rich-text");
  contentHost.id = "content";
  commentRoot.append(contentHost);
  const contentRoot = contentHost.attachShadow({ mode: "open" });
  const content = document.createElement("span");
  content.id = "contents";
  content.textContent = "Shadow DOM 集成评论";
  contentRoot.append(content);

  const user = document.createElement("bili-comment-user-info");
  commentRoot.append(user);
  const userRoot = user.attachShadow({ mode: "open" });
  const author = document.createElement("span");
  author.id = "user-name";
  author.textContent = "集成测试用户";
  userRoot.append(author);

  const actions = document.createElement("bili-comment-action-buttons-renderer");
  commentRoot.append(actions);
  const actionsRoot = actions.attachShadow({ mode: "open" });
  const publishedAt = document.createElement("time");
  publishedAt.id = "pubdate";
  publishedAt.textContent = "2026-08-15";
  actionsRoot.append(publishedAt);

  return { comment, content };
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

  it("adds a visual hover treatment only to the resolved comment", () => {
    const controller = createController();
    controller.enter();
    const { first, outside } = fixture();
    const comment = first.closest("[data-comment]") as HTMLElement;

    dispatch("pointerover", first);

    expect(comment.style.getPropertyValue("outline")).toBe("2px solid #76e9ff");
    expect((outside as HTMLElement).style.getPropertyValue("outline")).toBe("");
  });

  it("owns and removes the production visual layer with the selection hover", () => {
    const controller = createController();
    controller.enter();
    const { first } = fixture();

    dispatch("pointerover", first);
    expect(document.querySelector("[data-ccg-comment-highlight]")).not.toBeNull();

    controller.exit("toggle");
    expect(document.querySelector("[data-ccg-comment-highlight]")).toBeNull();
  });

  it("restores pre-existing inline hover styles and priorities on exit", () => {
    const controller = createController();
    const { first } = fixture();
    const comment = first.closest("[data-comment]") as HTMLElement;
    comment.style.setProperty("outline", "3px dashed black", "important");
    comment.style.setProperty("outline-offset", "5px", "important");
    comment.style.setProperty("border-radius", "11px", "important");
    comment.style.setProperty("box-shadow", "0 0 3px black", "important");
    controller.enter();

    dispatch("pointerover", first);
    controller.exit("toggle");

    expect(comment.style.getPropertyValue("outline")).toBe("3px dashed black");
    expect(comment.style.getPropertyPriority("outline")).toBe("important");
    expect(comment.style.getPropertyValue("outline-offset")).toBe("5px");
    expect(comment.style.getPropertyPriority("outline-offset")).toBe("important");
    expect(comment.style.getPropertyValue("border-radius")).toBe("11px");
    expect(comment.style.getPropertyPriority("border-radius")).toBe("important");
    expect(comment.style.getPropertyValue("box-shadow")).toBe("0 0 3px black");
    expect(comment.style.getPropertyPriority("box-shadow")).toBe("important");
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

  it("resolves a comment from the composed path when nested Shadow DOM retargets the document event", () => {
    const controller = createController();
    const host = document.createElement("bili-comments");
    document.querySelector("#comments")!.append(host);
    const outerRoot = host.attachShadow({ mode: "open" });
    const component = document.createElement("bili-comment-renderer");
    outerRoot.append(component);
    const componentRoot = component.attachShadow({ mode: "open" });
    const comment = document.createElement("article");
    comment.dataset.comment = "";
    componentRoot.append(comment);
    const target = document.createElement("span");
    target.textContent = "Shadow DOM target";
    comment.append(target);
    controller.enter();

    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true }));

    expect(onSelect).toHaveBeenCalledWith({ platform: "bilibili", content: "A useful comment" });
    expect(controller.active).toBe(true);
  });

  it("selects a retargeted live-structure comment through the real Bilibili adapter", () => {
    const { comment, content } = createLiveShadowBilibiliFixture();
    const controller = new SelectionController({
      adapter: new BilibiliAdapter(document, window.location),
      document,
      onSelect,
      onStateChange,
    });
    controllers.push(controller);
    controller.enter();

    content.dispatchEvent(new Event("pointerover", { bubbles: true, cancelable: true, composed: true }));
    expect(comment.classList.contains("ccg-comment-hover")).toBe(true);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, composed: true });
    content.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledWith({
      platform: "bilibili",
      content: "Shadow DOM 集成评论",
      authorName: "集成测试用户",
      publishedAt: "2026-08-15",
    });
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

  it("rebinds to a new parent when the same connected root is relocated", async () => {
    const controller = createController();
    controller.enter();
    const root = document.querySelector("#comments")!;
    const relocatedParent = document.createElement("aside");
    document.body.append(relocatedParent);

    relocatedParent.append(root);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const callsBeforeReplacement = adapter.findRootCalls;

    root.replaceWith(root.cloneNode(true));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(adapter.findRootCalls).toBe(callsBeforeReplacement + 1);
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
