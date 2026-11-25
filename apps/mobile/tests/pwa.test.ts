import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import * as headers from "../scripts/headers.mjs";
import * as icons from "../scripts/make-icons.mjs";
import * as pwa from "../scripts/pwa.mjs";
import { parseOklch, oklchToCss } from "../src/theme/oklch";
import { oklchSource } from "../src/theme/tokens";
import itMsgs from "../../../packages/messages/it.json";
import enMsgs from "../../../packages/messages/en.json";
import esMsgs from "../../../packages/messages/es.json";

const messages = { it: itMsgs, en: enMsgs, es: esMsgs } as Record<string, typeof itMsgs>;
const template = fs.readFileSync(path.join(__dirname, "..", "scripts", "sw.template.js"), "utf8");
const headersTemplate = fs.readFileSync(path.join(__dirname, "..", "public", "_headers"), "utf8");
const hex = (rgb: number[]) => "#" + rgb.map((n) => n.toString(16).padStart(2, "0")).join("");

describe("brand colours", () => {
  it("the icon script, the manifest and the theme colour are the dark tokens (sRGB copies)", () => {
    parseOklch(oklchSource.dark.paper); // still an oklch() string
    expect(oklchToCss(oklchSource.dark.paper)).toBe(hexToRgb(hex(icons.PAPER)));
    expect(oklchToCss(oklchSource.dark.accent)).toBe(hexToRgb(hex(icons.ACCENT)));
    expect(pwa.BACKGROUND_COLOR).toBe(hex(icons.PAPER));
    expect(pwa.THEME_COLOR).toBe(hex(icons.PAPER));
  });
});
function hexToRgb(h: string) {
  const n = parseInt(h.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
}

describe("icons", () => {
  it("renders the mark: accent frame, paper holes and bars, paper corners rounded for 'any' and square for maskable", () => {
    const size = 64;
    const px = (buf: Buffer, x: number, y: number) => [...buf.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)];
    const any = icons.render(size);
    expect(px(any, 32, 4)).toEqual([...icons.PAPER, 255]); // above the frame: paper
    expect(px(any, 0, 0)[3]).toBe(0); // rounded corner: transparent
    expect(px(any, 15, 45)).toEqual([...icons.ACCENT, 255]); // inside the frame, below the bars
    expect(px(any, 27, 32)).toEqual([...icons.PAPER, 255]); // inside a pause bar
    const maskable = icons.render(size, { inset: 0.34, rounded: false });
    expect(px(maskable, 0, 0)).toEqual([...icons.PAPER, 255]); // full bleed
  });

  it("encodes valid PNGs of the right size", () => {
    for (const [name, [size, opts]] of Object.entries(icons.ICONS) as Array<[string, [number, object]]>) {
      const png = icons.encodePng(size, icons.render(size, opts));
      expect(png.subarray(1, 4).toString(), name).toBe("PNG");
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], name).toEqual([size, size]);
    }
  });

  it("the committed files in public/icons are what the script writes now", () => {
    for (const [name, [size, opts]] of Object.entries(icons.ICONS) as Array<[string, [number, object]]>) {
      const file = path.join(__dirname, "..", "public", "icons", name);
      expect(fs.existsSync(file), `${name} exists (run: node scripts/make-icons.mjs)`).toBe(true);
      expect(fs.readFileSync(file).equals(icons.encodePng(size, icons.render(size, opts))), `${name} is current`).toBe(true);
    }
  });
});

describe("manifest", () => {
  it.each(["it", "en", "es"])("%s: installable, standalone, opens the signed-in home in its own language", (l) => {
    const m = pwa.buildManifest(l, messages);
    expect(m).toMatchObject({ id: "/", name: "Pausa", short_name: "Pausa", lang: l, start_url: `/${l}/home`, scope: "/", display: "standalone", theme_color: pwa.THEME_COLOR, background_color: pwa.BACKGROUND_COLOR });
    const sizes = m.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}/${i.purpose}`);
    expect(sizes).toEqual(["192x192/any", "512x512/any", "512x512/maskable"]);
    expect(m.description).toBe(messages[l].landing.meta.siteDescription);
    expect(m.shortcuts.map((s: { url: string }) => s.url)).toEqual([`/${l}/log`, `/${l}/diary`]);
  });

  it("every icon the manifest names is in the icon set", () => {
    for (const i of pwa.buildManifest("it", messages).icons) expect(Object.keys(icons.ICONS)).toContain(path.basename(i.src));
  });

  it("the install tags go in once, before </head>, and add no script", () => {
    const html = "<html><head><title>x</title></head><body></body></html>";
    const once = pwa.addInstallTags(html, "en");
    expect(once).toContain('<link rel="manifest" href="/manifest-en.webmanifest"/>');
    expect(once).toContain('rel="apple-touch-icon"');
    expect(once).toContain('name="apple-mobile-web-app-capable"');
    expect(once).not.toContain("<script");
    expect(pwa.addInstallTags(once, "en")).toBe(once);
  });

  it("og:locale:alternate lists the other two languages, once", () => {
    const html = '<head><meta property="og:locale" content="it_IT"/></head>';
    const out = pwa.ogLocaleAlternates(html, "it", { it: "it_IT", en: "en_US", es: "es_ES" });
    expect(out).toContain('og:locale:alternate" content="en_US"');
    expect(out).toContain('og:locale:alternate" content="es_ES"');
    expect(out).not.toContain('alternate" content="it_IT"');
    expect(pwa.ogLocaleAlternates(out, "it", { it: "it_IT", en: "en_US", es: "es_ES" })).toBe(out);
  });
});

describe("service worker build", () => {
  const assets = ["/_expo/static/js/web/entry-abc.js", "/fonts/barlow.woff2"];
  const shell = pwa.shellPages();

  it("fills every placeholder and is valid JavaScript", () => {
    const { source } = pwa.buildSw(template, { assets, shell, shellHtml: "<html/>" });
    expect(source).not.toMatch(/__[A-Z]+__/);
    expect(() => new vm.Script(source)).not.toThrow();
    expect(source).toContain('"/it/home"');
    expect(source).toContain('"/_expo/static/js/web/entry-abc.js"');
  });

  it("the version changes with the precache list and with the shell page, and only then", () => {
    const v = (a = assets, html = "<html/>") => pwa.buildSw(template, { assets: a, shell, shellHtml: html }).version;
    expect(v()).toBe(v());
    expect(v([...assets, "/x.js"])).not.toBe(v());
    expect(v(assets, "<html>new</html>")).not.toBe(v());
  });

  it("the worker does not skip waiting by itself, never touches /api/ and cleans old caches (read from the source)", () => {
    expect(template).not.toMatch(/install[\s\S]{0,900}skipWaiting\(\)\s*;?\s*\}\s*\)\s*\)/);
    expect(template).toContain('data.type === "SKIP_WAITING"');
    expect(template).toContain('url.pathname.startsWith("/api/")');
    expect(template).toContain("caches.delete(key)");
  });

  it("runs against a fake worker scope: caches the shell on install, cleans old caches on activate, passes /api/ through", async () => {
    const { source } = pwa.buildSw(template, { assets, shell, shellHtml: "<html/>" });
    const stores = new Map<string, Map<string, string>>([["pausa-pre-old", new Map()], ["other-app", new Map()]]);
    const listeners: Record<string, (e: unknown) => void> = {};
    const fetched: string[] = [];
    const caches = {
      open: async (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map());
        return { put: async (k: string | { url: string }, v: unknown) => void stores.get(name)!.set(typeof k === "string" ? k : new URL(k.url).pathname, String(v)), match: async () => undefined };
      },
      keys: async () => [...stores.keys()],
      delete: async (k: string) => stores.delete(k),
      match: async () => undefined,
    };
    class FakeRequest {
      url: string;
      constructor(u: string) {
        this.url = new URL(u, "https://pausa.test").href;
      }
    }
    const self = {
      location: { origin: "https://pausa.test" },
      addEventListener: (t: string, fn: (e: unknown) => void) => void (listeners[t] = fn),
      clients: { claim: async () => undefined },
      skipWaiting: async () => undefined,
    };
    const context = vm.createContext({
      self,
      caches,
      Request: FakeRequest,
      Response: class { constructor(public body: unknown) {} },
      URL,
      setTimeout,
      clearTimeout,
      fetch: async (r: FakeRequest) => {
        fetched.push(new URL(r.url).pathname);
        return { ok: true, redirected: false, status: 200 };
      },
    });
    new vm.Script(source).runInContext(context);
    let waiting: Promise<unknown> = Promise.resolve();
    await (listeners.install({ waitUntil: (p: Promise<unknown>) => (waiting = p) }), waiting);
    const pre = [...stores.keys()].find((k) => k.startsWith("pausa-pre-") && k !== "pausa-pre-old")!;
    expect([...stores.get(pre)!.keys()].sort()).toEqual(["/_expo/static/js/web/entry-abc.js", "/fonts/barlow.woff2", "/en/home", "/es/home", "/it/home", "/offline.html"].sort());
    await (listeners.activate({ waitUntil: (p: Promise<unknown>) => (waiting = p) }), waiting);
    expect([...stores.keys()].sort()).toEqual([pre, "other-app"].sort()); // the old version of OUR cache is gone, somebody else's is not
    let responded = false;
    listeners.fetch({ request: { method: "GET", url: "https://pausa.test/api/me", mode: "cors" }, respondWith: () => (responded = true) });
    listeners.fetch({ request: { method: "POST", url: "https://pausa.test/it/home", mode: "navigate" }, respondWith: () => (responded = true) });
    listeners.fetch({ request: { method: "GET", url: "https://image.tmdb.org/x.jpg", mode: "no-cors" }, respondWith: () => (responded = true) });
    expect(responded).toBe(false); // API, writes and other origins are not the worker's business
  });
});

describe("_headers", () => {
  const hashes = ["'sha256-abc='"];
  const filled = pwa.fillHeaders(headersTemplate, { hashes });

  it("the committed template passes the policy checks once filled", () => {
    expect(pwa.checkHeaders(filled, hashes)).toEqual([]);
    expect(filled).not.toContain("__");
    expect(filled).toContain("wss://pausa.gnagno.org");
  });

  it("allows what the export needs and nothing wider", () => {
    const csp = /Content-Security-Policy: (.*)/.exec(filled)![1];
    expect(csp).toContain("script-src 'self' 'sha256-abc=';");
    expect(csp).not.toMatch(/script-src[^;]*(unsafe|\*|https:)/);
    for (const host of ["https://image.tmdb.org", "https://s4.anilist.co", "https://graphql.anilist.co", "https://api.jikan.moe"]) expect(csp).toContain(host);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp.length).toBeLessThan(2000); // Cloudflare's per-line limit
  });

  it("the check rejects a policy that lost its guard rails", () => {
    expect(pwa.checkHeaders(filled.replace("object-src 'none'", "object-src *"), hashes).join()).toContain("object-src");
    expect(pwa.checkHeaders(filled.replace("script-src 'self'", "script-src 'unsafe-inline' 'self'"), hashes).join()).toContain("script-src");
    expect(pwa.checkHeaders(filled, ["'sha256-other='"]).join()).toContain("lacks the hash");
    expect(pwa.checkHeaders(filled.replace(/^ {2}Strict-Transport-Security.*\n/m, ""), hashes).join()).toContain("Strict-Transport-Security");
  });

  it("hashes only the inline scripts that run (not JSON-LD, not src)", () => {
    const html = '<script type="application/ld+json">{"a":1}</script><script defer src="/a.js"></script><script id="_R_">globalThis.__EXPO_ROUTER_HYDRATE__=true;</script>';
    const got = pwa.inlineScriptHashes([html, html]);
    expect(got).toEqual([`'sha256-${pwa.sha256("globalThis.__EXPO_ROUTER_HYDRATE__=true;")}'`]);
  });

  it("applies like Cloudflare: HTML no-cache, build assets immutable (detached), joined duplicates, splats", () => {
    const rules = headers.parseHeaders(filled);
    const html = headers.headersFor(rules, "/it/home");
    expect(html["Cache-Control"]).toBe("no-cache");
    expect(html["Content-Security-Policy"]).toContain("default-src 'self'");
    const js = headers.headersFor(rules, "/_expo/static/js/web/entry-1.js");
    expect(js["Cache-Control"]).toBe("public, max-age=31536000, immutable"); // not "no-cache, public, ..."
    expect(js["Content-Security-Policy"]).toBeDefined();
    expect(headers.headersFor(rules, "/fonts/barlow.woff2")["Cache-Control"]).toContain("stale-while-revalidate");
    expect(headers.headersFor(rules, "/sw.js")["Cache-Control"]).toBe("no-cache");
    const joined = headers.headersFor(headers.parseHeaders("/*\n  X-A: 1\n/a/*\n  X-A: 2\n/b/:id\n  X-B: yes\n"), "/a/x");
    expect(joined["X-A"]).toBe("1, 2");
    expect(headers.headersFor(headers.parseHeaders("/b/:id\n  X-B: yes\n"), "/b/7")["X-B"]).toBe("yes");
    expect(headers.headersFor(headers.parseHeaders("/b/:id\n  X-B: yes\n"), "/b/7/8")["X-B"]).toBeUndefined();
  });
});
