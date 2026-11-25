// Pure helpers of the build for installability, offline and security headers. Used by scripts/postexport.mjs and by tests/pwa.test.ts.
// Node builtins only.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { OFFLINE_TEXTS } from "../src/pwa/offline-texts.ts";
import { DEFAULT_LOCALE, LOCALES, SITE_URL } from "../src/seo/site.ts";

/** Sources: dark tokens (see tests/pwa.test.ts, which checks them against src/theme/tokens.ts) and the existing THEME_COLOR. */
export const THEME_COLOR = "#001113";
export const BACKGROUND_COLOR = "#001113";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** `manifest-it.webmanifest` etc.: one per language so the installed app opens in the language it was installed from. */
export const manifestPath = (locale) => `/manifest-${locale}.webmanifest`;

export function buildManifest(locale, messages) {
  const m = messages[locale];
  return {
    id: "/",
    name: "Pausa",
    short_name: "Pausa",
    description: m.landing.meta.siteDescription,
    lang: locale,
    dir: "ltr",
    start_url: `/${locale}/home`,
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    categories: ["entertainment", "social", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: m.tabs.log, short_name: m.tabs.logShort, url: `/${locale}/log`, icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: m.tabs.diary, url: `/${locale}/diary`, icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}

/** What goes in <head> of every page for installability: manifest, icons, iOS standalone meta. Static tags: public pages stay at 0 JS. */
export function installTags(locale) {
  return [
    `<link rel="manifest" href="${manifestPath(locale)}"/>`,
    `<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png"/>`,
    `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"/>`,
    `<meta name="mobile-web-app-capable" content="yes"/>`,
    `<meta name="apple-mobile-web-app-capable" content="yes"/>`,
    `<meta name="apple-mobile-web-app-title" content="Pausa"/>`,
    `<meta name="apple-mobile-web-app-status-bar-style" content="black"/>`,
  ].join("");
}

/** Adds the install tags once, before </head> (idempotent: running postexport twice must not duplicate them). */
export function addInstallTags(html, locale) {
  if (html.includes('rel="manifest"')) return html;
  return html.replace("</head>", `${installTags(locale)}</head>`);
}

/** `<meta property="og:locale:alternate">` for the other two languages and an `og:image` (the 512 icon: there is no social card yet). */
export function ogLocaleAlternates(html, locale, ogLocale) {
  if (html.includes('property="og:locale:alternate"')) return html;
  const others = LOCALES.filter((l) => l !== locale).map((l) => `<meta property="og:locale:alternate" content="${ogLocale[l]}"/>`).join("");
  return html.replace(/(<meta property="og:locale" content="[^"]*"\/>)/, `$1${others}`);
}

export const sha256 = (s) => crypto.createHash("sha256").update(s).digest("base64");

/** CSP hashes for every inline script that is executed (JSON-LD is data, not script: the browser never runs or checks it). */
export function inlineScriptHashes(htmls) {
  const found = new Set();
  for (const html of htmls)
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (/\bsrc=/.test(m[1]) || /type="application\/ld\+json"/.test(m[1])) continue;
      if (m[2].trim() === "") continue;
      found.add(`'sha256-${sha256(m[2])}'`);
    }
  return [...found].sort();
}

/** Fills the template in public/_headers. */
export function fillHeaders(template, { hashes }) {
  const host = new URL(SITE_URL).host;
  template = template.split(/\r?\n/).filter((l) => !l.startsWith("#")).join("\n").replace(/^\n+/, "");
  return template.replace(" __SCRIPT_HASHES__", hashes.length ? ` ${hashes.join(" ")}` : "").replace("__SITE_WSS__", `wss://${host}`);
}

/** Problems with the final `_headers` (empty = fine): what the brief demands of the policy. */
export function checkHeaders(text, hashes) {
  const bad = [];
  const csp = /^ {2}Content-Security-Policy: (.*)$/m.exec(text)?.[1];
  if (!csp) return ["no Content-Security-Policy in _headers"];
  const dir = (name) => new RegExp(`(?:^|; )${name} ([^;]*)`).exec(csp)?.[1];
  const script = dir("script-src") ?? "";
  if (/unsafe-inline|unsafe-eval|\*|https?:/.test(script)) bad.push(`script-src must be 'self' and hashes only: "${script}"`);
  for (const h of hashes) if (!script.includes(h)) bad.push(`script-src lacks the hash of an inline script: ${h}`);
  if (/__[A-Z_]+__/.test(text)) bad.push("an unfilled placeholder is left in _headers");
  for (const [d, v] of [["object-src", "'none'"], ["base-uri", "'self'"], ["form-action", "'self'"], ["frame-ancestors", "'none'"], ["default-src", "'self'"]])
    if (dir(d) !== v) bad.push(`${d} should be ${v}, is ${dir(d) ?? "missing"}`);
  if (!/Strict-Transport-Security: max-age=\d{7,}/.test(text)) bad.push("no Strict-Transport-Security");
  for (const h of ["X-Content-Type-Options: nosniff", "Referrer-Policy:", "Permissions-Policy:"]) if (!text.includes(h)) bad.push(`missing ${h}`);
  return bad;
}

/** Every same-origin file of the build the shell needs offline, as URL paths. */
export function precacheList(dist) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out.push("/" + path.relative(dist, p).split(path.sep).join("/"));
    }
  };
  for (const d of ["_expo/static", "fonts", "icons"]) if (fs.existsSync(path.join(dist, d))) walk(path.join(dist, d));
  // Expo's hashed images (assets/**), only those the HTML or JS can reference are emitted there: all of them are tiny.
  if (fs.existsSync(path.join(dist, "assets"))) walk(path.join(dist, "assets"));
  return out.filter((u) => !u.endsWith(".map")).sort();
}

/** `/{locale}/home` for each language: the cached shell page. */
export const shellPages = () => Object.fromEntries(LOCALES.map((l) => [l, `/${l}/home`]));

export function buildSw(template, { assets, shell, shellHtml }) {
  const list = [...assets, ...Object.values(shell)];
  const version = crypto
    .createHash("sha256")
    .update(template)
    .update(JSON.stringify(list))
    .update(shellHtml)
    .digest("hex")
    .slice(0, 12);
  return {
    version,
    source: template.replace("__VERSION__", version).replace("__ASSETS__", JSON.stringify(list, null, 1)).replace("__SHELL__", JSON.stringify(shell)),
  };
}

/** dist/offline.html: the three languages one under the other (the URL does not tell which one the person reads), no script. */
export function buildOfflineHtml({ css }) {
  const blocks = LOCALES.map((l, i) => {
    const t = OFFLINE_TEXTS[l];
    const h = i === 0 ? "h1" : "h2";
    return `<section lang="${l}" class="blk"><${h}>${esc(t.title)}</${h}><p>${esc(t.body)}</p><a class="btn pri" href="">${esc(t.retry)}</a> <a class="btn" href="/${l}/home">${esc(t.home)}</a></section>`;
  }).join("");
  const own = `body{margin:0}main{max-width:720px;margin:0 auto;padding:64px 16px;font-family:Barlow_400,ui-sans-serif,system-ui,sans-serif;line-height:1.55}.blk{padding:24px 0;border-top:1px solid var(--c-rule)}.blk:first-child{border-top:0}h1,h2{font-family:SofiaSansExtraCondensed_200,ui-sans-serif,sans-serif;font-weight:200;text-transform:uppercase;line-height:1.08;margin:0 0 12px}h1{font-size:clamp(3.75rem,3.3rem + 1.9vw,4.5rem)}h2{font-size:2rem}p{margin:0 0 16px;color:var(--c-ink2);max-width:65ch}.btn{display:inline-flex;align-items:center;min-height:44px;padding:0 24px;margin:0 8px 8px 0;border:1px solid var(--c-ink);font-family:SofiaSansExtraCondensed_400,ui-sans-serif,sans-serif;text-transform:uppercase;font-size:20px}.btn.pri{background:var(--c-accent);border-color:var(--c-accent);color:var(--c-accentInk)}`;
  return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/><title>${esc(OFFLINE_TEXTS[DEFAULT_LOCALE].title)} · Pausa</title><meta name="robots" content="noindex, nofollow"/><meta name="theme-color" content="${THEME_COLOR}"/><link rel="icon" href="/favicon.ico"/><style>${css}${own}</style></head><body><main>${blocks}</main></body></html>`;
}
