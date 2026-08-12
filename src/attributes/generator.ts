import type { CardAttributes, CardStyle } from "../domain/types";

export const ATTRIBUTE_ALGORITHM_VERSION = "v1";

const ATTRIBUTE_KEYS = ["humor", "warmth", "sarcasm"] as const;

function normalizeContent(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function generateAttributes(content: string, style: CardStyle): CardAttributes {
  const random = mulberry32(
    fnv1a(`${ATTRIBUTE_ALGORITHM_VERSION}|${normalizeContent(content)}|${style}`),
  );
  const values = ATTRIBUTE_KEYS.map(() => Math.floor(random() * 100));

  if (Math.max(...values) < 80) {
    values[Math.floor(random() * ATTRIBUTE_KEYS.length)] = 80 + Math.floor(random() * 20);
  }

  return {
    humor: values[0],
    warmth: values[1],
    sarcasm: values[2],
  };
}
