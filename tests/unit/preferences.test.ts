import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPreferences, savePreferences } from "../../src/storage/preferences";

const defaults = {
  style: "bilibili",
  ratio: "3:4",
  includeCover: true,
  gameDecoration: false,
  includeAttributes: false,
  soundEnabled: false,
  panelSkin: "pixel",
} as const;

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe("preferences", () => {
  it("defaults to the bilibili card style, pixel panel skin, 3:4, and disabled optional decoration", async () => {
    delete (globalThis as { chrome?: unknown }).chrome;

    await expect(loadPreferences()).resolves.toEqual(expect.objectContaining({
      style: "bilibili",
      ratio: "3:4",
      gameDecoration: false,
      includeAttributes: false,
      panelSkin: "pixel",
    }));
  });

  it("preserves the approved 9:16 ratio through save and subsequent load", async () => {
    let stored: Record<string, unknown> = {};
    const set = vi.fn(async (values: Record<string, unknown>) => { stored = values; });
    (globalThis as { chrome?: unknown }).chrome = {
      storage: { sync: { get: async () => stored, set } },
    };

    await expect(savePreferences({ ratio: "9:16" })).resolves.toEqual(expect.objectContaining({ ratio: "9:16" }));
    await expect(loadPreferences()).resolves.toEqual(expect.objectContaining({ ratio: "9:16" }));
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ ratio: "9:16" }));
  });
  it("returns the exact defaults when Chrome storage is unavailable", async () => {
    await expect(loadPreferences()).resolves.toEqual(defaults);
  });

  it("uses only valid stored domain values and falls back invalid fields", async () => {
    (globalThis as { chrome?: unknown }).chrome = {
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({
            style: "sss",
            ratio: "wide",
            includeCover: "yes",
            gameDecoration: true,
            unrelated: "discarded",
          }),
        },
      },
    };

    await expect(loadPreferences()).resolves.toEqual({
      style: "sss",
      ratio: "3:4",
      includeCover: true,
      gameDecoration: true,
      includeAttributes: false,
      soundEnabled: false,
      panelSkin: "pixel",
    });
  });

  it("merges a partial patch with validated stored preferences and persists only domain fields", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    (globalThis as { chrome?: unknown }).chrome = {
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({
            style: "history",
            ratio: "16:9",
            includeCover: false,
            gameDecoration: false,
            foreign: "do not preserve",
          }),
          set,
        },
      },
    };

    await expect(savePreferences({ gameDecoration: true })).resolves.toEqual({
      style: "history",
      ratio: "16:9",
      includeCover: false,
      gameDecoration: true,
      includeAttributes: false,
      soundEnabled: false,
      panelSkin: "pixel",
    });
    expect(set).toHaveBeenCalledWith({
      style: "history",
      ratio: "16:9",
      includeCover: false,
      gameDecoration: true,
      includeAttributes: false,
      soundEnabled: false,
      panelSkin: "pixel",
    });
  });

  it("falls back safely when storage rejects or a patch contains an invalid runtime value", async () => {
    (globalThis as { chrome?: unknown }).chrome = {
      storage: {
        sync: {
          get: vi.fn().mockRejectedValue(new Error("storage unavailable")),
          set: vi.fn().mockRejectedValue(new Error("storage unavailable")),
        },
      },
    };

    await expect(savePreferences({ style: "not-a-style" as never })).resolves.toEqual(defaults);
  });
});
