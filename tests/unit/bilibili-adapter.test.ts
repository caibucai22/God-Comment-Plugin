import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach } from "vitest";
import { BilibiliAdapter } from "../../src/platform/bilibili-adapter";
import { resolvePlatformAdapter } from "../../src/platform/adapter-registry";

const fixture = readFileSync("tests/fixtures/bilibili-comments.html", "utf8");

describe("BilibiliAdapter", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture;
  });

  it("extracts normalized source from a nested target", () => {
    const adapter = new BilibiliAdapter(document, window.location);
    const nested = document.querySelector("[data-testid=comment-text] span")!;
    const comment = adapter.resolveComment(nested)!;

    expect(adapter.findCommentRoot()).toBe(document.querySelector("#commentapp"));
    expect(adapter.extractComment(comment)).toEqual({
      platform: "bilibili",
      content: "历史不是过去的回声，而是今天仍在发生的选择。",
      authorName: "纸飞机",
      publishedAt: "2026-08-11",
      videoCoverUrl: "https://i0.hdslb.com/demo.jpg",
    });
  });

  it("resolves a nested reply and collapses its whitespace", () => {
    const adapter = new BilibiliAdapter(document, window.location);
    const target = document.querySelector("[data-testid=reply-list] span")!;
    const comment = adapter.resolveComment(target)!;

    expect(adapter.extractComment(comment)).toMatchObject({
      content: "嵌套 回复",
      authorName: "云朵",
    });
  });

  it("keeps a missing nickname undefined and rejects empty content", () => {
    const adapter = new BilibiliAdapter(document, window.location);
    const comments = document.querySelectorAll("[data-testid=comment-item]");

    expect(adapter.extractComment(comments[2]!)).toMatchObject({
      content: "没有昵称的评论",
      authorName: undefined,
    });
    expect(adapter.extractComment(comments[3]!)).toBeNull();
    expect(adapter.resolveComment(document.createElement("button"))).toBeNull();
  });

  it("falls back to the player image when og:image is absent", () => {
    document.querySelector("meta[property='og:image']")!.remove();
    const playerImage = document.createElement("img");
    playerImage.setAttribute("data-testid", "player-cover");
    playerImage.src = "https://i0.hdslb.com/player.jpg";
    document.body.append(playerImage);

    expect(new BilibiliAdapter(document, window.location).getVideoCoverUrl()).toBe(
      "https://i0.hdslb.com/player.jpg",
    );
  });

  it("is registered only for Bilibili video pages", () => {
    expect(
      resolvePlatformAdapter(
        document,
        new URL("https://www.bilibili.com/video/BV1xx") as unknown as Location,
      ),
    ).toMatchObject({ platform: "bilibili" });
    expect(
      resolvePlatformAdapter(
        document,
        new URL("https://www.bilibili.com/read/cv1") as unknown as Location,
      ),
    ).toBeNull();
    expect(
      resolvePlatformAdapter(
        document,
        new URL("https://example.com/video/BV1xx") as unknown as Location,
      ),
    ).toBeNull();
  });
});
