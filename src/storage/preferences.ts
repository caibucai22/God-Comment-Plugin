import type { CardPreferences, CardRatio, CardStyle } from "../domain/types";

export const DEFAULT_PREFERENCES: CardPreferences = {
  style: "warm",
  ratio: "3:4",
  includeCover: true,
  gameDecoration: false,
};

type StoredValue = Record<string, unknown>;

interface StorageReader {
  get(keys: string[]): Promise<StoredValue>;
}

interface StorageArea extends StorageReader {
  set(values: CardPreferences): Promise<void>;
}

function isCardStyle(value: unknown): value is CardStyle {
  return value === "warm" || value === "history" || value === "sarcasm" || value === "sss";
}

function isCardRatio(value: unknown): value is CardRatio {
  return value === "3:4" || value === "9:16";
}

function normalizePreferences(value: unknown): CardPreferences {
  const stored = value && typeof value === "object" ? (value as StoredValue) : {};

  return {
    style: isCardStyle(stored.style) ? stored.style : DEFAULT_PREFERENCES.style,
    ratio: isCardRatio(stored.ratio) ? stored.ratio : DEFAULT_PREFERENCES.ratio,
    includeCover:
      typeof stored.includeCover === "boolean" ? stored.includeCover : DEFAULT_PREFERENCES.includeCover,
    gameDecoration:
      typeof stored.gameDecoration === "boolean"
        ? stored.gameDecoration
        : DEFAULT_PREFERENCES.gameDecoration,
  };
}

function getStorageReader(): StorageReader | null {
  const chromeApi = (globalThis as { chrome?: { storage?: { sync?: unknown } } }).chrome;
  const sync = chromeApi?.storage?.sync;

  if (!sync || typeof sync !== "object") {
    return null;
  }

  const area = sync as Partial<StorageArea>;
  return typeof area.get === "function" ? (area as StorageReader) : null;
}

function getStorageArea(): StorageArea | null {
  const reader = getStorageReader();
  return reader && typeof (reader as Partial<StorageArea>).set === "function"
    ? (reader as StorageArea)
    : null;
}

export async function loadPreferences(): Promise<CardPreferences> {
  const storage = getStorageReader();

  if (!storage) {
    return { ...DEFAULT_PREFERENCES };
  }

  try {
    return normalizePreferences(
      await storage.get(["style", "ratio", "includeCover", "gameDecoration"]),
    );
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export async function savePreferences(patch: Partial<CardPreferences>): Promise<CardPreferences> {
  const current = await loadPreferences();
  const preferences = normalizePreferences({ ...current, ...patch });
  const storage = getStorageArea();

  if (!storage) {
    return preferences;
  }

  try {
    await storage.set(preferences);
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }

  return preferences;
}
