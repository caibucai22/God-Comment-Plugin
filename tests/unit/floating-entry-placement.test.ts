import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FLOATING_ENTRY_PLACEMENT,
  clampFloatingEntryPlacement,
  loadFloatingEntryPlacement,
  saveFloatingEntryPlacement,
  snapFloatingEntryPlacement,
} from "../../src/storage/floating-entry-placement";

describe("floating entry placement", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to the lower-right placement when storage is unavailable or invalid", async () => {
    expect(await loadFloatingEntryPlacement()).toEqual({ side: "right", yRatio: 0.86 });

    vi.stubGlobal("chrome", {
      storage: { local: { get: vi.fn(async () => ({ floatingEntryPlacement: { side: "top", yRatio: 2 } })) } },
    });
    expect(await loadFloatingEntryPlacement()).toEqual(DEFAULT_FLOATING_ENTRY_PLACEMENT);
  });

  it("loads and saves only the standalone floatingEntryPlacement key", async () => {
    const get = vi.fn(async () => ({ floatingEntryPlacement: { side: "left", yRatio: 0.4 } }));
    const set = vi.fn(async () => undefined);
    vi.stubGlobal("chrome", { storage: { local: { get, set } } });

    expect(await loadFloatingEntryPlacement()).toEqual({ side: "left", yRatio: 0.4 });
    await saveFloatingEntryPlacement({ side: "left", yRatio: 0.4 });

    expect(get).toHaveBeenCalledWith(["floatingEntryPlacement"]);
    expect(set).toHaveBeenCalledWith({ floatingEntryPlacement: { side: "left", yRatio: 0.4 } });
  });

  it("falls back safely when storage rejects", async () => {
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async () => { throw new Error("read failed"); }),
          set: vi.fn(async () => { throw new Error("write failed"); }),
        },
      },
    });

    await expect(loadFloatingEntryPlacement()).resolves.toEqual(DEFAULT_FLOATING_ENTRY_PLACEMENT);
    await expect(saveFloatingEntryPlacement({ side: "right", yRatio: 0.5 })).resolves.toBeUndefined();
  });

  it("snaps to the nearest horizontal edge and converts the pointer center to a ratio", () => {
    expect(snapFloatingEntryPlacement(120, 300, 1000, 600)).toEqual({ side: "left", yRatio: 0.5 });
    expect(snapFloatingEntryPlacement(880, 450, 1000, 600)).toEqual({ side: "right", yRatio: 0.75 });
  });

  it("clamps the rendered top position after viewport resize", () => {
    expect(clampFloatingEntryPlacement({ side: "left", yRatio: 0 }, 600, 64, 16)).toEqual({
      side: "left",
      top: 16,
    });
    expect(clampFloatingEntryPlacement({ side: "right", yRatio: 1 }, 600, 64, 16)).toEqual({
      side: "right",
      top: 520,
    });
  });
});
