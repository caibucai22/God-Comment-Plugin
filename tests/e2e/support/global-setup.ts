import { buildExtension, verifyProductionManifest } from "./extension-build";

export default async function globalSetup(): Promise<void> {
  buildExtension();
  await verifyProductionManifest();
  buildExtension("e2e");
}
