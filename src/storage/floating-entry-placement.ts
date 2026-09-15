export interface FloatingEntryPlacement {
  readonly side: "left" | "right";
  readonly yRatio: number;
}

export interface ClampedFloatingEntryPlacement {
  readonly side: "left" | "right";
  readonly top: number;
}

export const DEFAULT_FLOATING_ENTRY_PLACEMENT: FloatingEntryPlacement = {
  side: "right",
  yRatio: 0.86,
};

const STORAGE_KEY = "floatingEntryPlacement";

interface StorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

function storageArea(): StorageArea | null {
  const area = (globalThis as { chrome?: { storage?: { local?: unknown } } }).chrome?.storage?.local;
  if (!area || typeof area !== "object") return null;
  const candidate = area as Partial<StorageArea>;
  return typeof candidate.get === "function" && typeof candidate.set === "function"
    ? candidate as StorageArea
    : null;
}

function normalize(value: unknown): FloatingEntryPlacement | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if ((candidate.side !== "left" && candidate.side !== "right") ||
      typeof candidate.yRatio !== "number" ||
      !Number.isFinite(candidate.yRatio) ||
      candidate.yRatio < 0 || candidate.yRatio > 1) return null;
  return { side: candidate.side, yRatio: candidate.yRatio };
}

export async function loadFloatingEntryPlacement(): Promise<FloatingEntryPlacement> {
  const area = storageArea();
  if (!area) return { ...DEFAULT_FLOATING_ENTRY_PLACEMENT };
  try {
    return normalize((await area.get([STORAGE_KEY]))[STORAGE_KEY]) ?? { ...DEFAULT_FLOATING_ENTRY_PLACEMENT };
  } catch {
    return { ...DEFAULT_FLOATING_ENTRY_PLACEMENT };
  }
}

export async function saveFloatingEntryPlacement(value: FloatingEntryPlacement): Promise<void> {
  const area = storageArea();
  const placement = normalize(value);
  if (!area || !placement) return;
  try {
    await area.set({ [STORAGE_KEY]: placement });
  } catch {
    // Placement persistence must never block the entry interaction.
  }
}

export function snapFloatingEntryPlacement(
  pointerX: number,
  pointerY: number,
  viewportWidth: number,
  viewportHeight: number,
): FloatingEntryPlacement {
  return {
    side: pointerX < viewportWidth / 2 ? "left" : "right",
    yRatio: Math.min(1, Math.max(0, pointerY / Math.max(1, viewportHeight))),
  };
}

export function clampFloatingEntryPlacement(
  placement: FloatingEntryPlacement,
  viewportHeight: number,
  entryHeight: number,
  edgeInset = 16,
): ClampedFloatingEntryPlacement {
  const minimum = edgeInset;
  const maximum = Math.max(minimum, viewportHeight - entryHeight - edgeInset);
  const centeredTop = placement.yRatio * viewportHeight - entryHeight / 2;
  return {
    side: placement.side,
    top: Math.min(maximum, Math.max(minimum, centeredTop)),
  };
}
