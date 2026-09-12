#!/usr/bin/env node
/**
 * Serves the built web app with the API proxied onto the same origin.
 *
 * Two things `python -m http.server` does not do, both of which the PWA needs:
 *
 * - extensionless routing, so `/map` serves `map.html` from the static export;
 * - a `/v1/*` proxy to the API, so the app and its API share an origin. The web
 *   build deliberately uses a relative API base for that reason — without the
 *   proxy every request fails CORS preflight.
 *
 *   corepack pnpm build:web      # produces apps/mobile/dist
 *   corepack pnpm dev:api        # API on :3000
 *   corepack pnpm serve:web      # this, on :8088
 *
 * Browser geolocation and service workers require a secure context, so
 * localhost works but a LAN address over plain HTTP does not. For a phone, put
 * an HTTPS tunnel in front (`cloudflared tunnel --url http://localhost:8088`)
 * or run the app with EXPO_PUBLIC_LOCATION_PROVIDER=SIMULATED, which needs no
 * location permission at all.
 */
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(process.env.ROOT ?? join(here, "../apps/mobile/dist"));
const PORT = Number(process.env.PORT ?? 8088);
const API = process.env.API ?? "http://localhost:3000";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function resolveFile(pathname) {
  // Never let a request escape the export directory.
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const base = join(ROOT, safe);

  for (const candidate of [
    base,
    `${base}.html`,
    join(base, "index.html"),
    join(ROOT, "index.html"),
  ]) {
    if (!resolve(candidate).startsWith(ROOT)) continue;
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function readBody(request) {
  return new Promise((done) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => done(Buffer.concat(chunks)));
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (url.pathname.startsWith("/v1/") || url.pathname === "/health") {
    try {
      const upstream = await fetch(`${API}${url.pathname}${url.search}`, {
        method: request.method,
        headers: { ...request.headers, host: new URL(API).host },
        body: ["GET", "HEAD"].includes(request.method ?? "")
          ? undefined
          : await readBody(request),
      });
      response.writeHead(upstream.status, {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json",
      });
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      response.writeHead(502, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          error: {
            code: "API_UNREACHABLE",
            message: `Could not reach the API at ${API}. Is \`pnpm dev:api\` running?`,
          },
        }),
      );
    }
    return;
  }

  const file = await resolveFile(decodeURIComponent(url.pathname));
  if (!file) {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": types[extname(file)] ?? "application/octet-stream",
    // The service worker must never be cached, or updates never land.
    "cache-control": file.endsWith("sw.js") ? "no-cache" : "no-store",
  });
  createReadStream(file).pipe(response);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Set PORT to use another.`);
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, () => {
  console.log(`SideQuest web:  http://localhost:${PORT}`);
  console.log(`serving:        ${ROOT}`);
  console.log(`API proxied to: ${API}`);
});
