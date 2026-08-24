import type { CardRatio, CardStyle, CommentCardSource, GenerateOptions, PanelSkin } from "../domain/types";
import type { PanelState, PanelViewModel } from "./panel-state";
import { panelStep } from "./panel-state";

export interface ExtensionPanelHandlers {
  readonly onClose?: () => void;
  readonly onDraftChange?: (content: string) => void;
  readonly onRestoreOriginal?: () => void;
  readonly onGenerate?: (source: CommentCardSource, options: GenerateOptions) => void;
  readonly onPanelSkinChange?: (skin: PanelSkin) => void;
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

function button(document: Document, label: string, text: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.setAttribute("aria-label", label);
  element.textContent = text;
  return element;
}

function accordionSection(
  document: Document,
  parent: HTMLElement,
  name: string,
  title: string,
  expanded: boolean,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "ccg-accordion";
  const trigger = button(document, `${title}设置`, title);
  trigger.className = "ccg-accordion__trigger";
  trigger.dataset.accordionTrigger = name;
  trigger.setAttribute("aria-expanded", String(expanded));
  trigger.setAttribute("aria-controls", `ccg-panel-${name}`);
  const panel = document.createElement("div");
  panel.className = "ccg-accordion__panel";
  panel.dataset.accordionPanel = name;
  panel.id = `ccg-panel-${name}`;
  panel.hidden = !expanded;
  trigger.addEventListener("click", () => {
    parent.querySelectorAll<HTMLElement>("[data-accordion-panel]").forEach((item) => { item.hidden = true; });
    parent.querySelectorAll<HTMLButtonElement>("[data-accordion-trigger]").forEach((item) => item.setAttribute("aria-expanded", "false"));
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  });
  section.append(trigger, panel);
  parent.append(section);
  return panel;
}

function radioGroup<T extends string>(
  document: Document,
  parent: HTMLElement,
  name: string,
  label: string,
  options: ReadonlyArray<{ value: T; label: string }>,
  selected: T,
): void {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "ccg-segmented";
  fieldset.setAttribute("aria-label", label);
  const legend = document.createElement("legend");
  legend.textContent = label;
  fieldset.append(legend);
  for (const option of options) {
    const optionLabel = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = option.value;
    input.checked = option.value === selected;
    const text = document.createElement("span");
    text.textContent = option.label;
    optionLabel.append(input, text);
    fieldset.append(optionLabel);
  }
  parent.append(fieldset);
}

function switchControl(document: Document, parent: HTMLElement, label: string, checked: boolean): HTMLInputElement {
  const row = document.createElement("label");
  row.className = "ccg-switch-row";
  const text = document.createElement("span");
  text.textContent = label;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.setAttribute("aria-label", label);
  row.append(text, input);
  parent.append(row);
  return input;
}

function renderEditing(
  document: Document,
  content: HTMLElement,
  model: PanelViewModel,
  handlers: ExtensionPanelHandlers,
): void {
  const contentPanel = accordionSection(document, content, "content", "内容设置", true);
  const stylePanel = accordionSection(document, content, "style", "样式设置", false);
  const morePanel = accordionSection(document, content, "more", "更多选项", false);
  const meta = document.createElement("p");
  meta.className = "ccg-editing-meta";
  meta.textContent = [model.source.authorName, model.source.publishedAt].filter(Boolean).join(" · ") || "B站评论";
  const field = document.createElement("label");
  field.className = "ccg-comment-field";
  const fieldHeader = document.createElement("span");
  fieldHeader.textContent = "评论文字";
  const restore = button(document, "恢复原文", "恢复");
  restore.addEventListener("click", () => handlers.onRestoreOriginal?.());
  fieldHeader.append(restore);
  const textarea = document.createElement("textarea");
  textarea.setAttribute("aria-label", "评论文字");
  textarea.maxLength = 500;
  textarea.value = model.draftContent ?? model.source.content;
  const validation = document.createElement("span");
  validation.className = "ccg-field-error";
  validation.setAttribute("role", "alert");
  textarea.addEventListener("input", () => {
    validation.textContent = "";
    handlers.onDraftChange?.(textarea.value);
  });
  field.append(fieldHeader, textarea, validation);
  contentPanel.append(meta, field);

  radioGroup<CardStyle>(document, stylePanel, "ccg-style", "卡片风格", [
    { value: "bilibili", label: "Bilibili" },
    { value: "warm", label: "温暖" },
    { value: "history", label: "历史" },
    { value: "sarcasm", label: "嘲讽" },
    { value: "sss", label: "SSS" },
  ], model.preferences.style);
  radioGroup<CardRatio>(document, stylePanel, "ccg-ratio", "卡片比例", [
    { value: "3:4", label: "3:4" },
    { value: "16:9", label: "16:9 横版" },
  ], model.preferences.ratio === "16:9" ? "16:9" : "3:4");

  const includeCover = switchControl(document, morePanel, "包含视频封面", Boolean(model.source.videoCoverUrl) && model.preferences.includeCover);
  includeCover.disabled = !model.source.videoCoverUrl;
  const includeAttributes = switchControl(document, morePanel, "显示趣味属性", model.preferences.includeAttributes ?? false);
  const gameDecoration = switchControl(document, morePanel, "添加游戏化装饰", model.preferences.gameDecoration);
  const soundEnabled = switchControl(document, morePanel, "播放制作声效", model.preferences.soundEnabled ?? false);
  radioGroup<PanelSkin>(document, morePanel, "ccg-panel-skin", "制作面板皮肤", [
    { value: "pixel", label: "像素风" },
    { value: "classic-dark", label: "经典深色" },
  ], model.preferences.panelSkin ?? "pixel");
  morePanel.querySelectorAll<HTMLInputElement>('input[name="ccg-panel-skin"]').forEach((input) => {
    input.addEventListener("change", () => { if (input.checked) handlers.onPanelSkinChange?.(input.value as PanelSkin); });
  });

  const actions = document.createElement("footer");
  actions.className = "ccg-panel-actions";
  const reset = button(document, "重置卡片设置", "重置");
  const generate = button(document, "制作卡片", "制作卡片");
  generate.addEventListener("click", () => {
    const edited = textarea.value.trim();
    if (!edited) {
      validation.textContent = "评论文字不能为空";
      textarea.focus();
      return;
    }
    const style = content.querySelector<HTMLInputElement>('input[name="ccg-style"]:checked')!;
    const ratio = content.querySelector<HTMLInputElement>('input[name="ccg-ratio"]:checked')!;
    handlers.onGenerate?.(
      { ...model.source, content: edited },
      {
        style: style.value as CardStyle,
        ratio: ratio.value as CardRatio,
        includeCover: includeCover.checked,
        includeAttributes: includeAttributes.checked,
        gameDecoration: gameDecoration.checked,
        soundEnabled: soundEnabled.checked,
      },
    );
  });
  actions.append(reset, generate);
  content.append(actions);
}

function appendStateContent(document: Document, viewport: HTMLElement, model: PanelViewModel, handlers: ExtensionPanelHandlers): void {
  const content = document.createElement("section");
  content.className = `ccg-state-content ccg-state-content--${model.state}`;
  content.setAttribute("aria-label", stateLabels[model.state]);

  if (model.state === "editing") {
    renderEditing(document, content, model, handlers);
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
  appendStateContent(document, viewport, model, handlers);
  panel.append(viewport);

  const decoration = document.createElement("div");
  decoration.className = "ccg-bottom-decoration";
  decoration.dataset.missingAsset = `${model.state}-bottom-decoration`;
  decoration.setAttribute("aria-hidden", "true");
  panel.append(decoration);
  return panel;
}
