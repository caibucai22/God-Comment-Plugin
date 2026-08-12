import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPreferences, savePreferences } from "../../src/storage/preferences";

const defaults = {
  style: "warm",
  ratio: "3:4",
  includeCover: true,
  gameDecoration: false,
} as const;

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe("preferences", () => {
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
    });
  });

  it("merges a partial patch with validated stored preferences and persists only domain fields", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    (globalThis as { chrome?: unknown }).chrome = {
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({
            style: "history",
            ratio: "9:16",
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
      ratio: "9:16",
      includeCover: false,
      gameDecoration: true,
    });
    expect(set).toHaveBeenCalledWith({
      style: "history",
      ratio: "9:16",
      includeCover: false,
      gameDecoration: true,
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
