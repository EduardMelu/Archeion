// Loopback-only server: packaged immutable assets plus explicit, revalidated data routes.
// No route reads arbitrary repository files.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import sirv from "sirv";

export interface ServeOptions {
  outDir: string;
  port: number;
  /** Rebuilds with explicit baselines, from the viewer's baseline control. */
  rebuild?: (bases: Record<string, string>) => Promise<void>;
}

function viewerAssets(): string {
  const packaged = new URL("./viewer/", import.meta.url);
  const dir = existsSync(packaged) ? packaged : new URL("../../viewer/dist/", import.meta.url);
  return decodeURIComponent(dir.pathname).replace(/^\/([A-Za-z]:)/, "$1");
}

const DATA_ROUTES: Record<string, string> = {
  "/data/graph.json": "graph.json",
  "/data/build-info.json": "build-info.json",
};

const MAX_BODY_BYTES = 64 * 1024;

async function readBody(request: http.IncomingMessage): Promise<string | null> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) return null;
  }
  return body;
}

export function startServer(options: ServeOptions): Promise<{ url: string; server: http.Server }> {
  const assets = sirv(viewerAssets(), {
    etag: true,
    single: true,
    setHeaders(response, pathname) {
      const hashed = pathname.startsWith("/assets/");
      response.setHeader(
        "Cache-Control",
        hashed ? "public, max-age=31536000, immutable" : "no-cache",
      );
    },
  });

  const server = http.createServer(async (request, response) => {
    const { port } = server.address() as { port: number };
    // Refuse DNS rebinding: only the loopback names this server was started on are valid.
    const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!allowed.includes(request.headers.host ?? "")) {
      response.writeHead(403).end("Forbidden host");
      return;
    }

    const pathname = new URL(request.url ?? "/", `http://${request.headers.host}`).pathname;
    const dataFile = DATA_ROUTES[pathname];
    if (dataFile) {
      const content = await readFile(path.join(options.outDir, dataFile)).catch(() => null);
      if (!content) {
        response.writeHead(404, { "Cache-Control": "no-store" }).end("Not built yet");
        return;
      }
      response
        .writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" })
        .end(content);
      return;
    }

    if (pathname === "/api/rebuild") {
      const origin = request.headers.origin;
      const sameOrigin =
        origin !== undefined && allowed.some((host) => origin === `http://${host}`);
      if (request.method !== "POST" || !sameOrigin || !options.rebuild) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = await readBody(request);
      let bases: unknown;
      try {
        bases = JSON.parse(body ?? "")?.bases;
      } catch {
        bases = null;
      }
      const valid =
        bases &&
        typeof bases === "object" &&
        Object.values(bases).every(
          (ref) => typeof ref === "string" && ref.length > 0 && !ref.startsWith("-"),
        );
      if (!valid) {
        response.writeHead(400).end('Expected {"bases": {"<repo>": "<git reference>"}}');
        return;
      }
      await options.rebuild(bases as Record<string, string>);
      response.writeHead(204).end();
      return;
    }

    assets(request, response);
  });

  return new Promise((resolve, reject) => {
    const listen = (port: number, fallback: boolean) => {
      server.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE" && fallback) listen(0, false);
        else reject(error);
      });
      server.listen(port, "127.0.0.1", () => {
        const { port: actual } = server.address() as { port: number };
        resolve({ url: `http://127.0.0.1:${actual}/`, server });
      });
    };
    listen(options.port, true);
  });
}
