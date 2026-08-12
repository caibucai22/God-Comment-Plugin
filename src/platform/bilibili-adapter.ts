import type { CommentCardSource } from "../domain/types";
import type { PlatformAdapter } from "./platform-adapter";

const SELECTORS = {
  commentRoot: ["[data-testid='comment-root']", "#commentapp", ".reply-container"],
  comment: ["[data-testid='comment-item']", ".reply-item", ".sub-reply-item"],
  content: ["[data-testid='comment-text']", ".reply-content", ".sub-reply-content"],
  author: ["[data-testid='comment-author']", ".user-name", ".sub-user-name"],
  publishedAt: ["[data-testid='comment-time']", ".reply-time", ".sub-reply-time"],
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
  const text = findFirst(parent, selectors)?.textContent?.replace(/\s+/g, " ").trim();
  return text || undefined;
}

export class BilibiliAdapter implements PlatformAdapter {
  readonly platform = "bilibili" as const;

  constructor(
    private readonly document: Document,
    private readonly location: Pick<Location, "hostname" | "pathname">,
  ) {}

  matches(location: Location): boolean {
    return location.hostname === "www.bilibili.com" && location.pathname.startsWith("/video/");
  }

  findCommentRoot(): Element | null {
    return findFirst(this.document, SELECTORS.commentRoot);
  }

  resolveComment(target: EventTarget | null): Element | null {
    if (!(target instanceof Element)) return null;

    const comment = target.closest(SELECTORS.comment.join(","));
    const root = this.findCommentRoot();
    return comment && root?.contains(comment) ? comment : null;
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
