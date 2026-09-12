export interface ProductionPackageFile {
  readonly path: string;
  readonly size: number;
}

export interface ProductionPackageAuditResult {
  readonly manifestVersion: 3;
  readonly matches: readonly (readonly string[])[];
  readonly permissions: readonly ["storage", "downloads"];
  readonly requiredFiles: readonly ProductionPackageFile[];
  readonly forbiddenPatternFindings: readonly { readonly path: string; readonly token: string }[];
}

export const FORBIDDEN_PRODUCTION_SOURCE_TOKENS: readonly string[];

export function auditProductionPackage(options?: { readonly distDir?: string }): Promise<ProductionPackageAuditResult>;
