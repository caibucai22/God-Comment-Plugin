import { buildExtension, verifyProductionManifest } from "./extension-build";

export default async function globalTeardown(): Promise<void> {
  buildExtension();
  await verifyProductionManifest();
}
