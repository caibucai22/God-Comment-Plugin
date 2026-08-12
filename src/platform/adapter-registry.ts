import { BilibiliAdapter } from "./bilibili-adapter";
import type { PlatformAdapter } from "./platform-adapter";

export function resolvePlatformAdapter(
  document: Document,
  location: Location,
): PlatformAdapter | null {
  const bilibiliAdapter = new BilibiliAdapter(document, location);
  return bilibiliAdapter.matches(location) ? bilibiliAdapter : null;
}
