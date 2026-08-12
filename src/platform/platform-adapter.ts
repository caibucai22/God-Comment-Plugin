import type { CommentCardSource } from "../domain/types";

export interface PlatformAdapter {
  readonly platform: CommentCardSource["platform"];
  matches(location: Location): boolean;
  findCommentRoot(): Element | null;
  resolveComment(target: EventTarget | null): Element | null;
  extractComment(element: Element): CommentCardSource | null;
  getVideoCoverUrl(): string | undefined;
}
