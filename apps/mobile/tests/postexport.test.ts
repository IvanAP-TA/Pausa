import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as px from "../scripts/postexport.mjs";
import * as budget from "../scripts/budget.mjs";

const SITE = "https://pausa.gnagno.org";
const LOCALES = ["it", "en", "es"];
const OGL: Record<string, string> = { it: "it_IT", en: "en_US", es: "es_ES" };
const SUBS = ["", "/guide", "/guide/choose-a-movie-with-friends", "/privacy", "/terms"];
const file = (l: string, sub: string) => (sub === "" ? `${l}/index.html` : sub === "/guide" ? `${l}/guide/index.html` : `${l}${sub}.html`);

/** What Expo writes for a public page (head as measured in T0e / T1b), small enough to read. */
function publicHtml(l: string, sub: string, over: { description?: string | null; robots?: string; canonical?: string; drop?: string[]; extra?: string; h1?: number } = {}) {
  const url = (x: string) => `${SITE}/${x}${sub}`;
  const links = [
    ...LOCALES.map((x) => `<link rel="alternate" href="${url(x)}" hreflang="${x}"/>`),
    `<link rel="alternate" href="${url("it")}" hreflang="x-default"/>`,
  ].filter((t) => !(over.drop ?? []).some((d) => t.includes(`hreflang="${d}"`)));
  const desc = over.description === null ? "" : `<meta name="description" content="${over.description ?? "A description that is long enough to count."}"/>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no"/><title>Title ${l}${sub} · Pausa</title>${desc}<meta name="robots" content="${over.robots ?? "index, follow"}"/><link rel="canonical" href="${over.canonical ?? url(l)}"/>${links.join("")}<meta property="og:url" content="${over.canonical ?? url(l)}"/><meta property="og:image" content="https://pausa.gnagno.org/icons/icon-512.png"/><meta property="og:locale" content="${OGL[l]}"/><meta name="twitter:card" content="summary"/><meta name="twitter:image" content="https://pausa.gnagno.org/icons/icon-512.png"/><meta name="theme-color" content="#001113"/><link rel="preload" href="/_expo/static/js/web/entry-abc.js" as="script"/><style id="expo-reset">#root{display:flex}</style></head><body><div id="root">${"<h1>x</h1>".repeat(over.h1 ?? 1)}<script type="application/ld+json">{"@graph":[]}</script></div>${over.extra ?? ""}<script defer="" src="/_expo/static/js/web/entry-abc.js"></script><script id="_R_">globalThis.__EXPO_ROUTER_HYDRATE__=true;</script></body></html>`;
}
const shellHtml = (robots = "noindex, nofollow") =>
  `<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no"/><title>Pausa</title><meta name="robots" content="${robots}"/></head><body><div id="root"></div><script defer="" src="/_expo/static/js/web/entry-abc.js"></script><script id="_R_">globalThis.__EXPO_ROUTER_HYDRATE__=true;</script></body></html>`;

function chooser() {
  const alt = [...LOCALES.map((x) => `<link rel="alternate" href="${SITE}/${x}" hreflang="${x}"/>`), `<link rel="alternate" href="${SITE}/" hreflang="x-default"/>`].join("");
  return `<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no"/><title>Pausa</title><meta name="description" content="A description that is long enough to count."/><meta name="robots" content="index, follow"/><link rel="canonical" href="${SITE}/"/>${alt}<meta property="og:url" content="${SITE}/"/><meta property="og:image" content="https://pausa.gnagno.org/icons/icon-512.png"/><meta name="twitter:card" content="summary"/><meta name="twitter:image" content="https://pausa.gnagno.org/icons/icon-512.png"/><meta name="theme-color" content="#001113"/></head><body><h1>Pausa</h1><script defer="" src="/_expo/static/js/web/entry-abc.js"></script><script id="_R_">globalThis.__EXPO_ROUTER_HYDRATE__=true;</script></body></html>`;
}

let dist = "";
const put = (rel: string, html: string) => {
  fs.mkdirSync(path.dirname(path.join(dist, rel)), { recursive: true });
  fs.writeFileSync(path.join(dist, rel), html);
};
function buildFixture() {
  put("index.html", chooser());
  put("+not-found.html", `<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"/><style id="expo-reset">#root{display:flex}</style></head><body><h1>x</h1><script defer="" src="/_expo/static/js/web/entry-abc.js"></script></body></html>`);
  put("auth.html", shellHtml());
  for (const l of LOCALES) {
    for (const s of SUBS) put(file(l, s), publicHtml(l, s));
    for (const p of ["sign-in", "home", "account", "c/[id]", "c/[id]/settings", "join/[code]"]) put(`${l}/${p}.html`, shellHtml());
    // things the exporter emits that must be deleted
    put(`${l}/(app)/home.html`, shellHtml());
    put(`${l}/guide/[slug].html`, publicHtml(l, "/guide/x"));
  }
  put("[locale].html", shellHtml());
  put("[locale]/guide/index.html", shellHtml());
  put("_sitemap.html", shellHtml());
  fs.mkdirSync(path.join(dist, "_expo/static/js/web"), { recursive: true });
  fs.writeFileSync(path.join(dist, "_expo/static/js/web/entry-abc.js"), "console.log(1)");
}
const quiet = { log: () => undefined, warn: () => undefined };
const read = (rel: string) => fs.readFileSync(path.join(dist, rel), "utf8");

beforeEach(() => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), "pausa-dist-"));
});
afterEach(() => fs.rmSync(dist, { recursive: true, force: true }));

describe("postexport transforms", () => {
  it("sets <html lang> from the path, renames the 404, adds viewport-fit=cover", () => {
    buildFixture();
    px.run(dist, { env: { LEGAL_ENTITY: "x", CONTACT_EMAIL: "y" }, ...quiet });
    expect(read("it/index.html")).toContain('<html lang="it"');
    expect(read("en/guide/index.html")).toContain('<html lang="en"');
    expect(read("es/privacy.html")).toContain('<html lang="es"');
    expect(read("es/c/[id].html")).toContain('<html lang="es"');
    expect(fs.existsSync(path.join(dist, "404.html"))).toBe(true);
    expect(fs.existsSync(path.join(dist, "+not-found.html"))).toBe(false);
    expect(read("it/index.html")).toContain("viewport-fit=cover");
  });

  it("strips scripts and script preloads from public pages but keeps JSON-LD", () => {
    buildFixture();
    px.run(dist, { env: {}, ...quiet });
    for (const l of LOCALES)
      for (const s of SUBS) {
        const html = read(file(l, s));
        expect(html, `${l}${s}`).not.toMatch(/<script\b[^>]*\bsrc=/);
        expect(html).not.toContain("__EXPO_ROUTER_HYDRATE__");
        expect(html).not.toMatch(/as="script"/);
        expect(html).toContain('type="application/ld+json"');
      }
    for (const f of ["index.html", "404.html"]) expect(read(f), f).not.toMatch(/<script\b/);
  });

  it("writes a real 404 (Expo renders an empty one) per language: only that language, noindex, one h1, no scripts", () => {
    buildFixture();
    px.run(dist, { env: {}, ...quiet });
    const text = { it: "Qui non c", en: "Nothing here", es: "Aquí no hay nada" } as const;
    for (const [file, l] of [["404.html", "it"], ["it/404.html", "it"], ["en/404.html", "en"], ["es/404.html", "es"]] as const) {
      const html = read(file);
      expect(html, file).toContain(`<html lang="${l}"`);
      for (const o of LOCALES) {
        if (o === l) expect(html, file).toContain(text[o]);
        else expect(html, file).not.toContain(text[o as keyof typeof text]);
      }
      expect(html, file).toContain("noindex");
      expect(html.match(/<h1/g), file).toHaveLength(1);
      expect(html, file).not.toContain("<script");
      expect(html, file).toContain(`href="/${l}"`);
    }
  });

  it("leaves the app shell pages with their JavaScript", () => {
    buildFixture();
    px.run(dist, { env: {}, ...quiet });
    for (const p of ["it/sign-in.html", "en/home.html", "es/account.html", "it/c/[id].html", "it/c/[id]/settings.html", "en/join/[code].html", "auth.html"])
      expect(read(p), p).toMatch(/<script defer="" src=/);
  });

  it("deletes the stray files (templates, group duplicates, _sitemap, the guide template)", () => {
    buildFixture();
    px.run(dist, { env: {}, ...quiet });
    for (const p of ["[locale].html", "[locale]", "_sitemap.html", "it/(app)", "it/guide/[slug].html"]) expect(fs.existsSync(path.join(dist, p)), p).toBe(false);
  });

  it("writes a sitemap with 15 URLs, each with 4 alternates, x-default on the Italian page", () => {
    buildFixture();
    px.run(dist, { env: {}, ...quiet });
    const xml = read("sitemap.xml");
    const urls = xml.split("<url>").slice(1);
    expect(urls).toHaveLength(15);
    for (const u of urls) {
      expect(u.match(/<xhtml:link /g)).toHaveLength(4);
      const loc = /<loc>([^<]+)<\/loc>/.exec(u)![1];
      const sub = loc.replace(/^https:\/\/pausa\.gnagno\.org\/(it|en|es)/, "");
      expect(u).toContain(`hreflang="x-default" href="${SITE}/it${sub}"`);
    }
    expect(xml).toContain(`<loc>${SITE}/es/guide/choose-a-movie-with-friends</loc>`);
    expect(xml).not.toContain("/sign-in");
    expect(xml).not.toContain("/c/");
  });

  it("writes robots.txt: private prefixes and AI crawlers out, sitemap in", () => {
    buildFixture();
    px.run(dist, { env: {}, ...quiet });
    const txt = read("robots.txt");
    for (const rule of ["Disallow: /api/", "Disallow: /*/c/", "Disallow: /*/join/", "Disallow: /*/sign-in", "Disallow: /*/home", "Disallow: /*/account", "Allow: /"]) expect(txt).toContain(rule);
    for (const bot of ["GPTBot", "ClaudeBot", "CCBot"]) expect(txt).toContain(`User-Agent: ${bot}`);
    expect(txt).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });

  it("warns when LEGAL_ENTITY / CONTACT_EMAIL are missing, and stays quiet when they are set", () => {
    buildFixture();
    const warnings: string[] = [];
    px.run(dist, { env: {}, log: () => undefined, warn: (m: string) => warnings.push(m) });
    expect(warnings.join("\n")).toMatch(/LEGAL_ENTITY and CONTACT_EMAIL/);

    fs.rmSync(dist, { recursive: true, force: true });
    dist = fs.mkdtempSync(path.join(os.tmpdir(), "pausa-dist-"));
    buildFixture();
    const w2: string[] = [];
    px.run(dist, { env: { LEGAL_ENTITY: "Ada", CONTACT_EMAIL: "a@b.c" }, log: () => undefined, warn: (m: string) => w2.push(m) });
    expect(w2).toEqual([]);
  });

  it("is idempotent: running it twice on the same export does not fail", () => {
    buildFixture();
    px.run(dist, { env: {}, ...quiet });
    expect(() => px.run(dist, { env: {}, ...quiet })).not.toThrow();
  });
});

describe("postexport refuses a bad build (each of these must fail, with the page and the reason)", () => {
  const fails = (mutate: () => void, ...needles: string[]) => {
    buildFixture();
    mutate();
    let msg = "";
    try {
      px.run(dist, { env: {}, ...quiet });
    } catch (e) {
      msg = String((e as Error).message);
    }
    expect(msg, "the build should have failed").not.toBe("");
    for (const n of needles) expect(msg).toContain(n);
  };

  it("a missing description", () => fails(() => put("en/privacy.html", publicHtml("en", "/privacy", { description: null })), "en/privacy.html", "description"));
  it("a missing hreflang x-default", () => fails(() => put("it/index.html", publicHtml("it", "", { drop: ["x-default"] })), "it/index.html", "x-default"));
  it("a missing hreflang es", () => fails(() => put("it/guide/index.html", publicHtml("it", "/guide", { drop: ["es"] })), "it/guide/index.html", 'hreflang="es"'));
  it("a canonical that points elsewhere", () => fails(() => put("es/terms.html", publicHtml("es", "/terms", { canonical: `${SITE}/it/terms` })), "es/terms.html", "canonical"));
  it("a noindex on an indexable page", () => fails(() => put("en/index.html", publicHtml("en", "", { robots: "noindex, nofollow" })), "en/index.html", "noindex"));
  it("two h1", () => fails(() => put("it/terms.html", publicHtml("it", "/terms", { h1: 2 })), "it/terms.html", "<h1>"));
  it("an app page that can be indexed", () => fails(() => put("it/home.html", shellHtml("index, follow")), "it/home.html", "noindex"));
  it("a page nobody classified", () => fails(() => put("it/surprise.html", publicHtml("it", "/surprise")), "it/surprise.html", "not classified"));
  it("a sitemap page that was not exported", () => fails(() => fs.rmSync(path.join(dist, "es/guide/choose-a-movie-with-friends.html")), "es/guide/choose-a-movie-with-friends.html", "not exported"));
  it("reports every problem at once, not only the first", () =>
    fails(
      () => {
        put("en/privacy.html", publicHtml("en", "/privacy", { description: null }));
        put("it/terms.html", publicHtml("it", "/terms", { drop: ["x-default"] }));
      },
      "2 problem(s)",
      "en/privacy.html",
      "it/terms.html",
    ));
});

describe("pure helpers", () => {
  it("stripScripts removes inline hydrate flags and preloads, keeps ld+json", () => {
    const out = px.stripScripts('<link rel="preload" href="a.js" as="script"/><script id="_R_">x</script><script type="application/ld+json">{}</script><script defer="" src="a.js"></script>');
    expect(out).toBe('<script type="application/ld+json">{}</script>');
  });
  it("patchViewport adds viewport-fit once", () => {
    const once = px.patchViewport('<meta name="viewport" content="width=device-width"/>');
    expect(once).toContain("width=device-width, viewport-fit=cover");
    expect(px.patchViewport(once)).toBe(once);
  });
  it("classify knows public, shell, junk and unknown", () => {
    expect(px.classify("it/guide/choose-a-movie-with-friends.html").kind).toBe("public");
    expect(px.classify("it/c/[id]/settings.html").kind).toBe("shell");
    expect(px.classify("it/(app)/home.html").kind).toBe("junk");
    expect(px.classify("fr/index.html").kind).toBe("unknown");
  });
  it("the slow-down page is quiet: static like a public page, never indexed", () => {
    expect(px.classify("es/slow-down.html")).toEqual({ kind: "quiet", locale: "es" });
    const ok = '<!DOCTYPE html><html lang="it"><head><title>Piano, piano · Pausa</title><meta name="robots" content="noindex, nofollow"/></head><body><h1>x</h1></body></html>';
    expect(px.checkQuietPage(ok, { locale: "it" })).toEqual([]);
    expect(px.checkQuietPage(ok.replace("noindex, nofollow", "index, follow"), { locale: "it" }).join()).toContain("noindex");
    expect(px.checkQuietPage(ok.replace("</body>", '<script src="/a.js"></script></body>'), { locale: "it" }).join()).toContain("JavaScript");
    expect(px.robotsTxt()).toContain("Disallow: /*/slow-down");
  });
});

describe("budget script", () => {
  it("detects scripts in a public page", () => {
    expect(budget.publicViolations('<script defer="" src="/a.js"></script>')).toContain("<script src>");
    expect(budget.publicViolations('<script id="_R_">x</script>').length).toBeGreaterThan(0);
    expect(budget.publicViolations('<link rel="preload" as="script" href="a"/>')).toContain('<link as="script">');
    expect(budget.publicViolations('<script type="application/ld+json">{}</script><p>hi</p>')).toEqual([]);
  });
  it("brotli is smaller than gzip is smaller than raw for text", () => {
    const s = budget.sizes(Buffer.from("function hello(){return 'hello world'}".repeat(500)));
    expect(s.brotli).toBeLessThan(s.gzip);
    expect(s.gzip).toBeLessThan(s.raw);
  });
  it("fails a fixture whose shell is over the limit and passes a small one", () => {
    buildFixture();
    px.run(dist, { env: {}, ...quiet });
    const ok = budget.report(dist, () => undefined);
    expect(ok.failures).toEqual([]);
    // incompressible 400 KB of random bytes as the entry: over 350 KB even in brotli
    fs.writeFileSync(path.join(dist, "_expo/static/js/web/entry-abc.js"), Buffer.from(Array.from({ length: 400 * 1024 }, () => Math.floor(Math.random() * 256))));
    const big = budget.report(dist, () => undefined);
    expect(big.failures.join("\n")).toMatch(/entry bundle is .* KB brotli, over 350 KB/);
    expect(big.failures.join("\n")).toMatch(/initial JS is/);
  });
});

describe("postexport: Open Graph, install, offline and headers", () => {
  it("fails a public page without og:image, og:url or the locale alternates", () => {
    buildFixture();
    put("it/privacy.html", publicHtml("it", "/privacy").replace(/<meta property="og:image"[^>]*>/, ""));
    expect(() => px.run(dist, { env: {}, ...quiet })).toThrow(/it\/privacy\.html: og:image missing/);
    put("it/privacy.html", publicHtml("it", "/privacy").replace(/<meta property="og:url"[^>]*>/, ""));
    expect(() => px.run(dist, { env: {}, ...quiet })).toThrow(/og:url is undefined/);
  });

  it("writes a manifest per language, offline.html, sw.js with this build's files, and _headers with the inline script's hash", () => {
    buildFixture();
    px.run(dist, { env: {}, ...quiet });
    for (const l of LOCALES) expect(JSON.parse(read(`manifest-${l}.webmanifest`))).toMatchObject({ lang: l, start_url: `/${l}/home`, display: "standalone" });
    expect(read("offline.html")).not.toMatch(/<script/);
    expect(read("offline.html")).toContain('lang="es"');
    const sw = read("sw.js");
    expect(sw).toContain("/_expo/static/js/web/entry-abc.js");
    expect(sw).not.toMatch(/__[A-Z]+__/);
    const headers = read("_headers");
    expect(headers).toContain("'sha256-");
    expect(headers).not.toMatch(/__[A-Z_]+__/);
  });

  it("every page of the export (public, shell, 404) links the manifest and the apple-touch-icon; public pages still have no script", () => {
    buildFixture();
    px.run(dist, { env: {}, ...quiet });
    for (const rel of ["it/index.html", "en/guide/index.html", "es/privacy.html", "it/home.html", "es/c/[id].html", "404.html"]) {
      const html = read(rel);
      expect(html, rel).toMatch(/<link rel="manifest" href="\/manifest-(it|en|es)\.webmanifest"\/>/);
      expect(html, rel).toContain('rel="apple-touch-icon"');
    }
    for (const rel of ["it/index.html", "en/guide/index.html", "es/privacy.html", "404.html"]) expect(read(rel), rel).not.toMatch(/<script\b[^>]*\bsrc=/);
    expect(read("it/home.html")).toMatch(/<script\b[^>]*\bsrc=/);
  });

  it("the service worker only precaches this build: no HTML of public pages, no source maps", () => {
    buildFixture();
    fs.writeFileSync(path.join(dist, "_expo/static/js/web/entry-abc.js.map"), "{}");
    px.run(dist, { env: {}, ...quiet });
    const sw = read("sw.js");
    expect(sw).not.toContain("entry-abc.js.map");
    expect(sw).not.toContain("/it/privacy");
  });
});
