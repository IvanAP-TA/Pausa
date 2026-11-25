// Serves the static export the way the asset host will (PLAN 1, BUDGET T0e), for tests and for looking at the build:
//   node scripts/serve-dist.mjs [port] [distDir]        env API_ORIGIN (default http://127.0.0.1:8798) is where /api/* goes
// - a file that exists is served as is; /it -> it/index.html; /it/privacy -> it/privacy.html
// - private deep links /{l}/c/{id}, /{l}/c/{id}/settings, /{l}/join/{code} get the exported app shell (what the Worker will do)
// - everything else is the real 404 (404.html, status 404), not a soft 200
// - dist/_headers is applied the way Cloudflare applies it (scripts/headers.mjs): the CSP, HSTS, cache rules. NO_HEADERS=1 turns that off.
// - TEST HOOK, off unless asked: a request for /sw.js that carries the cookie `x-test-sw-version=<v>` gets the worker with its VERSION
//   replaced, i.e. "a new deploy" (Playwright cannot route the browser's own service-worker update fetch). e2e/pwa.spec.ts uses it.
// - /api/* is proxied to the API with the original Host, so a sign-in link the API builds points back at this origin and the
//   HttpOnly cookie is same-origin, exactly as in production.
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { headersFor, parseHeaders } from "./headers.mjs";

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".xml": "application/xml; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".map": "application/json",
};

/** Finds the exported page for a path whose segments may match `[param]` names: exact names win over dynamic ones. Returns a path relative to dist. */
function dynamicFile(dist, segs, base = "") {
  const dir = path.join(dist, base);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
  const [head, ...rest] = segs;
  const names = fs.readdirSync(dir);
  const options = [head, ...names.filter((n) => /^\[[^\]]+\](\.html)?$/.test(n) && !n.startsWith("[locale]")).map((n) => n.replace(/\.html$/, ""))];
  for (const name of [...new Set(options)]) {
    if (name !== head && !name.startsWith("[")) continue;
    if (rest.length === 0) {
      const f = `${name}.html`;
      if (names.includes(f)) return path.join(base, f).split(path.sep).join("/");
    } else {
      const hit = dynamicFile(dist, rest, path.join(base, name));
      if (hit) return hit;
    }
  }
  return null;
}

/** Maps a URL path to a file in dist (or null). Exported for the tests. */
export function resolveFile(dist, urlPath) {
  const p = decodeURIComponent(urlPath.split("?")[0]).replace(/\/+$/, "") || "/";
  const candidates = [];
  if (p === "/") candidates.push("index.html");
  else {
    const rel = p.slice(1);
    candidates.push(rel, `${rel}.html`, `${rel}/index.html`);
    // Private deep links: any segment may be a dynamic one (`/it/c/xyz/log/abc` -> it/c/[id]/log/[logId].html), as the Worker will serve it.
    if (/^(it|en|es)\//.test(rel)) {
      const dyn = dynamicFile(dist, rel.split("/"));
      if (dyn) candidates.push(dyn);
    }
  }
  for (const c of candidates) {
    const f = path.resolve(dist, c);
    if (!f.startsWith(path.resolve(dist) + path.sep)) continue; // no ../ escapes
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

export function createServer(dist, apiOrigin, { headers = process.env.NO_HEADERS !== "1" } = {}) {
  const api = new URL(apiOrigin);
  const headersFile = path.join(dist, "_headers");
  const rules = headers && fs.existsSync(headersFile) ? parseHeaders(fs.readFileSync(headersFile, "utf8")) : [];
  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    if (url.startsWith("/api/")) {
      const up = http.request({ hostname: api.hostname, port: api.port, path: url, method: req.method, headers: req.headers }, (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      });
      up.on("error", () => {
        res.writeHead(502, { "content-type": "application/json" });
        res.end('{"code":"internal","retryAfter":null}');
      });
      req.pipe(up);
      return;
    }
    const file = resolveFile(dist, url);
    const send = (f, status) => {
      const pathname = decodeURIComponent(url.split("?")[0]);
      const fromFile = headersFor(rules, pathname);
      const hasCache = Object.keys(fromFile).some((k) => k.toLowerCase() === "cache-control");
      res.writeHead(status, { "content-type": MIME[path.extname(f)] ?? "application/octet-stream", ...(hasCache ? {} : { "cache-control": "no-store" }), ...fromFile });
      fs.createReadStream(f).pipe(res);
    };
    if (file && url.split("?")[0] === "/sw.js") {
      const v = req.headers.cookie?.split(";").map((c) => c.trim().split("=")).find(([k]) => k === "x-test-sw-version")?.[1];
      if (v) {
        const body = fs.readFileSync(file, "utf8").replace(/const VERSION = "[^"]+";/, `const VERSION = "${v.replace(/[^\w-]/g, "")}";`);
        res.writeHead(200, { "content-type": MIME[".js"], ...headersFor(rules, "/sw.js") });
        return res.end(body);
      }
    }
    if (file) return send(file, 200);
    const nf = path.join(dist, "404.html");
    if (fs.existsSync(nf)) return send(nf, 404);
    res.writeHead(404).end("not found");
  });
  // WebSocket (the Serata room, /api/serate/:code/ws): the upgrade is forwarded byte for byte, with the original headers (cookie, host).
  server.on("upgrade", (req, socket, head) => {
    if (!(req.url ?? "").startsWith("/api/")) return socket.destroy();
    const up = net.connect(Number(api.port), api.hostname, () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`, ...Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`), "", ""];
      up.write(lines.join("\r\n"));
      if (head?.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    up.on("error", () => socket.destroy());
    socket.on("error", () => up.destroy());
    socket.on("close", () => up.destroy());
    up.on("close", () => socket.destroy());
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const port = Number(process.argv[2] ?? 4173);
  const dist = path.resolve(process.argv[3] ?? path.join(here, "..", "dist"));
  createServer(dist, process.env.API_ORIGIN ?? "http://127.0.0.1:8798").listen(port, "127.0.0.1", () => console.log(`serving ${dist} on http://127.0.0.1:${port}`));
}
