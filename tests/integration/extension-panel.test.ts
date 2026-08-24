import { describe, expect, it } from "vitest";
import { createExtensionPanel } from "../../src/ui/extension-panel";
import type { PanelState, PanelViewModel } from "../../src/ui/panel-state";

const states: PanelState[] = ["editing", "generating", "failed", "generated", "saved"];

function model(state: PanelState): PanelViewModel {
  return {
    state,
    source: {
      platform: "bilibili",
      content: "有时候一句来自陌生人的话，也能让普通的一天突然变得明亮。",
      authorName: "山风经过",
      publishedAt: "2026-08-16",
    },
    preferences: { style: "warm", ratio: "3:4", includeCover: false, gameDecoration: false },
  };
}

describe("ExtensionPanel shared shell", () => {
  it.each(states)("renders exactly one shared shell for %s", (state) => {
    const panel = createExtensionPanel(document, model(state), {});

    expect(panel.matches('.ccg-extension-panel[data-panel-state="' + state + '"]')).toBe(true);
    expect(panel.querySelectorAll(".ccg-extension-panel")).toHaveLength(0);
    expect(panel.querySelectorAll(".ccg-panel-header")).toHaveLength(1);
    expect(panel.querySelectorAll(".ccg-stepper")).toHaveLength(1);
    expect(panel.querySelectorAll(".ccg-state-viewport")).toHaveLength(1);
    expect(panel.querySelectorAll(".ccg-bottom-decoration")).toHaveLength(1);
    expect(panel.textContent).not.toContain("BETA");
    expect(panel.querySelector("[data-five-column-layout]")).toBeNull();
  });

  it("maps each state to one active step", () => {
    for (const state of states) {
      const panel = createExtensionPanel(document, model(state), {});
      expect(panel.querySelectorAll('.ccg-stepper [aria-current="step"]')).toHaveLength(1);
    }
  });
});
