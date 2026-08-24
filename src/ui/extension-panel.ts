import type { PanelState, PanelViewModel } from "./panel-state";
import { panelStep } from "./panel-state";

export interface ExtensionPanelHandlers {
  readonly onClose?: () => void;
}

const stateLabels: Readonly<Record<PanelState, string>> = {
  editing: "编辑卡片",
  generating: "正在制作卡片",
  failed: "制作失败",
  generated: "卡片制作完成",
  saved: "保存成功",
};

function appendStepper(document: Document, panel: HTMLElement, state: PanelState): void {
  const stepper = document.createElement("ol");
  stepper.className = "ccg-stepper";
  stepper.setAttribute("aria-label", "卡片制作进度");
  const current = panelStep[state];
  for (let step = 1; step <= 5; step += 1) {
    const item = document.createElement("li");
    item.dataset.complete = String(step < current);
    if (step === current) item.setAttribute("aria-current", "step");
    const marker = document.createElement("span");
    marker.textContent = String(step);
    item.append(marker);
    stepper.append(item);
  }
  panel.append(stepper);
}

function appendStateContent(document: Document, viewport: HTMLElement, model: PanelViewModel): void {
  const content = document.createElement("section");
  content.className = `ccg-state-content ccg-state-content--${model.state}`;
  content.setAttribute("aria-label", stateLabels[model.state]);

  if (model.state === "editing") {
    const heading = document.createElement("h2");
    heading.textContent = "内容设置";
    const text = document.createElement("p");
    text.className = "ccg-source-comment";
    text.textContent = model.source.content;
    content.append(heading, text);
  } else {
    const illustration = document.createElement("div");
    illustration.className = "ccg-state-illustration";
    illustration.dataset.missingAsset = `${model.state}-illustration`;
    illustration.setAttribute("aria-hidden", "true");
    const heading = document.createElement("h2");
    heading.textContent = stateLabels[model.state];
    content.append(illustration, heading);
    if (model.state === "failed") {
      const message = document.createElement("p");
      message.textContent = model.errorMessage ?? "卡片生成过程中出现错误";
      content.append(message);
    }
  }
  viewport.append(content);
}

export function createExtensionPanel(
  document: Document,
  model: PanelViewModel,
  handlers: ExtensionPanelHandlers,
): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "ccg-extension-panel";
  panel.dataset.panelState = model.state;
  panel.setAttribute("aria-label", "流光卡片核");

  const header = document.createElement("header");
  header.className = "ccg-panel-header";
  const logo = document.createElement("span");
  logo.className = "ccg-panel-logo";
  logo.dataset.missingAsset = "cardflow-logo";
  logo.setAttribute("aria-hidden", "true");
  const title = document.createElement("strong");
  title.textContent = "流光卡片核";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "ccg-panel-close";
  close.setAttribute("aria-label", "关闭制作面板");
  close.textContent = "×";
  close.addEventListener("click", () => handlers.onClose?.());
  header.append(logo, title, close);
  panel.append(header);

  appendStepper(document, panel, model.state);
  const viewport = document.createElement("div");
  viewport.className = "ccg-state-viewport";
  appendStateContent(document, viewport, model);
  panel.append(viewport);

  const decoration = document.createElement("div");
  decoration.className = "ccg-bottom-decoration";
  decoration.dataset.missingAsset = `${model.state}-bottom-decoration`;
  decoration.setAttribute("aria-hidden", "true");
  panel.append(decoration);
  return panel;
}
