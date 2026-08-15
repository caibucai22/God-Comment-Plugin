import type { CommentCardSource } from "../domain/types";
import type { PlatformAdapter } from "./platform-adapter";

const SELECTORS = {
  commentRoot: ["[data-testid='comment-root']", "#commentapp", ".reply-container"],
  comment: ["[data-testid='comment-item']", ".reply-item", ".sub-reply-item", "bili-comment-renderer"],
  content: ["[data-testid='comment-text']", ".reply-content", ".sub-reply-content", "#contents"],
  author: ["[data-testid='comment-author']", ".user-name", ".sub-user-name", "#user-name"],
  publishedAt: ["[data-testid='comment-time']", ".reply-time", ".sub-reply-time", "#pubdate"],
  cover: ["[data-testid='player-cover']", ".bpx-player-video-wrap img", ".bilibili-player-video img"],
} as const;

function findFirst(parent: ParentNode, selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    const element = parent.querySelector(selector);
    if (element) return element;
  }

  return null;
}

function getNormalizedText(parent: ParentNode, selectors: readonly string[]): string | undefined {
  const text = findFirstAcrossOpenShadowRoots(parent, selectors)?.textContent?.replace(/\s+/g, " ").trim();
  return text || undefined;
}

function findFirstAcrossOpenShadowRoots(parent: ParentNode, selectors: readonly string[]): Element | null {
  const roots: ParentNode[] = [parent];
  if (parent instanceof Element && parent.shadowRoot) roots.push(parent.shadowRoot);
  for (let index = 0; index < roots.length; index += 1) {
    const root = roots[index]!;
    const match = findFirst(root, selectors);
    if (match) return match;

    root.querySelectorAll("*").forEach((element) => {
      if (element.shadowRoot) roots.push(element.shadowRoot);
    });
  }

  return null;
}

function findClosestAcrossOpenShadowRoots(target: Element, selector: string): Element | null {
  let current: Element | null = target;
  while (current) {
    if (current.matches(selector)) return current;
    if (current.parentElement) {
      current = current.parentElement;
      continue;
    }

    const root = current.getRootNode();
    current = root instanceof ShadowRoot ? root.host : null;
  }

  return null;
}

function isWithinComposedTree(element: Element, root: Element): boolean {
  let current: Node | null = element;
  while (current) {
    if (current === root) return true;
    current = current.parentNode ?? (current instanceof ShadowRoot ? current.host : null);
  }

  return false;
}

export class BilibiliAdapter implements PlatformAdapter {
  readonly platform = "bilibili" as const;

  constructor(
    private readonly document: Document,
    private readonly location: Pick<Location, "hostname" | "pathname">,
  ) {}

  matches(location: Location): boolean {
    const productionPage = location.hostname === "www.bilibili.com";
    const e2eFixture = import.meta.env.MODE === "e2e" && location.hostname === "127.0.0.1";
    return (productionPage || e2eFixture) && location.pathname.startsWith("/video/");
  }

  findCommentRoot(): Element | null {
    return findFirst(this.document, SELECTORS.commentRoot);
  }

  resolveComment(target: EventTarget | null): Element | null {
    if (!(target instanceof Element)) return null;

    const comment = findClosestAcrossOpenShadowRoots(target, SELECTORS.comment.join(","));
    const root = this.findCommentRoot();
    return comment && root && isWithinComposedTree(comment, root) ? comment : null;
  }

  extractComment(element: Element): CommentCardSource | null {
    const content = getNormalizedText(element, SELECTORS.content);
    if (!content) return null;

    const authorName = getNormalizedText(element, SELECTORS.author);
    const publishedAt = getNormalizedText(element, SELECTORS.publishedAt);
    const videoCoverUrl = this.getVideoCoverUrl();

    return {
      platform: this.platform,
      content,
      authorName,
      ...(publishedAt ? { publishedAt } : {}),
      ...(videoCoverUrl ? { videoCoverUrl } : {}),
    };
  }

  getVideoCoverUrl(): string | undefined {
    const metadataCover = this.document
      .querySelector("meta[property='og:image']")
      ?.getAttribute("content")
      ?.trim();
    if (metadataCover) return metadataCover;

    const playerCover = findFirst(this.document, SELECTORS.cover);
    if (!(playerCover instanceof HTMLImageElement)) return undefined;
    return playerCover.getAttribute("src")?.trim() || undefined;
  }
}
