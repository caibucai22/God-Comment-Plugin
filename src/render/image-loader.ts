export function loadImage(url: string, timeoutMs: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const cleanup = (): void => {
      image.onload = null;
      image.onerror = null;
      if (timer !== undefined) clearTimeout(timer);
    };

    const settle = (result: { image: HTMLImageElement } | { error: Error }): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if ("image" in result) resolve(result.image);
      else reject(result.error);
    };

    image.onload = () => settle({ image });
    image.onerror = () => settle({ error: new Error(`Failed to load image: ${url}`) });
    image.crossOrigin = "anonymous";
    timer = setTimeout(
      () => settle({ error: new Error(`Image load timed out after ${timeoutMs}ms: ${url}`) }),
      Math.max(0, timeoutMs),
    );
    image.src = url;
  });
}
