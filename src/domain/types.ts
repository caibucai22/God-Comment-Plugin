export type CardStyle = "warm" | "history" | "sarcasm" | "sss";
export type CardRatio = "3:4" | "9:16";

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
}

export interface CardAttributes {
  humor: number;
  warmth: number;
  sarcasm: number;
}

export type CardPreferences = GenerateOptions;
