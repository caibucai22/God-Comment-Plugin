import { describe, expect, it } from "vitest";
import { generateAttributes } from "../../src/attributes/generator";

describe("generateAttributes", () => {
  it("returns stable attributes with one strong value", () => {
    const first = generateAttributes("同一条评论", "warm");
    const second = generateAttributes("同一条评论", "warm");

    expect(second).toEqual(first);
    expect(Object.values(first).every((value) => value >= 0 && value <= 100)).toBe(true);
    expect(Math.max(...Object.values(first))).toBeGreaterThanOrEqual(80);
    expect(Math.max(...Object.values(first))).toBeLessThanOrEqual(99);
  });

  it("normalizes whitespace before creating the stable seed", () => {
    expect(generateAttributes("  同一条\n 评论  ", "warm")).toEqual(
      generateAttributes("同一条 评论", "warm"),
    );
  });

  it("varies the generated attributes when style or content changes", () => {
    const baseline = generateAttributes("同一条评论", "warm");

    expect(generateAttributes("同一条评论", "history")).not.toEqual(baseline);
    expect(generateAttributes("另一条评论", "warm")).not.toEqual(baseline);
  });
});
