import type { CardPreferences, CardRatio, CardStyle, CommentCardSource, GenerateOptions } from "../domain/types";

interface ConfirmCardActions {
  onCancel(): void;
  onGenerate(options: GenerateOptions): void;
}

const styles: ReadonlyArray<{ value: CardStyle; label: string }> = [
  { value: "warm", label: "温暖" },
  { value: "history", label: "历史" },
  { value: "sarcasm", label: "讽刺" },
  { value: "sss", label: "SSS" },
];

const ratios: ReadonlyArray<CardRatio> = ["3:4", "9:16"];

/** Builds the confirmation card inside the caller's Shadow DOM. */
export function createConfirmCard(
  document: Document,
  source: CommentCardSource,
  preferences: CardPreferences,
  actions: ConfirmCardActions,
): HTMLElement {
  const card = document.createElement("section");
  card.className = "ccg-confirm";
  card.setAttribute("aria-label", "生成评论卡片");
  card.innerHTML = `
    <div class="ccg-confirm__heading"><span>有神评</span><strong>生成前确认</strong></div>
    <blockquote class="ccg-comment-preview"></blockquote>
    <div class="ccg-control-group" role="group" aria-label="卡片风格">
      <span>风格</span>
      ${styles
        .map(
          ({ value, label }) =>
            `<label><input type="radio" name="ccg-style" value="${value}"> <span>${label}</span></label>`,
        )
        .join("")}
    </div>
    <div class="ccg-control-group" role="group" aria-label="卡片比例">
      <span>比例</span>
      ${ratios.map((ratio) => `<label><input type="radio" name="ccg-ratio" value="${ratio}"> <span>${ratio}</span></label>`).join("")}
    </div>
    <label class="ccg-switch"><input type="checkbox" aria-label="包含视频封面"> <span>包含视频封面</span></label>
    <label class="ccg-switch"><input type="checkbox" aria-label="添加游戏化装饰"> <span>添加游戏化装饰</span></label>
    <div class="ccg-confirm__actions">
      <button type="button" class="ccg-button ccg-button--quiet" aria-label="取消生成">取消</button>
      <button type="button" class="ccg-button" aria-label="生成卡片">生成卡片</button>
    </div>`;

  card.querySelector(".ccg-comment-preview")!.textContent = source.content;
  (card.querySelector(`input[name="ccg-style"][value="${preferences.style}"]`) as HTMLInputElement).checked = true;
  (card.querySelector(`input[name="ccg-ratio"][value="${preferences.ratio}"]`) as HTMLInputElement).checked = true;

  const cover = card.querySelector('[aria-label="包含视频封面"]') as HTMLInputElement;
  cover.disabled = !source.videoCoverUrl;
  cover.checked = Boolean(source.videoCoverUrl) && preferences.includeCover;
  const gameDecoration = card.querySelector('[aria-label="添加游戏化装饰"]') as HTMLInputElement;
  gameDecoration.checked = preferences.gameDecoration;

  (card.querySelector('[aria-label="取消生成"]') as HTMLButtonElement).addEventListener("click", actions.onCancel);
  (card.querySelector('[aria-label="生成卡片"]') as HTMLButtonElement).addEventListener("click", () => {
    const style = card.querySelector('input[name="ccg-style"]:checked') as HTMLInputElement;
    const ratio = card.querySelector('input[name="ccg-ratio"]:checked') as HTMLInputElement;
    actions.onGenerate({
      style: style.value as CardStyle,
      ratio: ratio.value as CardRatio,
      includeCover: cover.checked,
      gameDecoration: gameDecoration.checked,
    });
  });

  return card;
}
