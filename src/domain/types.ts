export type CardStyle = "bilibili" | "warm" | "history" | "sarcasm" | "sss";
export type CardRatio = "3:4" | "9:16" | "16:9";
export type PanelSkin = "pixel" | "classic-dark";

export interface CommentCardSource {
  platform: "bilibili";
  content: string;
  authorName?: string;
  publishedAt?: string;
  videoCoverUrl?: string;
}

export interface GenerateOptions {
  style: CardStyle;
  ratio: CardRatio;
  includeCover: boolean;
  gameDecoration: boolean;
  includeAttributes?: boolean;
  soundEnabled?: boolean;
}

export interface CardAttributes {
  humor: number;
  warmth: number;
  sarcasm: number;
}

export interface CardPreferences extends GenerateOptions {
  panelSkin?: PanelSkin;
}
