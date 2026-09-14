import type { CardAttributes, CommentCardSource, GenerateOptions } from "../domain/types";
import { loadImage as defaultLoadImage } from "./image-loader";
import {
  getStyleTokens,
  type CardStyleTokens,
  type EnergyLineDescriptor,
  type ParticleDescriptor,
} from "./styles";
import { layoutText } from "./text-layout";

const BILIBILI_MARK_URL = new URL("../assets/bilibili-mark.svg", import.meta.url).href;
const IMAGE_TIMEOUT_MS = 5_000;
const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", sans-serif';

const CARD_DIMENSIONS = {
  "3:4": { width: 1200, height: 1600 },
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
} as const;

export interface RenderDependencies {
  readonly createCanvas: () => HTMLCanvasElement;
  readonly loadImage: (url: string, timeoutMs: number) => Promise<HTMLImageElement>;
}

export interface RenderCardInput {
  readonly source: CommentCardSource;
  readonly options: GenerateOptions;
  readonly attributes: CardAttributes;
  readonly dependencies?: Partial<RenderDependencies>;
}

export interface RenderCardResult {
  readonly canvas: HTMLCanvasElement;
  readonly coverFallbackUsed: boolean;
}

interface CardGeometry {
  readonly width: number;
  readonly height: number;
  readonly margin: number;
  readonly contentX: number;
  readonly contentWidth: number;
  readonly platformTop: number;
  readonly platformHeight: number;
  readonly coverTop: number;
  readonly coverHeight: number;
  readonly bodyTop: number;
  readonly bodyBottom: number;
  readonly metadataRight: number;
  readonly metadataBottom: number;
  readonly attributeTop: number;
  readonly attributeBaseline: number;
}

interface LoadedImages {
  readonly mark: HTMLImageElement | null;
  readonly cover: HTMLImageElement | null;
  readonly coverFallbackUsed: boolean;
}

function createCanvas(): HTMLCanvasElement {
  return document.createElement("canvas");
}

function withSavedContext(ctx: CanvasRenderingContext2D, draw: () => void): void {
  ctx.save();
  try {
    draw();
  } finally {
    ctx.restore();
  }
}

function gradientEndpoints(width: number, height: number, angle: number): [number, number, number, number] {
  const radians = angle * Math.PI / 180;
  const radius = Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians));
  const centerX = width / 2;
  const centerY = height / 2;
  const offsetX = Math.cos(radians) * radius / 2;
  const offsetY = Math.sin(radians) * radius / 2;
  return [centerX - offsetX, centerY - offsetY, centerX + offsetX, centerY + offsetY];
}

function createGradient(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colors: readonly string[],
  angle: number,
): CanvasGradient {
  const gradient = ctx.createLinearGradient(...gradientEndpoints(width, height, angle));
  const denominator = Math.max(1, colors.length - 1);
  colors.forEach((color, index) => gradient.addColorStop(index / denominator, color));
  return gradient;
}

function drawBackground(ctx: CanvasRenderingContext2D, geometry: CardGeometry, tokens: CardStyleTokens): void {
  withSavedContext(ctx, () => {
    ctx.fillStyle = createGradient(
      ctx,
      geometry.width,
      geometry.height,
      tokens.background.colors,
      tokens.background.angle,
    );
    ctx.fillRect(0, 0, geometry.width, geometry.height);
  });
}

const textureDensity: Record<CardStyleTokens["texture"]["kind"], number> = {
  "paper-grain": 18,
  "archive-fibers": 16,
  halftone: 20,
  "obsidian-dust": 14,
};

function drawParticleShape(
  ctx: CanvasRenderingContext2D,
  shape: ParticleDescriptor["shape"],
  x: number,
  y: number,
  size: number,
): void {
  ctx.beginPath();
  if (shape === "dot") {
    ctx.arc(x, y, size, 0, Math.PI * 2);
  } else {
    const verticalScale = shape === "leaf" ? 1.5 : 1;
    ctx.moveTo(x, y - size * verticalScale);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + size * verticalScale);
    ctx.lineTo(x - size, y);
    ctx.closePath();
  }
  ctx.fill();
}

function drawTextureAndBaseParticles(
  ctx: CanvasRenderingContext2D,
  geometry: CardGeometry,
  tokens: CardStyleTokens,
): void {
  withSavedContext(ctx, () => {
    ctx.fillStyle = tokens.texture.color;
    ctx.globalAlpha = tokens.texture.opacity;
    const count = textureDensity[tokens.texture.kind];
    for (let index = 0; index < count; index += 1) {
      const x = geometry.margin + ((index * 173) % Math.max(1, geometry.width - geometry.margin * 2));
      const y = geometry.margin + ((index * 257) % Math.max(1, geometry.height - geometry.margin * 2));
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  tokens.baseParticles.forEach((particle, index) => {
    withSavedContext(ctx, () => {
      const left = index % 2 === 0;
      const x = left ? geometry.margin / 2 : geometry.width - geometry.margin / 2;
      const y = geometry.margin * 2 + index * geometry.margin * 1.5;
      ctx.fillStyle = particle.color;
      ctx.globalAlpha = particle.opacity;
      drawParticleShape(ctx, particle.shape, x, y, particle.size);
    });
  });
}

function drawBorder(ctx: CanvasRenderingContext2D, geometry: CardGeometry, tokens: CardStyleTokens): void {
  withSavedContext(ctx, () => {
    const inset = geometry.margin / 2;
    ctx.strokeStyle = createGradient(
      ctx,
      geometry.width,
      geometry.height,
      tokens.border.colors,
      tokens.border.angle,
    );
    ctx.lineWidth = Math.max(3, geometry.width * 0.004);
    ctx.strokeRect(inset, inset, geometry.width - inset * 2, geometry.height - inset * 2);
  });
}

function drawMarkFallback(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  ctx.strokeRect(x, y + height * 0.2, width, height * 0.72);
  ctx.beginPath();
  ctx.moveTo(x + width * 0.3, y + height * 0.2);
  ctx.lineTo(x + width * 0.18, y);
  ctx.moveTo(x + width * 0.7, y + height * 0.2);
  ctx.lineTo(x + width * 0.82, y);
  ctx.stroke();
}

function drawPlatform(
  ctx: CanvasRenderingContext2D,
  geometry: CardGeometry,
  tokens: CardStyleTokens,
  mark: HTMLImageElement | null,
  videoTitle?: string,
): void {
  withSavedContext(ctx, () => {
    const markHeight = geometry.width >= 1_900 ? 38 : geometry.width <= 1_080 ? 30 : 34;
    const intrinsicWidth = mark ? Math.max(1, mark.naturalWidth || mark.width) : 96;
    const intrinsicHeight = mark ? Math.max(1, mark.naturalHeight || mark.height) : 64;
    const markWidth = Math.min(150, markHeight * intrinsicWidth / intrinsicHeight);
    const markY = geometry.platformTop + (geometry.platformHeight - markHeight) / 2;
    if (mark) {
      ctx.drawImage(mark, geometry.contentX, markY, markWidth, markHeight);
    } else {
      ctx.strokeStyle = tokens.accent;
      ctx.lineWidth = 4;
      drawMarkFallback(ctx, geometry.contentX, markY, markWidth, markHeight);
    }

    ctx.fillStyle = tokens.metadataText;
    ctx.font = `600 30px ${FONT_FAMILY}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const titleX = geometry.contentX + markWidth + 22;
    const titleRight = geometry.contentX + geometry.contentWidth - (tokens.mark ? 96 : 0);
    const fittedTitle = videoTitle ? fitText(ctx, videoTitle, Math.max(0, titleRight - titleX)) : "";
    if (fittedTitle) {
      ctx.fillText(fittedTitle, titleX, geometry.platformTop + geometry.platformHeight / 2);
    }

    if (tokens.mark) {
      ctx.fillStyle = tokens.mark.color;
      ctx.font = `700 26px ${FONT_FAMILY}`;
      ctx.textAlign = "right";
      ctx.fillText(
        tokens.mark.label,
        geometry.contentX + geometry.contentWidth,
        geometry.platformTop + geometry.platformHeight / 2,
      );
    }
  });
}

function drawCoverCrop(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  geometry: CardGeometry,
): void {
  const sourceWidth = Math.max(1, image.naturalWidth || image.width);
  const sourceHeight = Math.max(1, image.naturalHeight || image.height);
  const destinationRatio = geometry.contentWidth / geometry.coverHeight;
  const sourceRatio = sourceWidth / sourceHeight;
  let sourceX = 0;
  let sourceY = 0;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;

  if (sourceRatio > destinationRatio) {
    cropWidth = sourceHeight * destinationRatio;
    sourceX = (sourceWidth - cropWidth) / 2;
  } else {
    cropHeight = sourceWidth / destinationRatio;
    sourceY = (sourceHeight - cropHeight) / 2;
  }

  withSavedContext(ctx, () => {
    ctx.beginPath();
    ctx.rect(geometry.contentX, geometry.coverTop, geometry.contentWidth, geometry.coverHeight);
    ctx.clip();
    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      cropWidth,
      cropHeight,
      geometry.contentX,
      geometry.coverTop,
      geometry.contentWidth,
      geometry.coverHeight,
    );
  });
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  geometry: CardGeometry,
  tokens: CardStyleTokens,
  content: string,
): void {
  const bodyHeight = Math.max(0, geometry.bodyBottom - geometry.bodyTop);
  const layout = layoutText(
    ctx,
    content,
    { width: geometry.contentWidth, height: bodyHeight },
    {
      fontFamily: FONT_FAMILY,
      fontWeight: 700,
      maxFontSize: 72,
      minFontSize: 36,
      lineHeight: 1.24,
    },
  );
  const textBlockHeight = layout.lines.length * layout.lineHeight;
  const firstLineY = geometry.bodyTop + Math.max(0, bodyHeight - textBlockHeight) / 2;

  withSavedContext(ctx, () => {
    ctx.fillStyle = tokens.bodyText;
    ctx.font = `700 ${layout.fontSize}px ${FONT_FAMILY}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    layout.lines.forEach((line, index) => {
      ctx.fillText(line, geometry.contentX, firstLineY + index * layout.lineHeight);
    });
  });
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  if (ctx.measureText(ellipsis).width > maxWidth) return "";
  const graphemes = Array.from(text);
  let low = 0;
  let high = graphemes.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (ctx.measureText(`${graphemes.slice(0, middle).join("")}${ellipsis}`).width <= maxWidth) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return `${graphemes.slice(0, low).join("")}${ellipsis}`;
}

function drawMetadata(
  ctx: CanvasRenderingContext2D,
  geometry: CardGeometry,
  tokens: CardStyleTokens,
  source: CommentCardSource,
): void {
  const lineHeight = 42;
  const lines = source.publishedAt
    ? [source.authorName || "未知用户", source.publishedAt]
    : [source.authorName || "未知用户"];
  const firstBaseline = geometry.metadataBottom - (lines.length - 1) * lineHeight;

  withSavedContext(ctx, () => {
    ctx.fillStyle = tokens.metadataText;
    ctx.font = `500 28px ${FONT_FAMILY}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    lines.forEach((line, index) => {
      ctx.fillText(fitText(ctx, line, geometry.contentWidth), geometry.metadataRight, firstBaseline + index * lineHeight);
    });
  });
}

const attributeEntries = [
  ["humor", "幽默值"],
  ["warmth", "温暖值"],
  ["sarcasm", "嘲讽值"],
] as const;

function drawAttributes(
  ctx: CanvasRenderingContext2D,
  geometry: CardGeometry,
  tokens: CardStyleTokens,
  attributes: CardAttributes,
): void {
  let highestIndex = 0;
  attributeEntries.forEach(([key], index) => {
    if (attributes[key] > attributes[attributeEntries[highestIndex][0]]) highestIndex = index;
  });
  const baseFontSize = 36;
  const columnWidth = geometry.contentWidth / attributeEntries.length;
  const columnPadding = 16;
  let fittedBaseFontSize = baseFontSize;

  attributeEntries.forEach(([key, label], index) => {
    const factor = index === highestIndex ? 1.2 : 1;
    const glowWidth = index === highestIndex ? 20 : 0;
    ctx.font = `700 ${baseFontSize * factor}px ${FONT_FAMILY}`;
    const textWidth = ctx.measureText(`${label} ${attributes[key]}`).width;
    const availableTextWidth = Math.max(1, columnWidth - columnPadding - glowWidth);
    if (textWidth > availableTextWidth) {
      fittedBaseFontSize = Math.min(
        fittedBaseFontSize,
        baseFontSize * availableTextWidth / textWidth,
      );
    }
  });

  attributeEntries.forEach(([key, label], index) => {
    withSavedContext(ctx, () => {
      const emphasized = index === highestIndex;
      ctx.fillStyle = emphasized ? tokens.accent : tokens.metadataText;
      ctx.font = `700 ${emphasized ? fittedBaseFontSize * 1.2 : fittedBaseFontSize}px ${FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (emphasized) {
        ctx.shadowColor = tokens.accent;
        ctx.shadowBlur = 10;
      }
      ctx.fillText(`${label} ${attributes[key]}`, geometry.contentX + columnWidth * (index + 0.5), geometry.attributeBaseline);
    });
  });
}

function drawEnergyLine(
  ctx: CanvasRenderingContext2D,
  geometry: CardGeometry,
  line: EnergyLineDescriptor,
  index: number,
): void {
  const startX = geometry.margin * 0.18;
  const endX = geometry.margin * 0.82;
  const centerY = geometry.height - geometry.margin * (0.35 + index * 0.18);
  const offsetY = Math.sin(line.angle * Math.PI / 180) * geometry.margin * 0.16;
  ctx.strokeStyle = line.color;
  ctx.globalAlpha = line.opacity;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(startX, centerY - offsetY);
  ctx.lineTo(endX, centerY + offsetY);
  ctx.stroke();
}

function drawGameDecoration(
  ctx: CanvasRenderingContext2D,
  geometry: CardGeometry,
  tokens: CardStyleTokens,
): void {
  tokens.energyLines.forEach((line, index) => {
    withSavedContext(ctx, () => drawEnergyLine(ctx, geometry, line, index));
  });

  tokens.extraParticles.forEach((particle, index) => {
    withSavedContext(ctx, () => {
      const right = index % 2 === 0;
      const x = right ? geometry.width - geometry.margin / 2 : geometry.margin / 2;
      const y = geometry.height * (0.32 + index * 0.12);
      ctx.fillStyle = particle.color;
      ctx.globalAlpha = particle.opacity;
      drawParticleShape(ctx, particle.shape, x, y, particle.size);
    });
  });

  const badge = tokens.badge;
  if (badge) {
    withSavedContext(ctx, () => {
      const badgeWidth = 132;
      const badgeHeight = 50;
      const badgeX = geometry.width - geometry.margin - badgeWidth;
      const badgeY = geometry.margin * 0.62;
      ctx.fillStyle = badge.color;
      ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
      ctx.fillStyle = badge.textColor;
      ctx.font = `800 24px ${FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(badge.label, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);
    });
  }
}

function estimateCoverRatio(content: string, width: number, height: number): number {
  const estimatedLines = Math.max(1, Math.ceil(Array.from(content.trim()).length / 24));
  const progress = Math.min(1, Math.max(0, (estimatedLines - 1) / 14));
  if (width > height) return 0.64 - progress * 0.22;
  if (height / width > 1.5) return 0.24 - progress * 0.06;
  return 0.28 - progress * 0.06;
}

function createGeometry(
  width: number,
  height: number,
  source: CommentCardSource,
  hasCover: boolean,
  includeAttributes: boolean,
): CardGeometry {
  const horizontal = width > height;
  const margin = horizontal ? 54 : width === 1200 ? 80 : 72;
  const contentX = margin;
  const contentWidth = width - margin * 2;
  const platformTop = margin;
  const platformHeight = horizontal ? 60 : 84;
  const platformBottom = platformTop + platformHeight;
  const coverTop = platformBottom + (horizontal ? 14 : 28);
  const coverHeight = hasCover ? height * estimateCoverRatio(source.content, width, height) : 0;
  const bodyTop = hasCover ? coverTop + coverHeight + (horizontal ? 22 : 36) : platformBottom + 36;
  const attributeTop = includeAttributes ? height - margin - 138 : height - margin;
  const attributeBaseline = attributeTop + 68;
  const metadataBottom = includeAttributes ? attributeTop - 38 : height - margin;
  const bodyBottom = metadataBottom - (source.publishedAt ? 104 : 62);

  return {
    width,
    height,
    margin,
    contentX,
    contentWidth,
    platformTop,
    platformHeight,
    coverTop,
    coverHeight,
    bodyTop,
    bodyBottom,
    metadataRight: contentX + contentWidth,
    metadataBottom,
    attributeTop,
    attributeBaseline,
  };
}

async function loadImages(input: RenderCardInput, dependencies: RenderDependencies): Promise<LoadedImages> {
  let mark: HTMLImageElement | null = null;
  try {
    mark = await dependencies.loadImage(BILIBILI_MARK_URL, IMAGE_TIMEOUT_MS);
  } catch {
    mark = null;
  }

  if (!input.options.includeCover || !input.source.videoCoverUrl) {
    return { mark, cover: null, coverFallbackUsed: false };
  }

  try {
    const cover = await dependencies.loadImage(input.source.videoCoverUrl, IMAGE_TIMEOUT_MS);
    return { mark, cover, coverFallbackUsed: false };
  } catch {
    return { mark, cover: null, coverFallbackUsed: true };
  }
}

export async function renderCard(input: RenderCardInput): Promise<RenderCardResult> {
  const dependencies: RenderDependencies = {
    createCanvas,
    loadImage: defaultLoadImage,
    ...input.dependencies,
  };
  const dimensions = CARD_DIMENSIONS[input.options.ratio];
  const canvas = dependencies.createCanvas();
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context is unavailable.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const images = await loadImages(input, dependencies);
  const geometry = createGeometry(
    dimensions.width,
    dimensions.height,
    input.source,
    images.cover !== null,
    input.options.includeAttributes === true,
  );
  const tokens = getStyleTokens(input.options.style, input.options.gameDecoration);

  drawBackground(ctx, geometry, tokens);
  drawTextureAndBaseParticles(ctx, geometry, tokens);
  drawBorder(ctx, geometry, tokens);
  drawPlatform(ctx, geometry, tokens, images.mark, input.source.videoTitle);
  if (images.cover) drawCoverCrop(ctx, images.cover, geometry);
  drawBody(ctx, geometry, tokens, input.source.content);
  drawMetadata(ctx, geometry, tokens, input.source);
  if (input.options.includeAttributes === true) drawAttributes(ctx, geometry, tokens, input.attributes);
  drawGameDecoration(ctx, geometry, tokens);

  return { canvas, coverFallbackUsed: images.coverFallbackUsed };
}
