import { buildApp } from "./app";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

// Local development secrets live at the repository root and are intentionally
// ignored by Git. Load them before constructing the app so Grok and provider
// adapters see the same environment whether the API is started from the root
// script or from this workspace package. Deployment environments continue to
// win because `loadEnvFile` does not replace existing process variables.
try {
  loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  if (code !== "ENOENT") throw error;
}

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const app = buildApp();

if (process.env.SERVE_WEB === "true") {
  const webRoot = fileURLToPath(new URL("../../mobile/dist/", import.meta.url));
  const contentTypes: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".webmanifest": "application/manifest+json",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };

  app.setNotFoundHandler(async (request, reply) => {
    if (request.method !== "GET" && request.method !== "HEAD")
      return reply.code(404).send({ code: "NOT_FOUND" });
    const pathname = decodeURIComponent(request.url.split("?")[0] ?? "/");
    const safePath = normalize(pathname).replace(/^([/\\]*\.\.[/\\])+/, "");
    const base = join(webRoot, safePath);
    for (const candidate of [
      base,
      `${base}.html`,
      join(base, "index.html"),
      join(webRoot, "index.html"),
    ]) {
      if (!resolve(candidate).startsWith(resolve(webRoot))) continue;
      try {
        if (!(await stat(candidate)).isFile()) continue;
        return reply
          .header(
            "cache-control",
            candidate.endsWith("sw.js") ? "no-cache" : "public, max-age=300",
          )
          .type(contentTypes[extname(candidate)] ?? "application/octet-stream")
          .send(createReadStream(candidate));
      } catch {
        // Try the next static-export route candidate.
      }
    }
    return reply.code(404).type("text/plain").send("Not found");
  });
}

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
