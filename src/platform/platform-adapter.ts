import type { CommentCardSource } from "../domain/types";

export interface ResolvedCommentTarget {
  readonly host: Element;
  readonly anchor: Element;
  readonly kind: "top-level" | "reply" | "legacy";
}

export interface PlatformAdapter {
  readonly platform: CommentCardSource["platform"];
  matches(location: Location): boolean;
  findCommentRoot(): Element | null;
  resolveComment(target: EventTarget | null): Element | null;
  resolveCommentTarget(target: EventTarget | null): ResolvedCommentTarget | null;
  getCommentHighlightAnchor(element: Element): Element;
  extractComment(element: Element): CommentCardSource | null;
  getVideoCoverUrl(): string | undefined;
}
