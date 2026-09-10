import type { CardRatio, CardStyle, CommentCardSource, GenerateOptions, PanelSkin } from "../domain/types";
import type { PanelState, PanelViewModel } from "./panel-state";
import { panelStep } from "./panel-state";

export interface ExtensionPanelHandlers {
  readonly onClose?: () => void;
  readonly onDraftChange?: (content: string) => void;
  readonly onRestoreOriginal?: () => void;
  readonly onGenerate?: (source: CommentCardSource, options: GenerateOptions) => void;
  readonly onPanelSkinChange?: (skin: PanelSkin) => void;
  readonly onCancelGeneration?: () => void;
  readonly onRetryGeneration?: () => void;
  readonly onReturnEditing?: () => void;
  readonly onConfirmSave?: () => void;
  readonly onCreateAnother?: () => void;
  readonly onOpenFolder?: () => void;
}

const stateLabels: Readonly<Record<PanelState, string>> = {
  editing: "编辑卡片",
  generating: "正在制作卡片",
  failed: "制作失败",
  generated: "卡片制作完成",
  saved: "保存成功",
};

const bottomAssetByState: Readonly<Record<PanelState, string>> = {
  editing: new URL("../assets/pixel-panel/generated/bottom-editing.png", import.meta.url).href,
  generating: new URL("../assets/pixel-panel/generated/bottom-generating.png", import.meta.url).href,
  failed: new URL("../assets/pixel-panel/generated/bottom-failed.png", import.meta.url).href,
  generated: new URL("../assets/pixel-panel/generated/bottom-generated.png", import.meta.url).href,
  saved: new URL("../assets/pixel-panel/generated/bottom-saved.png", import.meta.url).href,
};

const illustrationAssetByState = {
  generating: new URL("../assets/pixel-panel/generated/state-generating.png", import.meta.url).href,
  failed: new URL("../assets/pixel-panel/generated/state-failed.png", import.meta.url).href,
  saved: new URL("../assets/pixel-panel/generated/state-saved.png", import.meta.url).href,
} as const;

const panelLogoAsset = new URL("../assets/pixel-panel/generated/mascot-master.png", import.meta.url).href;

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
    const illustration = document.createElement("img");
    illustration.className = "ccg-state-illustration";
    illustration.alt = "";
    if (model.state in illustrationAssetByState) {
      const illustrationState = model.state as keyof typeof illustrationAssetByState;
      illustration.src = illustrationAssetByState[illustrationState];
      illustration.dataset.pixelAsset = `state-${illustrationState}`;
    }
    const heading = document.createElement("h2");
    heading.textContent = stateLabels[model.state];
    content.append(illustration, heading);
    if (model.state === "failed") {
      const message = document.createElement("p");
      message.textContent = model.errorMessage ?? "卡片生成过程中出现错误";
      content.append(message);
    }
    const actions = document.createElement("footer");
    actions.className = "ccg-panel-actions ccg-panel-actions--state";
    if (model.state === "generating") {
      const progress = document.createElement("div");
      progress.className = "ccg-generation-progress";
      progress.setAttribute("role", "progressbar");
      progress.setAttribute("aria-label", "卡片制作进度");
      progress.setAttribute("aria-valuemin", "0");
      progress.setAttribute("aria-valuemax", "100");
      const track = document.createElement("span");
      const fill = document.createElement("i");
      if (model.progress === undefined) {
        progress.classList.add("ccg-generation-progress--indeterminate");
      } else {
        progress.setAttribute("aria-valuenow", String(model.progress));
        fill.style.width = `${model.progress}%`;
      }
      track.append(fill);
      const number = document.createElement("strong");
      number.textContent = model.progress === undefined ? "制作中" : `${model.progress}%`;
      progress.append(track, number);
      const tip = document.createElement("aside");
      tip.className = "ccg-generation-tip";
      tip.innerHTML = "<strong>小贴士</strong><span>卡片生成需要一点时间<br>请耐心等待哦~</span>";
      content.append(progress, tip);
      const cancel = button(document, "取消制作", "取消制作");
      cancel.addEventListener("click", () => handlers.onCancelGeneration?.());
      actions.append(cancel);
    } else if (model.state === "failed") {
      const reasons = document.createElement("section");
      reasons.className = "ccg-failure-reasons";
      const reasonsTitle = document.createElement("strong");
      reasonsTitle.textContent = "可能的原因";
      const list = document.createElement("ul");
      for (const reason of ["页面连接异常", "卡片内容暂不可用", "浏览器暂时无法完成生成"]) {
        const item = document.createElement("li");
        item.textContent = reason;
        list.append(item);
      }
      reasons.append(reasonsTitle, list);
      content.append(reasons);
      const back = button(document, "返回修改", "返回修改");
      const retry = button(document, "重新生成", "重新生成");
      back.addEventListener("click", () => handlers.onReturnEditing?.());
      retry.addEventListener("click", () => handlers.onRetryGeneration?.());
      actions.append(back, retry);
    } else if (model.state === "generated") {
      illustration.remove();
      heading.remove();
      if (model.previewUrl) {
        const preview = document.createElement("img");
        preview.className = "ccg-generated-preview";
        preview.src = model.previewUrl;
        preview.alt = "生成的评论卡片预览";
        content.prepend(preview);
      }
      const previewMeta = document.createElement("p");
      previewMeta.className = "ccg-preview-meta";
      previewMeta.textContent = model.previewInfo
        ? `预览比例：${model.previewInfo.ratio}　${model.previewInfo.dimensions}`
        : `预览比例：${model.preferences.ratio === "16:9" ? "16:9" : "3:4"}`;
      content.append(previewMeta);
      const back = button(document, "返回修改", "返回修改");
      const save = button(document, "确认保存", "确认保存");
      back.addEventListener("click", () => handlers.onReturnEditing?.());
      save.addEventListener("click", () => handlers.onConfirmSave?.());
      actions.append(back, save);
    } else if (model.state === "saved") {
      const info = document.createElement("dl");
      info.className = "ccg-save-info";
      const values = model.saveInfo ?? { format: "PNG" as const, dimensions: "1200 × 1600", location: "本地下载" };
      for (const [label, value] of [["文件格式", values.format], ["分辨率", values.dimensions], ["保存位置", values.location]]) {
        const term = document.createElement("dt");
        term.textContent = label;
        const detail = document.createElement("dd");
        detail.textContent = value;
        info.append(term, detail);
      }
      content.append(info);
      const open = button(document, "打开文件夹", "打开文件夹");
      if (!handlers.onOpenFolder) {
        open.disabled = true;
        open.title = "浏览器暂不支持直接打开下载文件夹";
      }
      open.addEventListener("click", () => handlers.onOpenFolder?.());
      const another = button(document, "再做一张", "再做一张");
      another.addEventListener("click", () => handlers.onCreateAnother?.());
      actions.append(open, another);
    }
    if (actions.childElementCount === 1) actions.classList.add("ccg-panel-actions--single");
    content.append(actions);
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
  const logo = document.createElement("img");
  logo.className = "ccg-panel-logo";
  logo.src = panelLogoAsset;
  logo.alt = "";
  logo.dataset.pixelAsset = "panel-logo";
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

  const decoration = document.createElement("img");
  decoration.className = "ccg-bottom-decoration";
  decoration.src = bottomAssetByState[model.state];
  decoration.alt = "";
  decoration.dataset.pixelAsset = `bottom-${model.state}`;
  panel.append(decoration);
  return panel;
}
