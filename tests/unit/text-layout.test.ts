import { describe, expect, it } from "vitest";
import { layoutText, type TextMeasureContext } from "../../src/render/text-layout";

class FakeMeasureContext implements TextMeasureContext {
  private currentFont = "";
  readonly assignedFonts: string[] = [];

  get font(): string {
    return this.currentFont;
  }

  set font(value: string) {
    this.currentFont = value;
    this.assignedFonts.push(value);
  }

  measureText(text: string): TextMetrics {
    const size = Number(this.currentFont.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 10);
    const units = Array.from(text).reduce((total, character) => {
      if (character === " ") return total + 0.4;
      if (character === "…") return total + 0.8;
      if (/^[\u3400-\u9fff]$/u.test(character)) return total + 1;
      if (/^\p{Extended_Pictographic}$/u.test(character)) return total + 1.4;
      return total + 0.8;
    }, 0);

    return { width: units * size } as TextMetrics;
  }
}

const config = {
  fontFamily: "system-ui",
  fontWeight: 600,
  maxFontSize: 20,
  minFontSize: 12,
  lineHeight: 1.25,
};

function lineWidths(ctx: TextMeasureContext, lines: readonly string[]): number[] {
  return lines.map((line) => ctx.measureText(line).width);
}

describe("layoutText", () => {
  it("keeps short CJK text at the maximum size and assigns the requested canvas font", () => {
    const ctx = new FakeMeasureContext();
    const result = layoutText(ctx, "短评很好", { width: 200, height: 100 }, config);

    expect(result).toEqual({ lines: ["短评很好"], fontSize: 20, lineHeight: 25, truncated: false });
    expect(ctx.assignedFonts).toContain("600 20px system-ui");
  });

  it("collapses ordinary whitespace but keeps intentional paragraph boundaries", () => {
    const ctx = new FakeMeasureContext();
    const result = layoutText(ctx, "  第一段   内容\n\n 第二段\t内容  ", { width: 240, height: 100 }, config);

    expect(result.lines).toEqual(["第一段 内容", "", "第二段 内容"]);
    expect(result.truncated).toBe(false);
  });

  it("wraps CJK and mixed emoji text without any line exceeding its width", () => {
    const ctx = new FakeMeasureContext();
    const result = layoutText(ctx, "中文English 混排 👩🏽‍💻 emoji", { width: 100, height: 200 }, config);

    expect(result.lines.length).toBeGreaterThan(1);
    expect(lineWidths(ctx, result.lines).every((width) => width <= 100)).toBe(true);
    expect(result.truncated).toBe(false);
  });

  it("splits an overlong English token by grapheme while preserving the width invariant", () => {
    const ctx = new FakeMeasureContext();
    const result = layoutText(ctx, "supercalifragilisticexpialidocious", { width: 80, height: 300 }, config);

    expect(result.lines.length).toBeGreaterThan(1);
    expect(result.lines.join("")).toBe("supercalifragilisticexpialidocious");
    expect(lineWidths(ctx, result.lines).every((width) => width <= 80)).toBe(true);
  });

  it("decrements by two pixels before reaching the minimum size when that makes the text fit", () => {
    const ctx = new FakeMeasureContext();
    const result = layoutText(ctx, "一二三四五六七八九十一二三四五六", { width: 90, height: 80 }, config);

    expect(result.fontSize).toBe(16);
    expect(result.truncated).toBe(false);
  });

  it("rejects font-size ranges that cannot descend in exact two-pixel steps", () => {
    const ctx = new FakeMeasureContext();

    expect(() =>
      layoutText(ctx, "需要布局", { width: 90, height: 80 }, { ...config, maxFontSize: 20, minFontSize: 13 }),
    ).toThrow(RangeError);
    expect(() =>
      layoutText(ctx, "需要布局", { width: 90, height: 80 }, { ...config, maxFontSize: Number.NaN }),
    ).toThrow(RangeError);
    expect(() =>
      layoutText(ctx, "需要布局", { width: 90, height: 80 }, { ...config, minFontSize: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      layoutText(ctx, "需要布局", { width: 90, height: 80 }, { ...config, maxFontSize: 12, minFontSize: 20 }),
    ).toThrow(RangeError);
  });

  it("uses the deterministic Array.from fallback when Intl.Segmenter is unavailable", () => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, "Segmenter");
    const ctx = new FakeMeasureContext();

    try {
      Object.defineProperty(Intl, "Segmenter", { configurable: true, value: undefined });
      const result = layoutText(ctx, "supercalifragilistic 中文", { width: 80, height: 300 }, config);

      expect(result.lines.join("")).toBe("supercalifragilistic中文");
      expect(lineWidths(ctx, result.lines).every((width) => width <= 80)).toBe(true);
    } finally {
      if (descriptor) {
        Object.defineProperty(Intl, "Segmenter", descriptor);
      } else {
        Reflect.deleteProperty(Intl, "Segmenter");
      }
    }
  });

  it("truncates only the final visible line at the minimum size", () => {
    const ctx = new FakeMeasureContext();
    const result = layoutText(ctx, "这是一个需要在最小字号截断的很长评论内容", { width: 72, height: 30 }, config);

    expect(result.fontSize).toBe(12);
    expect(result.truncated).toBe(true);
    expect(result.lines).toHaveLength(2);
    expect(result.lines.at(-1)).toMatch(/…$/);
    expect(lineWidths(ctx, result.lines).every((width) => width <= 72)).toBe(true);
  });

  it("returns an empty non-truncated layout for empty or whitespace-only text", () => {
    const ctx = new FakeMeasureContext();

    expect(layoutText(ctx, " \n\t ", { width: 100, height: 100 }, config)).toEqual({
      lines: [],
      fontSize: 20,
      lineHeight: 25,
      truncated: false,
    });
  });

  it("returns safely when even an ellipsis cannot fit", () => {
    const ctx = new FakeMeasureContext();
    const result = layoutText(ctx, "unrenderable", { width: 1, height: 20 }, config);

    expect(result.truncated).toBe(true);
    expect(lineWidths(ctx, result.lines).every((width) => width <= 1)).toBe(true);
    expect(result.lines.at(-1) ?? "").not.toContain("…");
  });
});
