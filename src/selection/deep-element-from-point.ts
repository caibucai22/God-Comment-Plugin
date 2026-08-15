export function deepElementFromPoint(
  document: Document,
  clientX: number,
  clientY: number,
  maxDepth = 16,
): Element | null {
  if (typeof document.elementFromPoint !== "function") return null;
  const initial = document.elementFromPoint(clientX, clientY);
  if (!initial) return null;
  let current: Element = initial;

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const root = current.shadowRoot;
    const next: Element | null = root && typeof root.elementFromPoint === "function"
      ? root.elementFromPoint(clientX, clientY)
      : null;
    if (!next || next === current) break;
    current = next;
  }

  return current;
}
