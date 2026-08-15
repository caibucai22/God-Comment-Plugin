import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";

const FIXTURE_PATH = new URL("../fixture-page.html", import.meta.url);
const COVER = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#15233f"/>
  <circle cx="150" cy="180" r="92" fill="#76e9ff"/>
  <path d="M260 96h276v168H260z" fill="#d9a3ff"/>
</svg>`;

export interface StaticFixtureServer {
  readonly url: string;
  close(): Promise<void>;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

export async function startStaticFixtureServer(): Promise<StaticFixtureServer> {
  const fixture = await readFile(FIXTURE_PATH, "utf8");
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (pathname === "/cover.svg") {
      response.writeHead(200, {
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
        "content-type": "image/svg+xml; charset=utf-8",
      });
      response.end(COVER);
      return;
    }
    if (pathname === "/favicon.ico") {
      response.writeHead(204, { "cache-control": "no-store" });
      response.end();
      return;
    }
    if (pathname.startsWith("/video/")) {
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
      });
      response.end(fixture);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Fixture server did not expose a TCP port");
  }

  return {
    url: `http://127.0.0.1:${address.port}/video/BV1e2e`,
    close: () => closeServer(server),
  };
}
