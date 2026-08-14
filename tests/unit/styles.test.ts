import { describe, expect, it } from "vitest";
import { getStyleTokens } from "../../src/render/styles";
import type { CardStyle } from "../../src/domain/types";

const styles: CardStyle[] = ["warm", "history", "sarcasm", "sss"];

describe("getStyleTokens", () => {
  it("returns complete, renderer-ready tokens for every style", () => {
    for (const style of styles) {
      const tokens = getStyleTokens(style, false);

      expect(tokens.background.colors.length).toBeGreaterThan(0);
      expect(tokens.border.colors.length).toBeGreaterThan(0);
      expect(tokens.bodyText).not.toBe("");
      expect(tokens.metadataText).not.toBe("");
      expect(tokens.accent).not.toBe("");
      expect(tokens.particleColors.length).toBeGreaterThan(0);
      expect(tokens.texture.kind).not.toBe("");
      expect(tokens.mark?.label).toBeTruthy();
    }
  });

  it("removes optional game decoration from every style when disabled", () => {
    for (const style of styles) {
      const tokens = getStyleTokens(style, false);

      expect(tokens.badge).toBeNull();
      expect(tokens.energyLines).toEqual([]);
      expect(tokens.extraParticles).toEqual([]);
    }
  });

  it("adds restrained, data-driven game decoration when enabled", () => {
    for (const style of styles) {
      const tokens = getStyleTokens(style, true);

      expect(tokens.badge).not.toBeNull();
      expect(tokens.energyLines.length).toBeGreaterThan(0);
      expect(tokens.extraParticles.length).toBeGreaterThan(0);
    }
  });

  it("keeps the SSS non-game presentation as a restrained obsidian and gold-purple theme", () => {
    const tokens = getStyleTokens("sss", false);

    expect(tokens.background.colors.join(" ")).toMatch(/#0[bd1]/i);
    expect(tokens.border.colors.join(" ")).toMatch(/#(?:d4af37|8b5cf6)/i);
    expect(tokens.mark).toMatchObject({ label: "SSS" });
    expect(tokens.baseParticles.length).toBeGreaterThan(0);
    expect(tokens.baseParticles.length).toBeLessThanOrEqual(8);
    expect(tokens.badge).toBeNull();
  });

  it("does not expose mutable shared token objects", () => {
    const first = getStyleTokens("warm", true);
    const second = getStyleTokens("warm", true);

    expect(first).not.toBe(second);
    expect(first.background).not.toBe(second.background);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.background.colors)).toBe(true);
    expect(second.background.colors).toEqual(first.background.colors);
  });
});
