import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach } from "vitest";
import { BilibiliAdapter } from "../../src/platform/bilibili-adapter";
import { resolvePlatformAdapter } from "../../src/platform/adapter-registry";

const fixture = readFileSync("tests/fixtures/bilibili-comments.html", "utf8");

function createLiveShadowCommentFixture(): {
  readonly comment: HTMLElement;
  readonly content: HTMLSpanElement;
  readonly visualAnchor: HTMLDivElement;
  readonly repliesHost: HTMLElement;
  readonly reply: HTMLElement;
  readonly replyContent: HTMLSpanElement;
  readonly replyAnchor: HTMLDivElement;
  readonly secondReply: HTMLElement;
} {
  document.body.innerHTML = '<section id="commentapp"></section>';
  const comments = document.createElement("bili-comments");
  document.querySelector("#commentapp")!.append(comments);
  const feedRoot = comments.attachShadow({ mode: "open" });
  const feed = document.createElement("div");
  feed.id = "feed";
  feedRoot.append(feed);

  const thread = document.createElement("bili-comment-thread-renderer");
  feed.append(thread);
  const threadRoot = thread.attachShadow({ mode: "open" });
  const comment = document.createElement("bili-comment-renderer");
  threadRoot.append(comment);
  const commentRoot = comment.attachShadow({ mode: "open" });

  const body = document.createElement("div");
  body.id = "body";
  commentRoot.append(body);
  const contentHost = document.createElement("bili-rich-text");
  contentHost.id = "content";
  body.append(contentHost);
  const contentRoot = contentHost.attachShadow({ mode: "open" });
  const content = document.createElement("span");
  content.id = "contents";
  content.textContent = "真实 站点   Shadow DOM 评论";
  contentRoot.append(content);

  const header = document.createElement("div");
  header.id = "header";
  body.append(header);
  const user = document.createElement("bili-comment-user-info");
  header.append(user);
  const userRoot = user.attachShadow({ mode: "open" });
  const author = document.createElement("span");
  author.id = "user-name";
  author.textContent = "Shadow 用户";
  userRoot.append(author);

  const footer = document.createElement("div");
  footer.id = "footer";
  body.append(footer);
  const actions = document.createElement("bili-comment-action-buttons-renderer");
  footer.append(actions);
  const actionsRoot = actions.attachShadow({ mode: "open" });
  const publishedAt = document.createElement("time");
  publishedAt.id = "pubdate";
  publishedAt.textContent = "2026-08-15";
  actionsRoot.append(publishedAt);

  const repliesContainer = document.createElement("div");
  repliesContainer.id = "replies";
  threadRoot.append(repliesContainer);
  const repliesHost = document.createElement("bili-comment-replies-renderer");
  repliesContainer.append(repliesHost);
  const repliesRoot = repliesHost.attachShadow({ mode: "open" });
  const expander = document.createElement("div");
  expander.id = "expander";
  repliesRoot.append(expander);
  const expanderContents = document.createElement("div");
  expanderContents.id = "expander-contents";
  expander.append(expanderContents);

  function appendReply(replyText: string, replyAuthor: string, replyTime: string) {
    const reply = document.createElement("bili-comment-reply-renderer");
    expanderContents.append(reply);
    const replyRoot = reply.attachShadow({ mode: "open" });
    const replyAnchor = document.createElement("div");
    replyAnchor.id = "body";
    replyRoot.append(replyAnchor);
    const replyMain = document.createElement("div");
    replyMain.id = "main";
    replyAnchor.append(replyMain);
    const replyUser = document.createElement("bili-comment-user-info");
    replyMain.append(replyUser);
    const replyUserRoot = replyUser.attachShadow({ mode: "open" });
    const replyUserName = document.createElement("span");
    replyUserName.id = "user-name";
    replyUserName.textContent = replyAuthor;
    replyUserRoot.append(replyUserName);
    const replyRichText = document.createElement("bili-rich-text");
    replyMain.append(replyRichText);
    const replyTextRoot = replyRichText.attachShadow({ mode: "open" });
    const replyContent = document.createElement("span");
    replyContent.id = "contents";
    replyContent.textContent = replyText;
    replyTextRoot.append(replyContent);
    const replyFooter = document.createElement("div");
    replyFooter.id = "footer";
    replyAnchor.append(replyFooter);
    const replyActions = document.createElement("bili-comment-action-buttons-renderer");
    replyFooter.append(replyActions);
    const replyActionsRoot = replyActions.attachShadow({ mode: "open" });
    const replyPublishedAt = document.createElement("time");
    replyPublishedAt.id = "pubdate";
    replyPublishedAt.textContent = replyTime;
    replyActionsRoot.append(replyPublishedAt);
    return { reply, replyContent, replyAnchor };
  }

  const first = appendReply("默认 回复 一", "回复用户一", "2026-08-14");
  const second = appendReply("默认回复二", "回复用户二", "2026-08-13");

  return {
    comment,
    content,
    visualAnchor: body,
    repliesHost,
    reply: first.reply,
    replyContent: first.replyContent,
    replyAnchor: first.replyAnchor,
    secondReply: second.reply,
  };
}

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

  it("extracts a comment from the nested open Shadow DOM observed on live Bilibili", () => {
    const { comment, content } = createLiveShadowCommentFixture();
    const adapter = new BilibiliAdapter(document, window.location);

    expect(adapter.findCommentRoot()).toBe(document.querySelector("#commentapp"));
    expect(adapter.resolveComment(content)).toBe(comment);
    expect(adapter.extractComment(comment)).toEqual({
      platform: "bilibili",
      content: "真实 站点 Shadow DOM 评论",
      authorName: "Shadow 用户",
      publishedAt: "2026-08-15",
    });
  });

  it("uses the visible comment body as a highlight anchor for a nested open Shadow DOM comment", () => {
    const { comment, visualAnchor } = createLiveShadowCommentFixture();
    const adapter = new BilibiliAdapter(document, window.location) as unknown as {
      getCommentHighlightAnchor(element: Element): Element;
    };

    expect(adapter.getCommentHighlightAnchor(comment)).toBe(visualAnchor);
  });

  it("resolves each rendered modern reply as its own target without falling back to the thread comment", () => {
    const { comment, repliesHost, reply, replyContent, replyAnchor, secondReply } = createLiveShadowCommentFixture();
    const adapter = new BilibiliAdapter(document, window.location);

    expect(adapter.resolveCommentTarget(replyContent)).toEqual({
      host: reply,
      anchor: replyAnchor,
      kind: "reply",
    });
    expect(adapter.resolveCommentTarget(secondReply)).toMatchObject({ host: secondReply, kind: "reply" });
    expect(adapter.resolveCommentTarget(repliesHost)).toBeNull();
    expect(adapter.resolveComment(replyContent)).not.toBe(comment);
    expect(adapter.extractComment(reply)).toEqual({
      platform: "bilibili",
      content: "默认 回复 一",
      authorName: "回复用户一",
      publishedAt: "2026-08-14",
    });
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
