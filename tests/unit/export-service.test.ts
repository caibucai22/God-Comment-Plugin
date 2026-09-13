import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PngDownloadError,
  createExportService,
  createPngFilename,
} from "../../src/export/export-service";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function canvasWith(blob: Blob | null) {
  const mimeTypes: Array<string | undefined> = [];
  const canvas = {
    toBlob(callback: BlobCallback, type?: string) {
      mimeTypes.push(type);
      callback(blob);
    },
  } as unknown as HTMLCanvasElement;
  return { canvas, mimeTypes };
}

function makeUrlHarness() {
  const revoked: string[] = [];
  let nextUrl = 0;
  return {
    createObjectURL: () => `blob:card-${++nextUrl}`,
    revokeObjectURL: (url: string) => revoked.push(url),
    revoked,
  };
}

describe("PNG export service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("formats the Bilibili filename from zero-padded local time", () => {
    expect(createPngFilename(() => new Date(2026, 0, 2, 3, 4, 5))).toBe(
      "神评卡片-bilibili-20260102-030405.png",
    );
  });

  it("creates a preview artifact without downloading and releases it explicitly", async () => {
    const urls = makeUrlHarness();
    const download = vi.fn(() => Promise.resolve(1));
    const service = createExportService({
      document,
      createObjectURL: urls.createObjectURL,
      revokeObjectURL: urls.revokeObjectURL,
      chrome: { downloads: { download } },
    });
    const { canvas } = canvasWith(new Blob(["png"]));
    Object.defineProperties(canvas, {
      width: { value: 1200 },
      height: { value: 1600 },
    });

    const artifact = await service.createPngArtifact(canvas);

    expect(artifact).toMatchObject({ url: "blob:card-1", width: 1200, height: 1600 });
    expect(download).not.toHaveBeenCalled();
    expect(urls.revoked).toEqual([]);

    artifact.release();
    artifact.release();
    expect(urls.revoked).toEqual(["blob:card-1"]);
  });

  it("downloads an existing preview artifact and revokes it after acceptance", async () => {
    const urls = makeUrlHarness();
    const download = vi.fn(() => Promise.resolve(1));
    const service = createExportService({
      document,
      createObjectURL: urls.createObjectURL,
      revokeObjectURL: urls.revokeObjectURL,
      chrome: { downloads: { download } },
    });
    const artifact = await service.createPngArtifact(canvasWith(new Blob(["png"])).canvas);

    await service.downloadPngArtifact(artifact, "card.png");

    expect(download).toHaveBeenCalledWith(
      { url: "blob:card-1", filename: "card.png", saveAs: true },
      expect.any(Function),
    );
    expect(urls.revoked).toEqual(["blob:card-1"]);
  });

  it("pads years below 1000 to exactly four digits", () => {
    const date = new Date(0);
    date.setFullYear(7, 0, 2);
    date.setHours(3, 4, 5, 0);

    expect(createPngFilename(() => date)).toBe("神评卡片-bilibili-00070102-030405.png");
  });

  it("requests an image/png Blob and revokes its URL only after Chrome accepts the download", async () => {
    const accepted = deferred<number>();
    const downloads: Array<{ url: string; filename: string; saveAs: boolean }> = [];
    const urls = makeUrlHarness();
    const service = createExportService({
      document,
      createObjectURL: urls.createObjectURL,
      revokeObjectURL: urls.revokeObjectURL,
      chrome: {
        downloads: {
          download(options: { url: string; filename: string; saveAs: boolean }) {
            downloads.push(options);
            return accepted.promise;
          },
        },
      },
    });
    const { canvas, mimeTypes } = canvasWith(new Blob(["png"]));
    const exporting = service.exportPng(canvas, "card.png");

    await vi.waitFor(() => expect(downloads).toHaveLength(1));
    expect(mimeTypes).toEqual(["image/png"]);
    expect(downloads).toEqual([{ url: "blob:card-1", filename: "card.png", saveAs: true }]);
    expect(urls.revoked).toEqual([]);

    accepted.resolve(42);
    await exporting;
    expect(urls.revoked).toEqual(["blob:card-1"]);
  });

  it("waits for a successful Chrome callback before revoking the Object URL", async () => {
    let acceptDownload: (() => void) | undefined;
    const urls = makeUrlHarness();
    const service = createExportService({
      document,
      createObjectURL: urls.createObjectURL,
      revokeObjectURL: urls.revokeObjectURL,
      chrome: {
        runtime: {},
        downloads: {
          download(_options, callback) {
            acceptDownload = callback;
          },
        },
      },
    });

    const exporting = service.exportPng(canvasWith(new Blob(["png"])).canvas, "callback.png");
    await vi.waitFor(() => expect(acceptDownload).toBeTypeOf("function"));
    expect(urls.revoked).toEqual([]);

    acceptDownload?.();
    await exporting;
    expect(urls.revoked).toEqual(["blob:card-1"]);
  });

  it("falls back to a connected hidden anchor when the Chrome API rejects", async () => {
    const clicked: Array<{ connected: boolean; href: string; download: string; hidden: boolean }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({
        connected: this.isConnected,
        href: this.href,
        download: this.download,
        hidden: this.hidden,
      });
    });
    const urls = makeUrlHarness();
    const service = createExportService({
      document,
      createObjectURL: urls.createObjectURL,
      revokeObjectURL: urls.revokeObjectURL,
      chrome: {
        downloads: { download: () => Promise.reject(new Error("downloads denied")) },
      },
    });

    await service.exportPng(canvasWith(new Blob(["png"])).canvas, "fallback.png");

    expect(clicked).toEqual([
      { connected: true, href: "blob:card-1", download: "fallback.png", hidden: true },
    ]);
    expect(document.querySelector("a[download]")).toBeNull();
    expect(urls.revoked).toEqual(["blob:card-1"]);
  });

  it("treats chrome.runtime.lastError as failure before using the anchor fallback", async () => {
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const urls = makeUrlHarness();
    const chromeApi: {
      runtime: { lastError?: { message: string } };
      downloads: { download(options: unknown, callback: () => void): void };
    } = {
      runtime: {},
      downloads: {
        download(_options, callback) {
          chromeApi.runtime.lastError = { message: "not allowed" };
          callback();
          delete chromeApi.runtime.lastError;
        },
      },
    };
    const service = createExportService({
      document,
      createObjectURL: urls.createObjectURL,
      revokeObjectURL: urls.revokeObjectURL,
      chrome: chromeApi,
    });

    await service.exportPng(canvasWith(new Blob(["png"])).canvas, "last-error.png");

    expect(anchorClick).toHaveBeenCalledOnce();
    expect(urls.revoked).toEqual(["blob:card-1"]);
  });

  it("uses the anchor directly when chrome.downloads is absent", async () => {
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const urls = makeUrlHarness();
    const service = createExportService({
      document,
      createObjectURL: urls.createObjectURL,
      revokeObjectURL: urls.revokeObjectURL,
      chrome: null,
    });

    await service.exportPng(canvasWith(new Blob(["png"])).canvas, "anchor.png");

    expect(anchorClick).toHaveBeenCalledOnce();
    expect(document.querySelector("a[download]")).toBeNull();
    expect(urls.revoked).toEqual(["blob:card-1"]);
  });

  it("rejects a null canvas Blob without allocating an Object URL", async () => {
    const createObjectURL = vi.fn(() => "blob:never");
    const service = createExportService({ document, createObjectURL });

    await expect(service.exportPng(canvasWith(null).canvas, "empty.png")).rejects.toThrow(
      "Canvas did not produce a PNG Blob",
    );
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("retains a double-failed URL for retry and revokes it after retry success", async () => {
    let chromeShouldFail = true;
    let anchorShouldFail = true;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      if (anchorShouldFail) throw new Error("anchor blocked");
    });
    const urls = makeUrlHarness();
    const service = createExportService({
      document,
      createObjectURL: urls.createObjectURL,
      revokeObjectURL: urls.revokeObjectURL,
      chrome: {
        downloads: {
          download: () => chromeShouldFail
            ? Promise.reject(new Error("api failed"))
            : Promise.resolve(7),
        },
      },
    });

    const error = await service
      .exportPng(canvasWith(new Blob(["png"])).canvas, "retry.png")
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PngDownloadError);
    expect(urls.revoked).toEqual([]);
    expect(document.querySelector("a[download]")).toBeNull();

    chromeShouldFail = false;
    anchorShouldFail = false;
    await (error as PngDownloadError).retained.retry();
    expect(urls.revoked).toEqual(["blob:card-1"]);

    (error as PngDownloadError).retained.release();
    expect(urls.revoked).toEqual(["blob:card-1"]);
  });

  it("keeps a retained URL across a failed retry and releases it exactly once on cancel", async () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("anchor blocked");
    });
    const urls = makeUrlHarness();
    const service = createExportService({
      document,
      createObjectURL: urls.createObjectURL,
      revokeObjectURL: urls.revokeObjectURL,
      chrome: {
        downloads: { download: () => Promise.reject(new Error("api failed")) },
      },
    });
    const error = await service
      .exportPng(canvasWith(new Blob(["png"])).canvas, "cancel.png")
      .catch((reason: unknown) => reason) as PngDownloadError;

    await expect(error.retained.retry()).rejects.toThrow("Unable to download PNG");
    expect(urls.revoked).toEqual([]);

    error.retained.release();
    error.retained.release();
    expect(urls.revoked).toEqual(["blob:card-1"]);
  });
});
