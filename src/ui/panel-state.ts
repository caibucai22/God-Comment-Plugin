import type { CardPreferences, CardRatio, CommentCardSource } from "../domain/types";

export type PanelState = "editing" | "generating" | "failed" | "generated" | "saved";

export interface PanelViewModel {
  readonly state: PanelState;
  readonly source: CommentCardSource;
  readonly preferences: CardPreferences;
  readonly draftContent?: string;
  readonly errorMessage?: string;
  readonly previewUrl?: string;
  readonly previewInfo?: {
    readonly ratio: CardRatio;
    readonly dimensions: string;
  };
  readonly progress?: number;
  readonly saveInfo?: {
    readonly format: "PNG";
    readonly dimensions: string;
    readonly location: string;
  };
}

export const panelStep: Readonly<Record<PanelState, number>> = {
  editing: 1,
  generating: 2,
  failed: 3,
  generated: 4,
  saved: 5,
};
