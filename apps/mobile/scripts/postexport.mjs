// Post-export step for the static web build. Run after `expo export -p web`:  node scripts/postexport.mjs [distDir]
//
// What Expo's static export cannot do, and this does (PLAN T0e, D8):
//   a. <html lang> from the path (Expo always writes "en"), and viewport-fit=cover.
//   b. +not-found.html -> 404.html (asset host: not_found_handling "404-page").
//   c. Public pages ship no app JavaScript: <script defer src>, the inline hydrate flag and <link rel=preload as=script> are removed;
//      the one small /public.js (saved theme, signed-in redirect, Google button, parallax) goes in their <head>.
//      The app shell pages keep theirs.
//   d. sitemap.xml (public pages x 3 languages, xhtml:link alternates) and robots.txt.
//   e. Fails the build, listing every problem, if a public page lacks title / description / canonical / hreflang it,en,es,x-default.
//   f. PWA (scripts/pwa.mjs): a manifest per language, icons/manifest/iOS tags in every page's <head> (static tags: public pages stay
//      at 0 JS), og:locale:alternate, offline.html, and sw.js built from scripts/sw.template.js with THIS build's precache list.
//   g. dist/_headers from public/_headers: the CSP script hashes are computed from the inline scripts of the export, and the build
//      fails if a script is not covered or the policy lost a required directive.
// It also removes files the export emits that must never be served: the [locale] templates, the (app) group duplicates,
// Expo's dev-only _sitemap page and the guide template (an unknown slug has to be a real 404).
// Node builtins only.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BLOCKED_AGENTS, CONTENT_UPDATED, DEFAULT_LOCALE, GUIDE_SLUGS, LOCALES, PUBLIC_SUBPATHS, SITE_URL } from "../src/seo/site.ts";
import { addInstallTags, buildManifest, buildOfflineHtml, buildSw, checkHeaders, fillHeaders, inlineScriptHashes, manifestPath, ogLocaleAlternates, precacheList, shellPages } from "./pwa.mjs";

const OG_LOCALE = { it: "it_IT", en: "en_US", es: "es_ES" };
const here = path.dirname(fileURLToPath(import.meta.url));

const L = LOCALES.join("|");
const re = (s) => new RegExp(s);
const PUBLIC = [
  [re(`^(${L})/index\\.html$`), (m) => ({ locale: m[1], sub: "" })],
  [re(`^(${L})/guide/index\\.html$`), (m) => ({ locale: m[1], sub: "/guide" })],
  [re(`^(${L})/guide/([a-z0-9-]+)\\.html$`), (m) => ({ locale: m[1], sub: `/guide/${m[2]}` })],
  [re(`^(${L})/(privacy|terms)\\.html$`), (m) => ({ locale: m[1], sub: `/${m[2]}` })],
];
const SHELL = [
  re(`^(${L})/(sign-in|home|account|review)\\.html$`),
  re(`^(${L})/admin/(metrics|reports)\\.html$`),
  re(`^(${L})/c/\\[id\\](/settings)?\\.html$`),
  re(`^(${L})/join/\\[code\\]\\.html$`),
  /^auth\.html$/,
  // diary / social / profile / statistics screens
  re(`^(${L})/(diary|log|notifications|me)\\.html$`),
  re(`^(${L})/log/\\[logId\\]\\.html$`),
  re(`^(${L})/me/(profile|settings|account|circles)\\.html$`),
  re(`^(${L})/t/\\[mediaId\\]\\.html$`),
  re(`^(${L})/c/\\[id\\]/(feed|ranking|insights|members)\\.html$`),
  re(`^(${L})/c/\\[id\\]/log/\\[logId\\]\\.html$`),
  re(`^(${L})/c/\\[id\\]/log/\\[logId\\]/edit\\.html$`),
  re(`^(${L})/c/\\[id\\]/m/\\[mediaId\\]\\.html$`),
  re(`^(${L})/c/\\[id\\]/people/\\[userId\\]\\.html$`),
  re(`^(${L})/person/\\[key\\]\\.html$`),
  re(`^(${L})/c/\\[id\\]/person/\\[key\\]\\.html$`),
  // Serata / lists / import (the other engineer's screens; listed here so the shared export passes while both trees are in flux)
  re(`^(${L})/(lists|import|imports)(/\\[[a-zA-Z]+\\])?\\.html$`),
  re(`^(${L})/c/\\[id\\]/serate(/\\[[a-zA-Z]+\\])?\\.html$`),
  re(`^(${L})/s/\\[code\\](/[a-z]+)?\\.html$`),
];
// Static pages that are not for search engines: no JavaScript like the public ones, but noindex and not in the sitemap.
const QUIET = re(`^(${L})/slow-down\\.html$`);
const JUNK = [/^\[locale\]/, /\(app\)/, /^_sitemap\.html$/, /^(it|en|es)\/guide\/\[slug\]\.html$/];

/** What a built HTML file is: a public page (zero JS), a quiet page (zero JS, noindex), an app shell page (keeps JS), the 404, junk to delete, or unknown. */
export function classify(rel) {
  rel = rel.split(path.sep).join("/");
  if (JUNK.some((r) => r.test(rel))) return { kind: "junk" };
  if (rel === "offline.html") return { kind: "offline" }; // written by this script (the service worker's fallback page)
  if (rel === "index.html") return { kind: "public", locale: DEFAULT_LOCALE, sub: "", chooser: true };
  if (rel === "+not-found.html" || rel === "404.html") return { kind: "notfound", locale: DEFAULT_LOCALE };
  const nf = re(`^(${L})/404\.html$`).exec(rel);
  if (nf) return { kind: "notfound", locale: nf[1] };
  const quiet = QUIET.exec(rel);
  if (quiet) return { kind: "quiet", locale: quiet[1] };
  for (const [r, f] of PUBLIC) {
    const m = r.exec(rel);
    if (m) return { kind: "public", ...f(m) };
  }
  for (const r of SHELL) {
    const m = r.exec(rel);
    if (m) return { kind: "shell", locale: LOCALES.includes(m[1]) ? m[1] : DEFAULT_LOCALE };
  }
  return { kind: "unknown" };
}

/**
 * 404.html. Expo statically renders +not-found as an EMPTY page (the not-found screen is chosen by the client router after JS runs;
 * measured: body has no content, and generateMetadata is ignored), which would make every missing URL a blank page for crawlers and
 * for visitors without JavaScript. So the 404 is written here: the same theme CSS as the other pages, ONE language, a link back,
 * noindex, no scripts. One file per locale (`it/404.html`...): the asset host serves the nearest 404.html up the path, so
 * `/en/whatever` answers in English. The root `404.html` (no locale in the URL) uses the default locale, as legacy did.
 */
export function build404Html({ css, messages, locale = DEFAULT_LOCALE }) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const m = messages[locale].errors;
  const blocks = `<section lang="${locale}" class="blk"><h1>${esc(m.notFoundTitle)}</h1><p>${esc(m.notFoundBody)}</p><a class="btn pri" href="/${locale}">${esc(m.home)}</a></section>`;
  const own = `body{margin:0}main{max-width:720px;margin:0 auto;padding:64px 16px;font-family:Barlow_400,ui-sans-serif,system-ui,sans-serif;line-height:1.55}.mk{margin:0 0 16px;font-family:SofiaSansExtraCondensed_400,ui-sans-serif,sans-serif;text-transform:uppercase;font-size:36px;line-height:1;color:var(--c-ink)}.blk{padding:24px 0;border-top:1px solid var(--c-rule)}.blk:first-child{border-top:0}h1,h2{font-family:SofiaSansExtraCondensed_200,ui-sans-serif,sans-serif;font-weight:200;text-transform:uppercase;line-height:1.08;margin:0 0 12px}h1{font-size:clamp(3.75rem,3.3rem + 1.9vw,4.5rem)}h2{font-size:2rem}p{margin:0 0 16px;color:var(--c-ink-2,var(--c-ink2));max-width:65ch}.btn{display:inline-flex;align-items:center;min-height:44px;padding:0 24px;border:1px solid var(--c-ink);font-family:SofiaSansExtraCondensed_400,ui-sans-serif,sans-serif;text-transform:uppercase;font-size:20px}.btn.pri{background:var(--c-accent);border-color:var(--c-accent);color:var(--c-accentInk)}`;
  return `<!DOCTYPE html><html lang="${locale}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/><title>${esc(m.notFoundTitle)} · Pausa</title><meta name="robots" content="noindex, nofollow"/><meta name="theme-color" content="#001113"/><link rel="icon" href="/favicon.ico"/><style>${css}${own}</style>${PUBLIC_SCRIPT}</head><body><main><p class="mk">Pausa</p>${blocks}</main></body></html>`;
}

/** The theme/font CSS Expo already wrote into a page of this build (so the 404 looks like the rest without duplicating the tokens). */
export const extractThemeCss = (html) => /<style id="pausa-css">([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";

export const setLang = (html, lang) => html.replace(/<html lang="[^"]*"/, `<html lang="${lang}"`);

export const patchViewport = (html) =>
  html.replace(/(<meta name="viewport" content=")([^"]*)(")/, (_m, a, c, z) => (/viewport-fit/.test(c) ? a + c + z : `${a}${c}, viewport-fit=cover${z}`));

/**
 * The one script public pages carry (public/public.js: saved theme, signed-in redirect, Google button, parallax). A blocking tag at
 * the end of <head>, so the saved theme is on before the first paint. Everything else on a public page stays script-free.
 */
export const PUBLIC_SCRIPT = '<script src="/public.js"></script>';
/** The Lenis UMD build (sets `globalThis.Lenis`), without its source-map comment (the map is not shipped). */
export const lenisScript = () =>
  fs.readFileSync(path.join(here, "..", "node_modules", "lenis", "dist", "lenis.min.js"), "utf8").replace(/\n\/\/# sourceMappingURL=.*\s*$/, "\n");
export const addPublicScript = (html) => html.replace("</head>", `${PUBLIC_SCRIPT}</head>`);
/** Scripts with a `src` other than the public one: none may be left on a public page. */
const foreignScripts = (html) => [...html.matchAll(/<script\b[^>]*\bsrc="([^"]*)"[^>]*>/g)].map((m) => m[1]).filter((src) => src !== "/public.js");
const inlineScripts = (html) => [...html.matchAll(/<script\b(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>/g)];

/** Removes every script except JSON-LD, and every script preload. */
export function stripScripts(html) {
  return html
    .replace(/<script\b(?![^>]*type="application\/ld\+json")[^>]*>[\s\S]*?<\/script>/g, "")
    .replace(/<link\b[^>]*\brel="(?:modulepreload|preload)"[^>]*\bas="script"[^>]*\/?>/g, "")
    .replace(/<link\b[^>]*\bas="script"[^>]*\brel="(?:modulepreload|preload)"[^>]*\/?>/g, "");
}

const attr = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Reads what a crawler reads from the head. */
export function readHead(html) {
  const head = html.slice(0, html.indexOf("</head>"));
  const tags = (name) => [...head.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map((m) => m[0]);
  const metas = tags("meta");
  const metaBy = (key, val) => metas.find((t) => attr(t, key) === val);
  return {
    lang: /<html lang="([^"]*)"/.exec(html)?.[1],
    title: /<title>([\s\S]*?)<\/title>/.exec(head)?.[1],
    description: metaBy("name", "description") && decode(attr(metaBy("name", "description"), "content") ?? ""),
    robots: metaBy("name", "robots") && attr(metaBy("name", "robots"), "content"),
    canonical: tags("link").filter((t) => attr(t, "rel") === "canonical").map((t) => attr(t, "href")),
    hreflang: Object.fromEntries(tags("link").filter((t) => attr(t, "rel") === "alternate" && attr(t, "hreflang")).map((t) => [attr(t, "hreflang"), attr(t, "href")])),
    themeColor: metaBy("name", "theme-color") && attr(metaBy("name", "theme-color"), "content"),
    viewport: metaBy("name", "viewport") && attr(metaBy("name", "viewport"), "content"),
    h1: (html.match(/<h1\b/g) ?? []).length,
  };
}

/** Problems with an indexable page (empty list = fine). Checks INVENTORY Parte 4 items 9-14, 16, 17 and 19 that apply to static HTML. */
export function checkPublicPage(html, { locale, sub, chooser }) {
  const h = readHead(html);
  const url = (l) => `${SITE_URL}/${l}${sub}`;
  const bad = [];
  if (h.lang !== locale) bad.push(`<html lang> is "${h.lang}", expected "${locale}"`);
  if (!h.title || h.title.trim() === "" || h.title === "Pausa" && !chooser) bad.push(`missing or generic <title> ("${h.title ?? ""}")`);
  if (!h.description || h.description.trim().length < 20) bad.push("missing or too short <meta name=description>");
  if (h.robots && /noindex/i.test(h.robots)) bad.push(`robots says "${h.robots}" on an indexable page`);
  const expectedCanonical = chooser ? `${SITE_URL}/` : url(locale);
  if (h.canonical.length !== 1) bad.push(`expected exactly one canonical, found ${h.canonical.length}`);
  else if (h.canonical[0] !== expectedCanonical) bad.push(`canonical is ${h.canonical[0]}, expected ${expectedCanonical}`);
  for (const l of LOCALES) {
    const want = url(l);
    if (!h.hreflang[l]) bad.push(`missing hreflang="${l}"`);
    else if (h.hreflang[l] !== want) bad.push(`hreflang ${l} is ${h.hreflang[l]}, expected ${want}`);
  }
  const wantDefault = chooser ? `${SITE_URL}/` : url(DEFAULT_LOCALE);
  if (!h.hreflang["x-default"]) bad.push('missing hreflang="x-default"');
  else if (h.hreflang["x-default"] !== wantDefault) bad.push(`hreflang x-default is ${h.hreflang["x-default"]}, expected ${wantDefault}`);
  if (h.themeColor !== "#001113") bad.push(`theme-color is ${h.themeColor}`);
  if (!h.viewport || !/viewport-fit=cover/.test(h.viewport)) bad.push("viewport lacks viewport-fit=cover");
  if (h.h1 !== 1) bad.push(`expected one <h1>, found ${h.h1}`);
  // Open Graph / Twitter completeness (GAPS M10): url, image, locale (+ the other two languages), a card with an image
  const head = html.slice(0, html.indexOf("</head>"));
  const meta = (attrName, val) => new RegExp(`<meta ${attrName}="${val}" content="([^"]*)"`).exec(head)?.[1];
  if (meta("property", "og:url") !== expectedCanonical) bad.push(`og:url is ${meta("property", "og:url")}, expected ${expectedCanonical}`);
  if (!/^https:\/\/[^"]+\/icons\/icon-512\.png$/.test(meta("property", "og:image") ?? "")) bad.push("og:image missing or not the absolute share image");
  if (!meta("name", "twitter:card") || !meta("name", "twitter:image")) bad.push("twitter:card / twitter:image missing");
  if (!chooser) {
    if (!meta("property", "og:locale")) bad.push("og:locale missing");
    if ((head.match(/property="og:locale:alternate"/g) ?? []).length !== LOCALES.length - 1) bad.push("og:locale:alternate must list the other languages");
  }
  for (const src of foreignScripts(html)) bad.push(`contains <script src="${src}">: a public page ships only ${PUBLIC_SCRIPT}`);
  if (inlineScripts(html).length) bad.push("contains an inline script: a public page ships only /public.js");
  if (!html.includes(PUBLIC_SCRIPT)) bad.push(`lacks ${PUBLIC_SCRIPT}`);
  if (/<link\b[^>]*as="script"/.test(html)) bad.push("contains a script preload");
  return bad;
}

export function check404(html, { locale } = { locale: DEFAULT_LOCALE }) {
  const bad = [];
  const h = readHead(html);
  if (!h.robots || !/noindex/i.test(h.robots)) bad.push("the 404 must be noindex");
  if (foreignScripts(html).length || inlineScripts(html).length) bad.push(`the 404 ships no JavaScript but ${PUBLIC_SCRIPT}`);
  if (!h.title) bad.push("the 404 has no <title>");
  if (h.h1 !== 1) bad.push(`the 404 needs one <h1>, found ${h.h1}`);
  if (h.lang !== locale) bad.push(`the 404 <html lang> is "${h.lang}", expected "${locale}"`);
  for (const l of LOCALES) {
    const has = new RegExp(`<section lang="${l}"`).test(html);
    if (l === locale && !has) bad.push(`the 404 lacks the ${l} message`);
    if (l !== locale && has) bad.push(`the ${locale} 404 must not show the ${l} message`);
  }
  return bad;
}

/** The "slow down" page: static like a public page, but it must never be indexed. */
export function checkQuietPage(html, { locale }) {
  const h = readHead(html);
  const bad = [];
  if (h.lang !== locale) bad.push(`<html lang> is "${h.lang}", expected "${locale}"`);
  if (!h.robots || !/noindex/i.test(h.robots)) bad.push(`a quiet page must be noindex (robots: ${h.robots ?? "none"})`);
  if (!h.title || h.title.trim() === "" || h.title === "Pausa") bad.push("a quiet page needs its own <title>");
  if (h.h1 !== 1) bad.push(`expected one <h1>, found ${h.h1}`);
  for (const src of foreignScripts(html)) bad.push(`contains <script src="${src}">: a quiet page ships only ${PUBLIC_SCRIPT}`);
  if (inlineScripts(html).length) bad.push("contains an inline script: a quiet page ships only /public.js");
  if (/<link\b[^>]*as="script"/.test(html)) bad.push("contains a script preload");
  return bad;
}

export function checkShellPage(html) {
  const h = readHead(html);
  const bad = [];
  if (!h.robots || !/noindex/i.test(h.robots)) bad.push(`app shell page without noindex (robots: ${h.robots ?? "none"})`);
  if (!/<script\b[^>]*\bsrc=/.test(html)) bad.push("app shell page lost its JavaScript");
  return bad;
}

/** `sitemap.xml`: every public page in every language, each with its alternates (INVENTORY 1.5). Order: landing, guides, legal. */
export function sitemapXml() {
  const urls = [];
  for (const sub of PUBLIC_SUBPATHS)
    for (const l of LOCALES) {
      const alt = [...LOCALES.map((x) => [x, `${SITE_URL}/${x}${sub}`]), ["x-default", `${SITE_URL}/${DEFAULT_LOCALE}${sub}`]]
        .map(([code, href]) => `    <xhtml:link rel="alternate" hreflang="${code}" href="${href}"/>`)
        .join("\n");
      urls.push(`  <url>\n    <loc>${SITE_URL}/${l}${sub}</loc>\n    <lastmod>${CONTENT_UPDATED}</lastmod>\n${alt}\n  </url>`);
    }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`;
}

/** `robots.txt`: AI crawlers out, private prefixes out, everything else in (INVENTORY 1.4). */
export function robotsTxt() {
  const blocked = BLOCKED_AGENTS.map((a) => `User-Agent: ${a}`).join("\n") + "\nDisallow: /\n";
  const disallow = ["/api/", "/*/c/", "/*/join/", "/*/sign-in", "/*/slow-down", "/*/home", "/*/account", "/auth"].map((p) => `Disallow: ${p}`).join("\n");
  return `${blocked}\nUser-Agent: *\nAllow: /\n${disallow}\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? (e.name === "_expo" || e.name === "assets" || e.name === "fonts" ? [] : walk(p, base)) : [path.relative(base, p).split(path.sep).join("/")];
  });
}

/** @param {string} dist  @param {{ env?: Record<string, string | undefined>, log?: (m: string) => void, warn?: (m: string) => void }} [opts] */
export function run(dist, { env = process.env, log = console.log, warn = console.warn } = {}) {
  if (!fs.existsSync(dist)) throw new Error(`No export at ${dist}: run "expo export -p web" first.`);
  const problems = [];

  // b. 404
  const nf = path.join(dist, "+not-found.html");
  if (fs.existsSync(nf)) fs.renameSync(nf, path.join(dist, "404.html"));

  // junk first, so it never reaches the checks
  const files = walk(dist).filter((f) => f.endsWith(".html"));
  const removed = [];
  for (const rel of files) {
    if (classify(rel).kind === "junk") {
      fs.rmSync(path.join(dist, rel));
      removed.push(rel);
    }
  }
  // empty directories left behind by the removals
  for (const d of ["[locale]", ...LOCALES.map((l) => `${l}/(app)`)]) fs.rmSync(path.join(dist, d), { recursive: true, force: true });

  // 404.html is generated, not taken from Expo (see build404Html). Theme CSS comes from the exported landing page.
  const themeSource = path.join(dist, "it", "index.html");
  const css = fs.existsSync(themeSource) ? extractThemeCss(fs.readFileSync(themeSource, "utf8")) : "";
  const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(fs.readFileSync(path.join(here, "..", "..", "..", "packages", "messages", `${l}.json`), "utf8"))]));
  // Lenis (smooth scrolling on the landing, as in legacy): copied from the pinned package, loaded by /public.js only on the landing
  // and only without "reduce motion". Not linked from any HTML.
  fs.writeFileSync(path.join(dist, "lenis.js"), lenisScript());
  fs.writeFileSync(path.join(dist, "404.html"), build404Html({ css, messages }));
  for (const l of LOCALES) {
    fs.mkdirSync(path.join(dist, l), { recursive: true });
    fs.writeFileSync(path.join(dist, l, "404.html"), build404Html({ css, messages, locale: l }));
  }

  const counts = { public: 0, quiet: 0, shell: 0, notfound: 0 };
  const htmls = [];
  for (const rel of walk(dist).filter((f) => f.endsWith(".html"))) {
    const info = classify(rel);
    const file = path.join(dist, rel);
    if (info.kind === "offline") continue;
    if (info.kind === "unknown") {
      problems.push(`${rel}: not classified. Add it to PUBLIC or SHELL in scripts/postexport.mjs (and to src/seo/site.ts if it is public).`);
      continue;
    }
    let html = fs.readFileSync(file, "utf8");
    html = patchViewport(setLang(html, info.locale));
    if (info.kind === "public" || info.kind === "notfound" || info.kind === "quiet") html = stripScripts(html);
    if (info.kind !== "shell" && !html.includes(PUBLIC_SCRIPT)) html = addPublicScript(html);
    html = addInstallTags(html, info.locale);
    if (info.kind === "public") html = ogLocaleAlternates(html, info.locale, OG_LOCALE);
    fs.writeFileSync(file, html);
    htmls.push(html);
    counts[info.kind]++;
    const bad =
      info.kind === "public" ? checkPublicPage(html, info) : info.kind === "shell" ? checkShellPage(html) : info.kind === "quiet" ? checkQuietPage(html, info) : check404(html, info);
    for (const b of bad) problems.push(`${rel}: ${b}`);
  }

  // every page the sitemap lists must exist
  for (const sub of PUBLIC_SUBPATHS)
    for (const l of LOCALES) {
      const f = path.join(dist, l, sub === "" ? "index.html" : sub === "/guide" ? "guide/index.html" : `${sub.slice(1)}.html`);
      if (!fs.existsSync(f)) problems.push(`${path.relative(dist, f).split(path.sep).join("/")}: listed in the sitemap but not exported`);
    }
  for (const slug of GUIDE_SLUGS) if (!/^[a-z0-9-]+$/.test(slug)) problems.push(`guide slug "${slug}" is not URL-safe`);

  if (problems.length) {
    const msg = `postexport FAILED with ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join("\n")}`;
    throw new Error(msg);
  }

  // f. PWA files
  for (const l of LOCALES) fs.writeFileSync(path.join(dist, manifestPath(l).slice(1)), JSON.stringify(buildManifest(l, messages), null, 2));
  fs.writeFileSync(path.join(dist, "offline.html"), buildOfflineHtml({ css }));
  const shell = shellPages();
  const shellHtml = fs.readFileSync(path.join(dist, "it", "home.html"), "utf8");
  const sw = buildSw(fs.readFileSync(path.join(here, "sw.template.js"), "utf8"), { assets: precacheList(dist), shell, shellHtml });
  fs.writeFileSync(path.join(dist, "sw.js"), sw.source);

  // g. headers
  const hashes = inlineScriptHashes(htmls);
  const headers = fillHeaders(fs.readFileSync(path.join(here, "..", "public", "_headers"), "utf8"), { hashes });
  const headerProblems = checkHeaders(headers, hashes);
  if (headerProblems.length) throw new Error(["postexport FAILED: _headers:", ...headerProblems.map((p) => `  - ${p}`)].join("\n"));
  fs.writeFileSync(path.join(dist, "_headers"), headers);

  fs.writeFileSync(path.join(dist, "sitemap.xml"), sitemapXml());
  fs.writeFileSync(path.join(dist, "robots.txt"), robotsTxt());

  const missing = [!env.LEGAL_ENTITY && "LEGAL_ENTITY", !env.CONTACT_EMAIL && "CONTACT_EMAIL"].filter(Boolean);
  if (missing.length)
    warn(`WARNING: ${missing.join(" and ")} not set at build time: /privacy and /terms show a visible placeholder instead of the controller and contact. Set them before launch (PLAN D7).`);

  log(`postexport OK: ${counts.public} public pages (only /public.js), ${counts.shell} app shell pages, 404.html, sitemap.xml (${PUBLIC_SUBPATHS.length * LOCALES.length} URLs), robots.txt; removed ${removed.length} stray files; PWA: 3 manifests, offline.html, sw.js ${sw.version} (${precacheList(dist).length} precached files); _headers with ${hashes.length} script hash(es).`);
  return { counts, removed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist"));
  try {
    run(dist);
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(1);
  }
}
