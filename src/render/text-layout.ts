export interface TextMeasureContext {
  font: string;
  measureText(text: string): Pick<TextMetrics, "width">;
}

export interface TextBounds {
  readonly width: number;
  readonly height: number;
}

export interface TextLayoutConfig {
  readonly fontFamily: string;
  readonly fontWeight?: string | number;
  readonly maxFontSize: number;
  readonly minFontSize: number;
  /** Multiplier applied to the selected font size. */
  readonly lineHeight: number;
}

export interface TextLayoutResult {
  readonly lines: readonly string[];
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly truncated: boolean;
}

interface WrappedLines {
  readonly lines: string[];
  readonly containsUnmeasurableGrapheme: boolean;
}

type SegmenterLike = {
  segment(input: string): Iterable<{ segment: string }>;
};

type SegmenterConstructor = new (
  locales: string | readonly string[] | undefined,
  options: { granularity: "word" | "grapheme" },
) => SegmenterLike;

function getSegmenter(granularity: "word" | "grapheme"): SegmenterLike | null {
  const Segmenter = (Intl as typeof Intl & { Segmenter?: SegmenterConstructor }).Segmenter;
  return Segmenter ? new Segmenter(undefined, { granularity }) : null;
}

function getGraphemes(text: string): string[] {
  const segmenter = getSegmenter("grapheme");
  return segmenter ? Array.from(segmenter.segment(text), ({ segment }) => segment) : Array.from(text);
}

function getWordSegments(text: string): string[] {
  const segmenter = getSegmenter("word");
  if (segmenter) {
    return Array.from(segmenter.segment(text), ({ segment }) => segment);
  }

  const segments: string[] = [];
  let latinWord = "";
  for (const character of Array.from(text)) {
    if (/^[A-Za-z0-9]$/u.test(character)) {
      latinWord += character;
      continue;
    }
    if (latinWord) segments.push(latinWord);
    latinWord = "";
    segments.push(character);
  }
  if (latinWord) segments.push(latinWord);
  return segments;
}

function normalizeParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/gu, "\n")
    .split(/\n[\t \f\v]*\n+/gu)
    .map((paragraph) => paragraph.replace(/\s+/gu, " ").trim())
    .filter(Boolean);
}

function assignFont(ctx: TextMeasureContext, fontSize: number, config: TextLayoutConfig): void {
  ctx.font = `${config.fontWeight ?? "normal"} ${fontSize}px ${config.fontFamily}`;
}

function fits(ctx: TextMeasureContext, text: string, width: number): boolean {
  return ctx.measureText(text).width <= width;
}

function wrapOverlongSegment(
  ctx: TextMeasureContext,
  segment: string,
  width: number,
): WrappedLines {
  const lines: string[] = [];
  let line = "";
  let containsUnmeasurableGrapheme = false;

  for (const grapheme of getGraphemes(segment)) {
    const candidate = line + grapheme;
    if (fits(ctx, candidate, width)) {
      line = candidate;
    } else if (line) {
      lines.push(line);
      if (fits(ctx, grapheme, width)) {
        line = grapheme;
      } else {
        containsUnmeasurableGrapheme = true;
        line = "";
      }
    } else {
      containsUnmeasurableGrapheme = true;
    }
  }

  if (line) lines.push(line);
  return { lines, containsUnmeasurableGrapheme };
}

function wrapParagraph(ctx: TextMeasureContext, paragraph: string, width: number): WrappedLines {
  const lines: string[] = [];
  let currentLine = "";
  let pendingSpace = false;
  let containsUnmeasurableGrapheme = false;

  for (const segment of getWordSegments(paragraph)) {
    if (/^\s+$/u.test(segment)) {
      pendingSpace = currentLine.length > 0;
      continue;
    }

    const candidate = currentLine ? `${currentLine}${pendingSpace ? " " : ""}${segment}` : segment;
    if (fits(ctx, candidate, width)) {
      currentLine = candidate;
      pendingSpace = false;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = "";
    }

    if (fits(ctx, segment, width)) {
      currentLine = segment;
    } else {
      const wrapped = wrapOverlongSegment(ctx, segment, width);
      containsUnmeasurableGrapheme ||= wrapped.containsUnmeasurableGrapheme;
      if (wrapped.lines.length > 0) {
        lines.push(...wrapped.lines.slice(0, -1));
        currentLine = wrapped.lines.at(-1) ?? "";
      }
    }
    pendingSpace = false;
  }

  if (currentLine) lines.push(currentLine);
  return { lines, containsUnmeasurableGrapheme };
}

function wrapText(ctx: TextMeasureContext, paragraphs: readonly string[], width: number): WrappedLines {
  const lines: string[] = [];
  let containsUnmeasurableGrapheme = false;
  for (const [index, paragraph] of paragraphs.entries()) {
    if (index > 0) lines.push("");
    const wrapped = wrapParagraph(ctx, paragraph, width);
    lines.push(...wrapped.lines);
    containsUnmeasurableGrapheme ||= wrapped.containsUnmeasurableGrapheme;
  }
  return { lines, containsUnmeasurableGrapheme };
}

function truncateLine(ctx: TextMeasureContext, line: string, width: number): string {
  const ellipsis = "…";
  if (!fits(ctx, ellipsis, width)) return "";

  const graphemes = getGraphemes(line);
  while (graphemes.length > 0 && !fits(ctx, `${graphemes.join("")}${ellipsis}`, width)) {
    graphemes.pop();
  }
  return `${graphemes.join("")}${ellipsis}`;
}

function normalizeSize(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function validateFontSizes(config: TextLayoutConfig): Pick<TextLayoutConfig, "maxFontSize" | "minFontSize"> {
  const { maxFontSize, minFontSize } = config;
  if (
    !Number.isSafeInteger(maxFontSize) ||
    !Number.isSafeInteger(minFontSize) ||
    maxFontSize <= 0 ||
    minFontSize <= 0 ||
    maxFontSize < minFontSize ||
    (maxFontSize - minFontSize) % 2 !== 0
  ) {
    throw new RangeError(
      "maxFontSize and minFontSize must be positive safe integers with maxFontSize >= minFontSize and a difference divisible by 2.",
    );
  }
  return { maxFontSize, minFontSize };
}

export function layoutText(
  ctx: TextMeasureContext,
  text: string,
  bounds: TextBounds,
  config: TextLayoutConfig,
): TextLayoutResult {
  const { maxFontSize, minFontSize } = validateFontSizes(config);
  const lineHeightMultiplier = normalizeSize(config.lineHeight, 1);
  const width = Math.max(0, Number.isFinite(bounds.width) ? bounds.width : 0);
  const height = Math.max(0, Number.isFinite(bounds.height) ? bounds.height : 0);
  const paragraphs = normalizeParagraphs(text);

  if (paragraphs.length === 0) {
    assignFont(ctx, maxFontSize, config);
    return { lines: [], fontSize: maxFontSize, lineHeight: maxFontSize * lineHeightMultiplier, truncated: false };
  }

  let fontSize = maxFontSize;
  while (true) {
    assignFont(ctx, fontSize, config);
    const lineHeight = fontSize * lineHeightMultiplier;
    const wrapped = wrapText(ctx, paragraphs, width);
    const fitsHeight = wrapped.lines.length * lineHeight <= height;
    if (!wrapped.containsUnmeasurableGrapheme && fitsHeight) {
      return { lines: wrapped.lines, fontSize, lineHeight, truncated: false };
    }

    if (fontSize === minFontSize) {
      const visibleLineCount = lineHeight > 0 ? Math.floor(height / lineHeight) : 0;
      if (visibleLineCount <= 0) {
        return { lines: [], fontSize, lineHeight, truncated: true };
      }

      const lines = wrapped.lines.slice(0, visibleLineCount);
      if (lines.length === 0) {
        return { lines: [], fontSize, lineHeight, truncated: true };
      }

      lines[lines.length - 1] = truncateLine(ctx, lines[lines.length - 1], width);
      return { lines, fontSize, lineHeight, truncated: true };
    }

    fontSize = Math.max(minFontSize, fontSize - 2);
  }
}
