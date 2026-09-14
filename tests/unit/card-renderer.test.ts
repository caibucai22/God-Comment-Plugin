import { afterEach, describe, expect, it, vi } from "vitest";
import { getStyleTokens } from "../../src/render/styles";
import {
  renderCard,
  type RenderCardInput,
  type RenderDependencies,
} from "../../src/render/card-renderer";
import { loadImage } from "../../src/render/image-loader";

type RecordedCall = {
  name: string;
  args: unknown[];
  fillStyle: string;
  strokeStyle: string;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  shadowBlur: number;
  shadowColor: string;
};

class RecordingGradient {
  readonly stops: Array<[number, string]> = [];

  addColorStop(offset: number, color: string): void {
    this.stops.push([offset, color]);
  }
}

class RecordingContext {
  readonly calls: RecordedCall[] = [];
  fillStyle: string | CanvasGradient = "#000000";
  strokeStyle: string | CanvasGradient = "#000000";
  font = "10px sans-serif";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  globalAlpha = 1;
  lineWidth = 1;
  shadowBlur = 0;
  shadowColor = "transparent";
  imageSmoothingEnabled = false;
  imageSmoothingQuality: ImageSmoothingQuality = "low";
  private depth = 0;
  private readonly states: Array<{
    fillStyle: string | CanvasGradient;
    strokeStyle: string | CanvasGradient;
    font: string;
    textAlign: CanvasTextAlign;
    textBaseline: CanvasTextBaseline;
    globalAlpha: number;
    lineWidth: number;
    shadowBlur: number;
    shadowColor: string;
  }> = [];
  minimumDepth = 0;

  get saveDepth(): number {
    return this.depth;
  }

  private record(name: string, ...args: unknown[]): void {
    this.calls.push({
      name,
      args,
      fillStyle: String(this.fillStyle),
      strokeStyle: String(this.strokeStyle),
      font: this.font,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
      globalAlpha: this.globalAlpha,
      shadowBlur: this.shadowBlur,
      shadowColor: this.shadowColor,
    });
  }

  save(): void {
    this.states.push({
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      font: this.font,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
      globalAlpha: this.globalAlpha,
      lineWidth: this.lineWidth,
      shadowBlur: this.shadowBlur,
      shadowColor: this.shadowColor,
    });
    this.depth += 1;
    this.record("save");
  }

  restore(): void {
    const state = this.states.pop();
    this.depth -= 1;
    this.minimumDepth = Math.min(this.minimumDepth, this.depth);
    this.record("restore");
    if (state) Object.assign(this, state);
  }

  createLinearGradient(...args: number[]): CanvasGradient {
    this.record("createLinearGradient", ...args);
    return new RecordingGradient() as unknown as CanvasGradient;
  }

  measureText(text: string): TextMetrics {
    const size = Number(this.font.match(/(\d+(?:\.\d+)?)px/u)?.[1] ?? 10);
    return { width: Array.from(text).length * size * 0.56 } as TextMetrics;
  }

  fillRect(...args: number[]): void { this.record("fillRect", ...args); }
  strokeRect(...args: number[]): void { this.record("strokeRect", ...args); }
  clearRect(...args: number[]): void { this.record("clearRect", ...args); }
  beginPath(): void { this.record("beginPath"); }
  closePath(): void { this.record("closePath"); }
  moveTo(...args: number[]): void { this.record("moveTo", ...args); }
  lineTo(...args: number[]): void { this.record("lineTo", ...args); }
  arc(...args: number[]): void { this.record("arc", ...args); }
  rect(...args: number[]): void { this.record("rect", ...args); }
  clip(): void { this.record("clip"); }
  fill(): void { this.record("fill"); }
  stroke(): void { this.record("stroke"); }
  translate(...args: number[]): void { this.record("translate", ...args); }
  rotate(...args: number[]): void { this.record("rotate", ...args); }
  fillText(...args: [string, number, number]): void { this.record("fillText", ...args); }
  drawImage(...args: unknown[]): void { this.record("drawImage", ...args); }
}

class RecordingCanvas {
  width = 0;
  height = 0;
  readonly context = new RecordingContext();

  getContext(kind: string): RecordingContext | null {
    return kind === "2d" ? this.context : null;
  }
}

type FakeImage = HTMLImageElement & { readonly tag: string };

function fakeImage(tag: string, width = 1600, height = 900): FakeImage {
  return { tag, src: tag, naturalWidth: width, naturalHeight: height } as FakeImage;
}

const baseInput: Omit<RenderCardInput, "dependencies"> = {
  source: {
    platform: "bilibili",
    content: "这是一条值得收藏的评论",
    authorName: "测试用户",
    publishedAt: "2026-08-14 12:30",
    videoCoverUrl: "https://example.test/cover.jpg",
    videoTitle: "测试视频标题",
  },
  options: {
    style: "warm",
    ratio: "3:4",
    includeCover: true,
    gameDecoration: false,
  },
  attributes: { humor: 88, warmth: 72, sarcasm: 41 },
};

function makeHarness(imageLoader: RenderDependencies["loadImage"] = async (url) => fakeImage(url)) {
  const canvas = new RecordingCanvas();
  const loadedUrls: string[] = [];
  const dependencies: RenderDependencies = {
    createCanvas: () => canvas as unknown as HTMLCanvasElement,
    loadImage: async (url, timeoutMs) => {
      loadedUrls.push(url);
      return imageLoader(url, timeoutMs);
    },
  };
  return { canvas, dependencies, loadedUrls };
}

async function render(
  overrides: Partial<Omit<RenderCardInput, "source" | "options">> & {
    source?: Partial<RenderCardInput["source"]>;
    options?: Partial<RenderCardInput["options"]>;
  } = {},
  imageLoader?: RenderDependencies["loadImage"],
) {
  const harness = makeHarness(imageLoader);
  const input: RenderCardInput = {
    ...baseInput,
    ...overrides,
    source: { ...baseInput.source, ...overrides.source },
    options: { ...baseInput.options, ...overrides.options },
    dependencies: harness.dependencies,
  };
  const result = await renderCard(input);
  return { ...harness, result };
}

function callsNamed(context: RecordingContext, name: string): RecordedCall[] {
  return context.calls.filter((call) => call.name === name);
}

function textCalls(context: RecordingContext, text: string): RecordedCall[] {
  return context.calls.filter((call) => call.name === "fillText" && call.args[0] === text);
}

function coverCall(context: RecordingContext): RecordedCall {
  const call = context.calls.find(
    (candidate) => candidate.name === "drawImage" && (candidate.args[0] as Partial<FakeImage>).tag?.includes("cover.jpg"),
  );
  if (!call) throw new Error("cover draw call not found");
  return call;
}

function bodyCalls(context: RecordingContext, bodyColor: string): RecordedCall[] {
  return context.calls.filter(
    (call) => call.name === "fillText" && call.fillStyle === bodyColor && /700/u.test(call.font),
  );
}

function textBounds(call: RecordedCall): { left: number; right: number; top: number; bottom: number } {
  const [text, x, y] = call.args as [string, number, number];
  const fontSize = Number(call.font.match(/(\d+(?:\.\d+)?)px/u)?.[1] ?? 10);
  const width = Array.from(text).length * fontSize * 0.56;
  const [left, right] = call.textAlign === "right" || call.textAlign === "end"
    ? [x - width, x]
    : call.textAlign === "center"
      ? [x - width / 2, x + width / 2]
      : [x, x + width];
  const [top, bottom] = call.textBaseline === "top" || call.textBaseline === "hanging"
    ? [y, y + fontSize]
    : call.textBaseline === "middle"
      ? [y - fontSize / 2, y + fontSize / 2]
      : [y - fontSize, y];
  return {
    left: left - call.shadowBlur,
    right: right + call.shadowBlur,
    top: top - call.shadowBlur,
    bottom: bottom + call.shadowBlur,
  };
}

function assertCallsStayInsideCanvas(canvas: RecordingCanvas): void {
  for (const call of canvas.context.calls) {
    const numbers = call.args.filter((value): value is number => typeof value === "number");
    expect(numbers.every(Number.isFinite), `${call.name} contains a non-finite coordinate`).toBe(true);

    if (["fillRect", "strokeRect", "clearRect", "rect"].includes(call.name)) {
      const [x, y, width, height] = numbers;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(width).toBeGreaterThanOrEqual(0);
      expect(height).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(canvas.width);
      expect(y + height).toBeLessThanOrEqual(canvas.height);
    }

    if (call.name === "drawImage") {
      const args = call.args;
      const destination = args.length === 9 ? args.slice(5) : args.slice(1);
      const [x, y, width, height] = destination as number[];
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(width).toBeGreaterThanOrEqual(0);
      expect(height).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(canvas.width);
      expect(y + height).toBeLessThanOrEqual(canvas.height);
    }

    if (call.name === "fillText") {
      const bounds = textBounds(call);
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(canvas.width);
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.bottom).toBeLessThanOrEqual(canvas.height);
    }

    if (call.name === "arc") {
      const [x, y, radius] = numbers;
      expect(x - radius).toBeGreaterThanOrEqual(0);
      expect(y - radius).toBeGreaterThanOrEqual(0);
      expect(x + radius).toBeLessThanOrEqual(canvas.width);
      expect(y + radius).toBeLessThanOrEqual(canvas.height);
    }
  }
}

describe("renderCard", () => {
  it.each([
    ["3:4", 1200, 1600],
    ["9:16", 1080, 1920],
  ] as const)("uses the exact %s canvas size and keeps drawing state and calls bounded", async (ratio, width, height) => {
    const { canvas, result } = await render({ options: { ratio } });

    expect(result.canvas).toBe(canvas);
    expect(canvas.width).toBe(width);
    expect(canvas.height).toBe(height);
    expect(canvas.context.imageSmoothingEnabled).toBe(true);
    expect(canvas.context.imageSmoothingQuality).toBe("high");
    expect(canvas.context.saveDepth).toBe(0);
    expect(canvas.context.minimumDepth).toBe(0);
    expect(callsNamed(canvas.context, "save")).toHaveLength(callsNamed(canvas.context, "restore").length);
    assertCallsStayInsideCanvas(canvas);
  });

  it("draws stages in the fixed background-to-decoration order and uses pixel lineHeight", async () => {
    const content = "正文内容 ".repeat(90);
    const { canvas } = await render({
      source: { content },
      options: { gameDecoration: true, includeAttributes: true },
    });
    const { calls } = canvas.context;
    const tokens = getStyleTokens("warm", true);
    const body = bodyCalls(canvas.context, tokens.bodyText);
    const indexOf = (predicate: (call: RecordedCall) => boolean) => calls.findIndex(predicate);
    const background = indexOf((call) => call.name === "fillRect" && call.args[0] === 0 && call.args[1] === 0);
    const texture = indexOf((call) => call.name === "fill" && call.globalAlpha === tokens.texture.opacity);
    const border = indexOf((call) => call.name === "strokeRect");
    const platform = indexOf((call) => call.name === "fillText" && call.args[0] === "测试视频标题");
    const cover = calls.indexOf(coverCall(canvas.context));
    const bodyStart = calls.indexOf(body[0]);
    const author = indexOf((call) => call.name === "fillText" && call.args[0] === "测试用户");
    const time = indexOf((call) => call.name === "fillText" && call.args[0] === "2026-08-14 12:30");
    const attributes = indexOf((call) => call.name === "fillText" && call.args[0] === "幽默值 88");
    const decoration = indexOf((call) => call.name === "fillText" && call.args[0] === tokens.badge?.label);
    const stageIndexes = [background, texture, border, platform, cover, bodyStart, author, time, attributes, decoration];

    expect(stageIndexes.every((index) => index >= 0)).toBe(true);
    expect(stageIndexes).toEqual([...stageIndexes].sort((a, b) => a - b));
    expect(body.length).toBeGreaterThan(1);
    const firstY = body[0].args[2] as number;
    const secondY = body[1].args[2] as number;
    const fontSize = Number(body[0].font.match(/(\d+(?:\.\d+)?)px/u)?.[1]);
    expect(secondY - firstY).toBeCloseTo(fontSize * 1.24, 5);
    assertCallsStayInsideCanvas(canvas);
  });

  it.each([
    { ratio: "3:4" as const, minimum: 0.22, maximum: 0.28 },
    { ratio: "9:16" as const, minimum: 0.18, maximum: 0.24 },
  ])("keeps $ratio covers inside its portrait media band", async ({ ratio, minimum, maximum }) => {
    for (const content of ["短评", "中等长度评论".repeat(28), "很长的评论".repeat(240)]) {
      const rendered = await render({ source: { content }, options: { ratio } });
      const args = coverCall(rendered.canvas.context).args;
      const coverRatio = (args[8] as number) / rendered.canvas.height;

      expect(coverRatio).toBeGreaterThanOrEqual(minimum);
      expect(coverRatio).toBeLessThanOrEqual(maximum);
      expect(args).toHaveLength(9);
      expect(rendered.result.coverFallbackUsed).toBe(false);
    }
  });

  it("prioritizes the 16:9 cover from 70% toward a 42% long-comment floor", async () => {
    const short = await render({ source: { content: "短评" }, options: { ratio: "16:9" } });
    const medium = await render({ source: { content: "中等长度评论".repeat(28) }, options: { ratio: "16:9" } });
    const long = await render({ source: { content: "很长的评论".repeat(240) }, options: { ratio: "16:9" } });
    const heights = [short, medium, long].map(
      (rendered) => (coverCall(rendered.canvas.context).args[8] as number) / rendered.canvas.height,
    );

    expect(heights[0]).toBeGreaterThanOrEqual(0.62);
    expect(heights[0]).toBeLessThanOrEqual(0.7);
    expect(heights[1]).toBeLessThan(heights[0]);
    expect(heights[1]).toBeGreaterThan(heights[2]);
    expect(heights[2]).toBeCloseTo(0.42, 8);
  });

  it("fits the complete 16:9 cover inside its media region without source cropping", async () => {
    const { canvas } = await render(
      { source: { content: "短评" }, options: { ratio: "16:9" } },
      async (url) => url.includes("cover.jpg")
        ? fakeImage(url, 1600, 900)
        : fakeImage(url),
    );
    const cover = coverCall(canvas.context);

    expect(cover.args).toHaveLength(9);
    const [
      , sourceX, sourceY, sourceWidth, sourceHeight,
      destinationX, destinationY, destinationWidth, destinationHeight,
    ] = cover.args as [
      FakeImage,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    expect([sourceX, sourceY, sourceWidth, sourceHeight]).toEqual([0, 0, 1600, 900]);
    expect(destinationWidth / destinationHeight).toBeCloseTo(16 / 9, 5);
    expect(destinationX).toBeGreaterThanOrEqual(54);
    expect(destinationY).toBeGreaterThanOrEqual(128);
    expect(destinationX + destinationWidth).toBeLessThanOrEqual(1920 - 54);
    expect(destinationY + destinationHeight).toBeLessThanOrEqual(128 + 1080 * 0.7);
  });

  it("does not request a cover when disabled and expands the body into the media space", async () => {
    const withCover = await render();
    const withoutCover = await render({ options: { includeCover: false } });
    const missingUrl = await render({ source: { videoCoverUrl: undefined } });
    const tokens = getStyleTokens("warm", false);
    const withCoverY = bodyCalls(withCover.canvas.context, tokens.bodyText)[0].args[2] as number;
    const withoutCoverY = bodyCalls(withoutCover.canvas.context, tokens.bodyText)[0].args[2] as number;

    expect(withoutCover.loadedUrls).not.toContain(baseInput.source.videoCoverUrl);
    expect(withoutCover.canvas.context.calls.some((call) => call.name === "drawImage" && (call.args[0] as FakeImage).tag?.includes("cover.jpg"))).toBe(false);
    expect(withoutCoverY).toBeLessThan(withCoverY);
    expect(withoutCover.result.coverFallbackUsed).toBe(false);
    expect(missingUrl.result.coverFallbackUsed).toBe(false);
    expect(missingUrl.loadedUrls).toHaveLength(0);
    expect(bodyCalls(missingUrl.canvas.context, tokens.bodyText)[0].args[2]).toBe(withoutCoverY);
  });

  it("falls back to the expanded no-cover layout when cover loading fails", async () => {
    const noCover = await render({ options: { includeCover: false } });
    const failed = await render({}, async (url) => {
      if (url.includes("cover.jpg")) throw new Error("network failed");
      return fakeImage(url);
    });
    const tokens = getStyleTokens("warm", false);

    expect(failed.result.coverFallbackUsed).toBe(true);
    expect(failed.canvas.context.calls.some((call) => call.name === "drawImage" && (call.args[0] as FakeImage).tag?.includes("cover.jpg"))).toBe(false);
    expect(bodyCalls(failed.canvas.context, tokens.bodyText)[0].args[2]).toBe(
      bodyCalls(noCover.canvas.context, tokens.bodyText)[0].args[2],
    );
  });

  it("right-aligns author and time on separate lines and compacts a missing time", async () => {
    const content = "正文段落 ".repeat(220);
    const complete = await render({ source: { content } });
    const missing = await render({ source: { content, authorName: undefined, publishedAt: undefined } });
    const tokens = getStyleTokens("warm", false);
    const author = textCalls(complete.canvas.context, "测试用户")[0];
    const time = textCalls(complete.canvas.context, "2026-08-14 12:30")[0];
    const fallbackAuthor = textCalls(missing.canvas.context, "未知用户")[0];

    expect(author.textAlign).toBe("right");
    expect(time.textAlign).toBe("right");
    expect(author.args[1]).toBe(time.args[1]);
    expect(author.args[2]).toBeLessThan(time.args[2] as number);
    expect(fallbackAuthor.textAlign).toBe("right");
    expect(fallbackAuthor.args[2]).toBe(time.args[2]);
    expect(missing.canvas.context.calls.some((call) => call.name === "fillText" && call.args[0] === "")).toBe(false);
    expect(bodyCalls(missing.canvas.context, tokens.bodyText).length).toBeGreaterThan(
      bodyCalls(complete.canvas.context, tokens.bodyText).length,
    );
  });

  it("draws attributes only when enabled and releases their space to the comment body when disabled", async () => {
    const content = "需要完整利用正文区域的长评论。".repeat(240);
    const disabled = await render({
      source: { content },
      options: { includeCover: false, includeAttributes: false },
    });
    const enabled = await render({
      source: { content },
      options: { includeCover: false, includeAttributes: true },
    });
    const tokens = getStyleTokens("warm", false);
    const disabledBody = bodyCalls(disabled.canvas.context, tokens.bodyText);
    const enabledBody = bodyCalls(enabled.canvas.context, tokens.bodyText);

    for (const label of ["幽默值 88", "温暖值 72", "嘲讽值 41"]) {
      expect(textCalls(disabled.canvas.context, label)).toHaveLength(0);
      expect(textCalls(enabled.canvas.context, label)).toHaveLength(1);
    }
    expect(disabledBody.length).toBeGreaterThan(enabledBody.length);
    expect(disabledBody.at(-1)!.args[2] as number).toBeGreaterThan(enabledBody.at(-1)!.args[2] as number);
  });

  it.each([
    { length: "short", content: "短评", includeAttributes: false, bodyBottom: 1416 },
    { length: "short", content: "短评", includeAttributes: true, bodyBottom: 1240 },
    { length: "long", content: "用于验证长正文实际排版块居中的内容。".repeat(260), includeAttributes: false, bodyBottom: 1416 },
    { length: "long", content: "用于验证长正文实际排版块居中的内容。".repeat(260), includeAttributes: true, bodyBottom: 1240 },
  ] as const)("centers the $length laid-out body with attributes=$includeAttributes without overlapping metadata", async ({
    content,
    includeAttributes,
    bodyBottom,
  }) => {
    const { canvas } = await render({
      source: { content },
      options: { includeCover: false, includeAttributes },
    });
    const tokens = getStyleTokens("warm", false);
    const body = bodyCalls(canvas.context, tokens.bodyText);
    const fontSize = Number(body[0].font.match(/(\d+(?:\.\d+)?)px/u)?.[1]);
    const lineHeight = fontSize * 1.24;
    const expectedFirstY = 200 + ((bodyBottom - 200) - body.length * lineHeight) / 2;
    const metadata = [
      textCalls(canvas.context, "测试用户")[0],
      textCalls(canvas.context, "2026-08-14 12:30")[0],
    ];
    const lastBodyBottom = textBounds(body.at(-1)!).bottom;
    const firstMetadataTop = Math.min(...metadata.map((call) => textBounds(call).top));
    const attributeCalls = ["幽默值 88", "温暖值 72", "嘲讽值 41"]
      .flatMap((label) => textCalls(canvas.context, label));

    expect(body[0].args[2] as number).toBeCloseTo(expectedFirstY, 5);
    expect(lastBodyBottom).toBeLessThan(firstMetadataTop);
    if (includeAttributes) {
      const lastMetadataBottom = Math.max(...metadata.map((call) => textBounds(call).bottom));
      const firstAttributeTop = Math.min(...attributeCalls.map((call) => textBounds(call).top));
      expect(attributeCalls).toHaveLength(3);
      expect(lastMetadataBottom).toBeLessThan(firstAttributeTop);
    } else {
      expect(attributeCalls).toHaveLength(0);
    }
  });

  it("renders exact attribute labels and emphasizes ties in humor-warmth-sarcasm order", async () => {
    const { canvas } = await render({
      options: { includeAttributes: true },
      attributes: { humor: 90, warmth: 90, sarcasm: 90 },
    });
    const tokens = getStyleTokens("warm", false);
    const humor = textCalls(canvas.context, "幽默值 90")[0];
    const warmth = textCalls(canvas.context, "温暖值 90")[0];
    const sarcasm = textCalls(canvas.context, "嘲讽值 90")[0];
    const size = (call: RecordedCall) => Number(call.font.match(/(\d+(?:\.\d+)?)px/u)?.[1]);

    expect(size(humor)).toBeCloseTo(size(warmth) * 1.2, 5);
    expect(size(warmth)).toBe(size(sarcasm));
    expect(humor.fillStyle).toBe(tokens.accent);
    expect(humor.shadowColor).toBe(tokens.accent);
    expect(humor.shadowBlur).toBeGreaterThan(0);
    expect(warmth.shadowBlur).toBe(0);
    expect(sarcasm.shadowBlur).toBe(0);
  });

  it("keeps long metadata and numeric attribute text inside the content safe bounds", async () => {
    const { canvas } = await render({
      options: { includeAttributes: true },
      source: {
        authorName: "超长用户名".repeat(50),
        publishedAt: "超长发布时间".repeat(50),
      },
      attributes: {
        humor: Number.MAX_VALUE,
        warmth: Number.MAX_VALUE,
        sarcasm: Number.MAX_VALUE,
      },
    });
    const relevantText = canvas.context.calls.filter(
      (call) => call.name === "fillText" && (
        call.textAlign === "right" ||
        String(call.args[0]).startsWith("幽默值") ||
        String(call.args[0]).startsWith("温暖值") ||
        String(call.args[0]).startsWith("嘲讽值")
      ),
    );

    expect(relevantText.length).toBeGreaterThanOrEqual(5);
    for (const call of relevantText) {
      const bounds = textBounds(call);
      expect(bounds.left).toBeGreaterThanOrEqual(80);
      expect(bounds.right).toBeLessThanOrEqual(1120);
    }
    assertCallsStayInsideCanvas(canvas);
  });

  it("draws token-provided game decoration only when enabled", async () => {
    const disabled = await render({ options: { gameDecoration: false } });
    const enabled = await render({ options: { gameDecoration: true } });
    const enabledTokens = getStyleTokens("warm", true);
    const energyStroke = (context: RecordingContext) => context.calls.filter(
      (call) => call.name === "stroke" && call.strokeStyle === enabledTokens.energyLines[0].color,
    );
    const extraParticle = (context: RecordingContext) => context.calls.filter(
      (call) => call.name === "fill" && call.fillStyle === enabledTokens.extraParticles[0].color,
    );

    expect(textCalls(disabled.canvas.context, enabledTokens.badge?.label ?? "")).toHaveLength(0);
    expect(energyStroke(disabled.canvas.context)).toHaveLength(0);
    expect(extraParticle(disabled.canvas.context)).toHaveLength(0);
    expect(textCalls(enabled.canvas.context, enabledTokens.badge?.label ?? "")).toHaveLength(1);
    expect(energyStroke(enabled.canvas.context).length).toBeGreaterThan(0);
    expect(extraParticle(enabled.canvas.context).length).toBeGreaterThan(0);
  });

  it("draws the 有神评 wordmark, tagline, and a plain Bilibili source label without loading a logo", async () => {
    const { loadedUrls, canvas } = await render({ options: { includeCover: false } });

    expect(loadedUrls).toHaveLength(0);
    expect(textCalls(canvas.context, "有神评")).toHaveLength(1);
    expect(textCalls(canvas.context, "有神评，让更多人看见")).toHaveLength(1);
    expect(textCalls(canvas.context, "内容来自 bilibili")).toHaveLength(1);
    expect(callsNamed(canvas.context, "drawImage")).toHaveLength(0);
  });

  it("draws one ellipsized video title beside the 有神评 wordmark without colliding with the style mark", async () => {
    const videoTitle = "超长视频标题：需要在卡片平台行内稳定显示并在超出宽度时截断。".repeat(8);
    const { canvas } = await render({
      source: { videoTitle },
      options: { includeCover: false },
    });
    const title = canvas.context.calls.find(
      (call) => call.name === "fillText" && String(call.args[0]).startsWith("超长视频标题："),
    );
    const styleMark = textCalls(canvas.context, "暖")[0];

    expect(title).toBeDefined();
    expect(title!.args[0]).not.toBe(videoTitle);
    expect(String(title!.args[0])).toMatch(/…$/u);
    expect(title!.args[2]).toBe(styleMark.args[2]);
    expect(textBounds(title!).right).toBeLessThan(textBounds(styleMark).left);
  });

  it("keeps the 有神评 brand when the video title is missing", async () => {
    const { canvas } = await render({
      source: { videoTitle: undefined },
      options: { includeCover: false },
    });

    expect(textCalls(canvas.context, "有神评")).toHaveLength(1);
    expect(textCalls(canvas.context, "有神评，让更多人看见")).toHaveLength(1);
  });
});

describe("loadImage", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sets anonymous CORS before src and clears handlers after loading", async () => {
    let instance: TestImage | undefined;
    class TestImage {
      crossOrigin: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      assignedCrossOrigin: string | null = null;
      private value = "";

      constructor() { instance = this; }
      set src(value: string) {
        this.assignedCrossOrigin = this.crossOrigin;
        this.value = value;
      }
      get src(): string { return this.value; }
    }
    vi.stubGlobal("Image", TestImage);

    const pending = loadImage("https://example.test/image.jpg", 500);
    instance?.onload?.();
    const result = await pending;

    expect(result).toBe(instance);
    expect(instance?.assignedCrossOrigin).toBe("anonymous");
    expect(instance?.onload).toBeNull();
    expect(instance?.onerror).toBeNull();
  });

  it("rejects errors and timeouts while clearing handlers and timers", async () => {
    vi.useFakeTimers();
    const instances: TestImage[] = [];
    class TestImage {
      crossOrigin: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";
      constructor() { instances.push(this); }
    }
    vi.stubGlobal("Image", TestImage);

    const errored = loadImage("https://example.test/error.jpg", 500);
    const errorExpectation = expect(errored).rejects.toThrow("Failed to load image");
    instances[0].onerror?.();
    await errorExpectation;
    expect(instances[0].onload).toBeNull();
    expect(instances[0].onerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    const timedOut = loadImage("https://example.test/slow.jpg", 250);
    const timeoutExpectation = expect(timedOut).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(250);
    await timeoutExpectation;
    expect(instances[1].onload).toBeNull();
    expect(instances[1].onerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
