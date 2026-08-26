import type { CardPreferences, CommentCardSource } from "../../src/domain/types";
import { createExtensionPanel } from "../../src/ui/extension-panel";
import type { PanelState, PanelViewModel } from "../../src/ui/panel-state";
import overlayCss from "../../src/ui/overlay.css?inline";

const states: readonly PanelState[] = ["editing", "generating", "failed", "generated", "saved"];
const requested = new URLSearchParams(location.search).get("state") as PanelState | null;
let state: PanelState = requested && states.includes(requested) ? requested : "editing";

const source: CommentCardSource = {
  platform: "bilibili",
  content: "有时候一句来自陌生人的话，也能让普通的一天突然变得明亮。",
  authorName: "山风经过",
  publishedAt: "2026-08-16",
  videoCoverUrl: "data:image/png;base64,iVBORw0KGgo=",
};
let draftContent = source.content;
let preferences: CardPreferences = {
  style: "bilibili",
  ratio: "3:4",
  includeCover: true,
  gameDecoration: false,
  includeAttributes: false,
  soundEnabled: false,
  panelSkin: "pixel",
};

function previewImage(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 320;
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.fillStyle = "#e4f2ff";
  context.fillRect(0, 0, 240, 320);
  context.fillStyle = "#fb7299";
  context.font = "bold 15px Microsoft YaHei";
  context.fillText("bilibili", 18, 32);
  context.fillStyle = "#17171b";
  context.font = "bold 20px Microsoft YaHei";
  context.fillText("有时候一句话", 20, 138);
  context.fillText("也能照亮一天", 20, 170);
  context.font = "14px Microsoft YaHei";
  context.fillText("山风经过", 150, 272);
  return canvas.toDataURL("image/png");
}

const host = document.querySelector("#panel-host") as HTMLElement;
const root = host.attachShadow({ mode: "open" });

function render(): void {
  const style = document.createElement("style");
  style.textContent = overlayCss;
  const model: PanelViewModel = {
    state,
    source,
    preferences,
    draftContent,
    errorMessage: "卡片生成过程中出现错误",
    previewUrl: previewImage(),
    progress: 65,
    saveInfo: { format: "PNG", dimensions: "1200 × 1600", location: "本地下载" },
  };
  const panel = createExtensionPanel(document, model, {
    onClose: () => host.setAttribute("hidden", ""),
    onDraftChange: (content) => { draftContent = content; },
    onRestoreOriginal: () => { draftContent = source.content; render(); },
    onPanelSkinChange: (panelSkin) => { preferences = { ...preferences, panelSkin }; },
    onGenerate: () => { state = "generating"; render(); },
    onCancelGeneration: () => { state = "editing"; render(); },
    onRetryGeneration: () => { state = "generating"; render(); },
    onReturnEditing: () => { state = "editing"; render(); },
    onConfirmSave: () => { state = "saved"; render(); },
    onCreateAnother: () => { state = "editing"; render(); },
  });
  root.replaceChildren(style, panel);
}

render();
