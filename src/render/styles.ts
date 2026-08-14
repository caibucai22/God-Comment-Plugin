import type { CardStyle } from "../domain/types";

export interface ColorLayer {
  readonly colors: readonly string[];
  readonly angle: number;
}

export interface TextureDescriptor {
  readonly kind: "paper-grain" | "archive-fibers" | "halftone" | "obsidian-dust";
  readonly color: string;
  readonly opacity: number;
}

export interface ParticleDescriptor {
  readonly shape: "dot" | "star" | "spark" | "leaf";
  readonly color: string;
  readonly opacity: number;
  readonly size: number;
}

export interface BadgeDescriptor {
  readonly label: string;
  readonly color: string;
  readonly textColor: string;
}

export interface EnergyLineDescriptor {
  readonly color: string;
  readonly opacity: number;
  readonly angle: number;
}

export interface MarkDescriptor {
  readonly label: string;
  readonly color: string;
  readonly placement: "top-right" | "bottom-right";
}

export interface CardStyleTokens {
  readonly background: ColorLayer;
  readonly border: ColorLayer;
  readonly bodyText: string;
  readonly metadataText: string;
  readonly accent: string;
  readonly particleColors: readonly string[];
  readonly texture: TextureDescriptor;
  readonly mark: MarkDescriptor | null;
  readonly baseParticles: readonly ParticleDescriptor[];
  readonly badge: BadgeDescriptor | null;
  readonly energyLines: readonly EnergyLineDescriptor[];
  readonly extraParticles: readonly ParticleDescriptor[];
}

type ThemeDefinition = Omit<CardStyleTokens, "badge" | "energyLines" | "extraParticles"> & {
  readonly gameDecoration: Pick<CardStyleTokens, "badge" | "energyLines" | "extraParticles">;
};

const themes: Record<CardStyle, ThemeDefinition> = {
  warm: {
    background: { colors: ["#fff7e8", "#f8d9c4", "#efd0d8"], angle: 135 },
    border: { colors: ["#d9976f", "#edb6a8"], angle: 45 },
    bodyText: "#4d342d",
    metadataText: "#8c6556",
    accent: "#d8785d",
    particleColors: ["#f6c98a", "#e89a83", "#fff3cc"],
    texture: { kind: "paper-grain", color: "#c99370", opacity: 0.14 },
    mark: { label: "暖", color: "#d8785d", placement: "top-right" },
    baseParticles: [{ shape: "leaf", color: "#e89a83", opacity: 0.42, size: 4 }],
    gameDecoration: {
      badge: { label: "暖心", color: "#d8785d", textColor: "#fff8eb" },
      energyLines: [{ color: "#edb6a8", opacity: 0.4, angle: 25 }],
      extraParticles: [{ shape: "star", color: "#f6c98a", opacity: 0.6, size: 5 }],
    },
  },
  history: {
    background: { colors: ["#2d1d18", "#523227", "#251b18"], angle: 145 },
    border: { colors: ["#b58b52", "#6f3028"], angle: 90 },
    bodyText: "#f1dfba",
    metadataText: "#c4a77b",
    accent: "#b98a4d",
    particleColors: ["#b98a4d", "#8f3d32", "#e2c089"],
    texture: { kind: "archive-fibers", color: "#e2c089", opacity: 0.12 },
    mark: { label: "史", color: "#b98a4d", placement: "top-right" },
    baseParticles: [{ shape: "dot", color: "#b98a4d", opacity: 0.34, size: 3 }],
    gameDecoration: {
      badge: { label: "档案", color: "#6f3028", textColor: "#f1dfba" },
      energyLines: [{ color: "#b98a4d", opacity: 0.38, angle: -20 }],
      extraParticles: [{ shape: "spark", color: "#e2c089", opacity: 0.48, size: 4 }],
    },
  },
  sarcasm: {
    background: { colors: ["#121218", "#25212d", "#101114"], angle: 120 },
    border: { colors: ["#d9ff43", "#9b5cff"], angle: 15 },
    bodyText: "#f7f7f7",
    metadataText: "#bdbac5",
    accent: "#d9ff43",
    particleColors: ["#d9ff43", "#9b5cff", "#f7f7f7"],
    texture: { kind: "halftone", color: "#9b5cff", opacity: 0.11 },
    mark: { label: "CUT", color: "#d9ff43", placement: "top-right" },
    baseParticles: [{ shape: "spark", color: "#9b5cff", opacity: 0.5, size: 4 }],
    gameDecoration: {
      badge: { label: "锐评", color: "#d9ff43", textColor: "#15151a" },
      energyLines: [{ color: "#9b5cff", opacity: 0.5, angle: -35 }],
      extraParticles: [{ shape: "star", color: "#d9ff43", opacity: 0.6, size: 4 }],
    },
  },
  sss: {
    background: { colors: ["#0b0d13", "#161326", "#0b0d13"], angle: 135 },
    border: { colors: ["#d4af37", "#8b5cf6"], angle: 45 },
    bodyText: "#f7f0dc",
    metadataText: "#c7bfae",
    accent: "#d4af37",
    particleColors: ["#d4af37", "#8b5cf6", "#ede2b9"],
    texture: { kind: "obsidian-dust", color: "#8b5cf6", opacity: 0.1 },
    mark: { label: "SSS", color: "#d4af37", placement: "top-right" },
    baseParticles: [
      { shape: "star", color: "#d4af37", opacity: 0.48, size: 3 },
      { shape: "star", color: "#8b5cf6", opacity: 0.3, size: 2 },
    ],
    gameDecoration: {
      badge: { label: "SSS", color: "#d4af37", textColor: "#17121a" },
      energyLines: [
        { color: "#d4af37", opacity: 0.46, angle: 30 },
        { color: "#8b5cf6", opacity: 0.38, angle: -30 },
      ],
      extraParticles: [
        { shape: "spark", color: "#d4af37", opacity: 0.65, size: 4 },
        { shape: "star", color: "#8b5cf6", opacity: 0.5, size: 3 },
      ],
    },
  },
};

function clone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => clone(item)) as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, clone(item)]),
    ) as T;
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

export function getStyleTokens(style: CardStyle, gameDecoration: boolean): CardStyleTokens {
  const theme = themes[style];
  const tokens: CardStyleTokens = {
    background: clone(theme.background),
    border: clone(theme.border),
    bodyText: theme.bodyText,
    metadataText: theme.metadataText,
    accent: theme.accent,
    particleColors: clone(theme.particleColors),
    texture: clone(theme.texture),
    mark: clone(theme.mark),
    baseParticles: clone(theme.baseParticles),
    badge: gameDecoration ? clone(theme.gameDecoration.badge) : null,
    energyLines: gameDecoration ? clone(theme.gameDecoration.energyLines) : [],
    extraParticles: gameDecoration ? clone(theme.gameDecoration.extraParticles) : [],
  };

  return deepFreeze(tokens);
}
