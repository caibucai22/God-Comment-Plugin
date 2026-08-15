interface ChromeRuntimeLike {
  readonly lastError?: { readonly message?: string };
}

interface ChromeDownloadsLike {
  download(
    options: { url: string; filename: string; saveAs: boolean },
    callback?: () => void,
  ): Promise<unknown> | unknown;
}

interface ChromeLike {
  readonly downloads?: ChromeDownloadsLike;
  readonly runtime?: ChromeRuntimeLike;
}

export interface ExportServiceDependencies {
  readonly document: Document;
  readonly chrome: ChromeLike | null;
  readonly createObjectURL: (blob: Blob) => string;
  readonly revokeObjectURL: (url: string) => void;
}

export interface RetainedPngDownload {
  retry(): Promise<void>;
  release(): void;
}

export interface ExportService {
  exportPng(canvas: HTMLCanvasElement, filename: string): Promise<void>;
}

export class PngDownloadError extends Error {
  readonly retained: RetainedPngDownload;

  constructor(message: string, retained: RetainedPngDownload, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "PngDownloadError";
    this.retained = retained;
  }
}

function defaultChrome(): ChromeLike | null {
  return (globalThis as typeof globalThis & { chrome?: ChromeLike }).chrome ?? null;
}

function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Canvas did not produce a PNG Blob"));
        }
      }, "image/png");
    } catch (error) {
      reject(error);
    }
  });
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(value) && typeof (value as PromiseLike<unknown>).then === "function";
}

async function downloadWithChrome(
  chrome: ChromeLike,
  url: string,
  filename: string,
): Promise<void> {
  const downloads = chrome.downloads;
  if (!downloads) throw new Error("Chrome downloads API is unavailable");

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let callbackCalled = false;
    const settle = (error?: unknown) => {
      if (settled) return;
      settled = true;
      if (error === undefined) resolve();
      else reject(error);
    };
    const callback = () => {
      callbackCalled = true;
      const lastError = chrome.runtime?.lastError;
      settle(lastError ? new Error(lastError.message || "Chrome download failed") : undefined);
    };

    try {
      const result = downloads.download({ url, filename, saveAs: true }, callback);
      if (isPromiseLike(result)) {
        Promise.resolve(result).then(
          () => {
            if (!callbackCalled) settle();
          },
          (error) => settle(error),
        );
      }
    } catch (error) {
      settle(error);
    }
  });
}

function downloadWithAnchor(document: Document, url: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  const parent = document.body ?? document.documentElement;

  try {
    parent.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
  }
}

async function attemptDownload(
  dependencies: ExportServiceDependencies,
  url: string,
  filename: string,
): Promise<void> {
  if (dependencies.chrome?.downloads) {
    try {
      await downloadWithChrome(dependencies.chrome, url, filename);
      return;
    } catch {
      // A rejected request has not accepted the object URL, so the same URL is safe for fallback.
    }
  }

  downloadWithAnchor(dependencies.document, url, filename);
}

class OwnedPngDownload implements RetainedPngDownload {
  private released = false;
  private releaseRequested = false;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly dependencies: ExportServiceDependencies,
    private readonly url: string,
    private readonly filename: string,
  ) {}

  retry(): Promise<void> {
    if (this.released) return Promise.reject(new Error("PNG download is no longer available"));
    if (this.inFlight) return this.inFlight;

    const operation = attemptDownload(this.dependencies, this.url, this.filename)
      .then(() => {
        this.revoke();
      })
      .catch((cause: unknown) => {
        if (this.releaseRequested) this.revoke();
        throw new PngDownloadError("Unable to download PNG", this, cause);
      })
      .finally(() => {
        this.inFlight = null;
      });
    this.inFlight = operation;
    return operation;
  }

  release(): void {
    if (this.released) return;
    if (this.inFlight) {
      this.releaseRequested = true;
      return;
    }
    this.revoke();
  }

  private revoke(): void {
    if (this.released) return;
    this.released = true;
    this.dependencies.revokeObjectURL(this.url);
  }
}

export function createExportService(
  overrides: Partial<ExportServiceDependencies> = {},
): ExportService {
  const dependencies: ExportServiceDependencies = {
    document: overrides.document ?? document,
    chrome: Object.prototype.hasOwnProperty.call(overrides, "chrome")
      ? overrides.chrome ?? null
      : defaultChrome(),
    createObjectURL: overrides.createObjectURL ?? ((blob) => URL.createObjectURL(blob)),
    revokeObjectURL: overrides.revokeObjectURL ?? ((url) => URL.revokeObjectURL(url)),
  };

  return {
    async exportPng(canvas, filename) {
      const blob = await toPngBlob(canvas);
      const url = dependencies.createObjectURL(blob);
      const retained = new OwnedPngDownload(dependencies, url, filename);
      await retained.retry();
    },
  };
}

const pad = (value: number): string => String(value).padStart(2, "0");

export function createPngFilename(clock: () => Date = () => new Date()): string {
  const now = clock();
  const year = String(now.getFullYear()).padStart(4, "0");
  const date = `${year}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `神评卡片-bilibili-${date}-${time}.png`;
}

export async function exportPng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  await createExportService().exportPng(canvas, filename);
}
