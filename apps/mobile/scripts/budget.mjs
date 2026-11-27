// JavaScript budget of the static web build. Run after `expo export -p web` and postexport:  node scripts/budget.mjs [distDir]
//   - prints raw / gzip / brotli (quality 11) for the entry bundle, for the initial JS of each app shell page, and for all JS
//   - FAILS if the entry bundle or the initial JS of any app shell page is over 350 KB brotli (PLAN D8)
//   - FAILS if any public page contains a <script src> other than /public.js, an inline script other than JSON-LD, or a script
//     preload; FAILS if /public.js itself is over PUBLIC_LIMIT_KB brotli (it is hand-written, no bundler, no library)
// "Initial JS" of a page = every <script src> its HTML loads (runtime, layouts, shared chunk, entry, route chunk): what a
// visitor of that page really downloads before it runs.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

export const LIMIT_KB = 350;
export const PUBLIC_LIMIT_KB = 4;
/** Lenis 1.3.27 is 4.7 KB brotli: a little room, and a failure if an upgrade grows it. */
export const LENIS_LIMIT_KB = 6;
const PUBLIC_TAG = '<script src="/public.js"></script>';
const kb = (n) => (n / 1024).toFixed(1).padStart(8) + " KB";

export function sizes(buf) {
  return {
    raw: buf.length,
    gzip: zlib.gzipSync(buf, { level: 9 }).length,
    brotli: zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }).length,
  };
}
const sum = (list) => list.reduce((a, s) => ({ raw: a.raw + s.raw, gzip: a.gzip + s.gzip, brotli: a.brotli + s.brotli }), { raw: 0, gzip: 0, brotli: 0 });

function walkHtml(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "_expo" || e.name === "assets" || e.name === "fonts" ? [] : walkHtml(p, base);
    return e.name.endsWith(".html") ? [path.relative(base, p).split(path.sep).join("/")] : [];
  });
}
const isPublic = (rel) => /^(index|404|offline)\.html$/.test(rel) || /^(it|en|es)\/(index|privacy|terms)\.html$/.test(rel) || /^(it|en|es)\/guide\//.test(rel);

/** Public-page violations: any script that is not JSON-LD, any script preload. */
export function publicViolations(html) {
  const out = [];
  html = html.replaceAll(PUBLIC_TAG, "");
  if (/<script\b[^>]*\bsrc=/.test(html)) out.push("<script src>");
  for (const m of html.matchAll(/<script\b([^>]*)>/g)) if (!/type="application\/ld\+json"/.test(m[1])) out.push(`<script${m[1]}>`);
  if (/<link\b[^>]*as="script"/.test(html)) out.push('<link as="script">');
  return out;
}

export function measure(dist) {
  const jsDir = path.join(dist, "_expo", "static", "js", "web");
  const files = fs.readdirSync(jsDir).filter((f) => f.endsWith(".js"));
  const cache = new Map();
  const sizeOf = (f) => {
    if (!cache.has(f)) cache.set(f, sizes(fs.readFileSync(path.join(jsDir, f))));
    return cache.get(f);
  };
  const entryName = files.find((f) => f.startsWith("entry-"));
  const all = sum(files.map(sizeOf));
  const shells = [];
  const publicBad = [];
  for (const rel of walkHtml(dist)) {
    const html = fs.readFileSync(path.join(dist, rel), "utf8");
    if (isPublic(rel)) {
      const v = publicViolations(html);
      if (v.length) publicBad.push(`${rel}: ${v.join(", ")}`);
      continue;
    }
    const srcs = [...html.matchAll(/<script\b[^>]*\bsrc="\/_expo\/static\/js\/web\/([^"]+)"/g)].map((m) => decodeURIComponent(m[1]));
    shells.push({ rel, files: srcs, size: sum(srcs.map(sizeOf)) });
  }
  return { entry: entryName ? { name: entryName, ...sizeOf(entryName) } : null, all, count: files.length, shells, publicBad, sizeOf };
}

export function report(dist, log = console.log) {
  const m = measure(dist);
  const failures = [];
  log(`JavaScript budget for ${dist}  (limit ${LIMIT_KB} KB brotli)`);
  log(`                                      raw      gzip    brotli`);
  const row = (label, s) => log(`${label.padEnd(30)} ${kb(s.raw)} ${kb(s.gzip)} ${kb(s.brotli)}`);
  if (!m.entry) failures.push("no entry-*.js found: is this an export?");
  else {
    row(`entry bundle (${m.entry.name.slice(0, 14)}...)`, m.entry);
    if (m.entry.brotli > LIMIT_KB * 1024) failures.push(`entry bundle is ${(m.entry.brotli / 1024).toFixed(1)} KB brotli, over ${LIMIT_KB} KB`);
  }
  row(`all JS (${m.count} files)`, m.all);
  const worst = [...m.shells].sort((a, b) => b.size.brotli - a.size.brotli);
  const showing = worst.slice(0, 1).concat(worst.filter((s) => /^it\/(sign-in|home)\.html$/.test(s.rel)));
  for (const s of new Set(showing)) row(`initial JS ${s.rel}`, s.size);
  for (const s of m.shells)
    if (s.size.brotli > LIMIT_KB * 1024) failures.push(`${s.rel}: initial JS is ${(s.size.brotli / 1024).toFixed(1)} KB brotli, over ${LIMIT_KB} KB`);
  log(`app shell pages measured: ${m.shells.length}; public pages with JavaScript other than /public.js: ${m.publicBad.length}`);
  for (const b of m.publicBad) failures.push(`public page ships JavaScript: ${b}`);
  const pub = path.join(dist, "public.js");
  if (fs.existsSync(pub)) {
    const s = sizes(fs.readFileSync(pub));
    row("public.js (public pages)", s);
    if (s.brotli > PUBLIC_LIMIT_KB * 1024) failures.push(`public.js is ${(s.brotli / 1024).toFixed(1)} KB brotli, over ${PUBLIC_LIMIT_KB} KB`);
  }
  const lenis = path.join(dist, "lenis.js");
  if (fs.existsSync(lenis)) {
    const s = sizes(fs.readFileSync(lenis));
    row("lenis.js (landing only)", s);
    if (s.brotli > LENIS_LIMIT_KB * 1024) failures.push(`lenis.js is ${(s.brotli / 1024).toFixed(1)} KB brotli, over ${LENIS_LIMIT_KB} KB`);
  }
  return { failures, m };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist"));
  const { failures } = report(dist);
  if (failures.length) {
    console.error(`BUDGET FAILED:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
    process.exit(1);
  }
  console.log("BUDGET OK");
}
