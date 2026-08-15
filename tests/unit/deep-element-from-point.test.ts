import { afterEach, describe, expect, it, vi } from "vitest";
import { deepElementFromPoint } from "../../src/selection/deep-element-from-point";

describe("deepElementFromPoint", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("follows one open Shadow DOM hit path to the deepest visible element", () => {
    const outer = document.createElement("div");
    document.body.append(outer);
    const outerRoot = outer.attachShadow({ mode: "open" });
    const inner = document.createElement("section");
    outerRoot.append(inner);
    const innerRoot = inner.attachShadow({ mode: "open" });
    const deepest = document.createElement("span");
    innerRoot.append(deepest);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => outer) });
    Object.defineProperty(outerRoot, "elementFromPoint", { configurable: true, value: vi.fn(() => inner) });
    Object.defineProperty(innerRoot, "elementFromPoint", { configurable: true, value: vi.fn(() => deepest) });

    expect(deepElementFromPoint(document, 40, 80)).toBe(deepest);
  });

  it("stops when a ShadowRoot repeats its host hit", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = host.attachShadow({ mode: "open" });
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => host) });
    Object.defineProperty(root, "elementFromPoint", { configurable: true, value: vi.fn(() => host) });

    expect(deepElementFromPoint(document, 10, 10)).toBe(host);
    expect(root.elementFromPoint).toHaveBeenCalledTimes(1);
  });

  it("returns null when the viewport coordinate has no element", () => {
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => null) });

    expect(deepElementFromPoint(document, -1, -1)).toBeNull();
  });
});
