// The SEO checklist of docs/rebuild/INVENTORY.md "Parte 4" (1.7), the items that apply to what exists today, run against the
// exported HTML with JavaScript DISABLED (what a crawler sees). Numbers in the test names are the checklist items.
// Not applicable yet, by design of this phase: 3 llms.txt, 5 Accept-Language redirect (decided: `/` is a page),
// 6-8 server headers/cookies (they belong to the Worker; the static asset headers are in csp.spec.ts), 26 per-page og:image (every page
// shares the 512 mark, see 20b), 21 Organization.logo, 23 "Scarica l'app", 32 Serata pages, 34 server redirect.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const SITE = "https://pausa.gnagno.org";
const LOCALES = ["it", "en", "es"] as const;
const SLUG = "choose-a-movie-with-friends";
const root = path.resolve(__dirname, "../../..");
const msg = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(path.join(root, "packages/messages", `${l}.json`), "utf8"))]));
const OG_LOCALE = { it: "it_IT", en: "en_US", es: "es_ES" } as const;

test.use({ javaScriptEnabled: false });

const meta = (page: Page, sel: string) => page.locator(`head ${sel}`);
const attr = async (page: Page, sel: string, name: string) => (await meta(page, sel).first().getAttribute(name)) ?? null;
async function ld(page: Page): Promise<any[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.map((b) => JSON.parse(b));
}

type PageSpec = { sub: string; title: (l: (typeof LOCALES)[number]) => string; description: (l: (typeof LOCALES)[number]) => string; og: "website" | "article" };
const PAGES: PageSpec[] = [
  { sub: "", title: (l) => msg[l].landing.meta.title, description: (l) => msg[l].landing.meta.description, og: "website" },
  { sub: "/guide", title: (l) => `${msg[l].guides.indexTitle} · Pausa`, description: (l) => msg[l].guides.indexLede, og: "website" },
  { sub: `/guide/${SLUG}`, title: (l) => `${msg[l].guides.items[SLUG].title} · Pausa`, description: (l) => msg[l].guides.items[SLUG].description, og: "article" },
  { sub: "/privacy", title: (l) => `${msg[l].legal.privacy.title} · Pausa`, description: (l) => msg[l].legal.privacy.description, og: "website" },
  { sub: "/terms", title: (l) => `${msg[l].legal.terms.title} · Pausa`, description: (l) => msg[l].legal.terms.description, og: "website" },
];

test("the landing titles are the exact strings of INVENTORY 1.2 (not just whatever the catalogue says)", async ({ page }) => {
  const expected = {
    it: "Pausa · Diario dei film con gli amici e cosa guardare stasera",
    en: "Pausa · A film diary with friends, and what to watch tonight",
    es: "Pausa · Diario de películas con amigos y qué ver esta noche",
  };
  for (const l of LOCALES) {
    await page.goto(`/${l}`);
    await expect(page).toHaveTitle(expected[l]);
  }
});

for (const l of LOCALES)
  for (const p of PAGES) {
    const url = `/${l}${p.sub}`;
    test.describe(url, () => {
      test.beforeEach(async ({ page }) => {
        const res = await page.goto(url);
        expect(res?.status()).toBe(200);
      });

      test("9 html lang, 10 one h1, 14 title, 13 description", async ({ page }) => {
        await expect(page.locator("html")).toHaveAttribute("lang", l);
        await expect(page.locator("h1")).toHaveCount(1);
        await expect(page).toHaveTitle(p.title(l));
        expect(await attr(page, 'meta[name="description"]', "content")).toBe(p.description(l));
        expect(p.description(l).length).toBeGreaterThan(30);
      });

      test("11 canonical is absolute, self-referencing, without trailing slash", async ({ page }) => {
        const canon = page.locator('head link[rel="canonical"]');
        await expect(canon).toHaveCount(1);
        const href = await canon.getAttribute("href");
        expect(href).toBe(`${SITE}/${l}${p.sub}`);
        expect(href!.endsWith("/")).toBe(false);
      });

      test("12 four hreflang links, x-default is the Italian page, reciprocal", async ({ page }) => {
        const links = await page.locator('head link[rel="alternate"][hreflang]').evaluateAll((els) => els.map((e) => [e.getAttribute("hreflang"), e.getAttribute("href")]));
        expect(Object.fromEntries(links)).toEqual({
          it: `${SITE}/it${p.sub}`,
          en: `${SITE}/en${p.sub}`,
          es: `${SITE}/es${p.sub}`,
          "x-default": `${SITE}/it${p.sub}`,
        });
        expect(links).toHaveLength(4);
      });

      test("16 not noindex, 17 theme-color and viewport-fit, icon", async ({ page }) => {
        const robots = await attr(page, 'meta[name="robots"]', "content");
        expect(robots ?? "").not.toMatch(/noindex/i);
        expect(await attr(page, 'meta[name="theme-color"]', "content")).toBe("#001113");
        expect(await attr(page, 'meta[name="viewport"]', "content")).toContain("viewport-fit=cover");
        expect(await attr(page, 'link[rel="icon"]', "href")).toBeTruthy();
      });

      test("20 Open Graph and Twitter", async ({ page }) => {
        expect(await attr(page, 'meta[property="og:type"]', "content")).toBe(p.og);
        expect(await attr(page, 'meta[property="og:site_name"]', "content")).toBe("Pausa");
        expect(await attr(page, 'meta[property="og:locale"]', "content")).toBe(OG_LOCALE[l]);
        expect(await attr(page, 'meta[property="og:title"]', "content")).toBe(p.title(l));
        expect(await attr(page, 'meta[property="og:url"]', "content")).toBe(`${SITE}/${l}${p.sub}`);
        expect(await attr(page, 'meta[name="twitter:card"]', "content")).toBeTruthy();
      });

      test("20b Open Graph / Twitter are complete (GAPS M10): description, image, the other two locales, twitter title, description and image", async ({ page }) => {
        expect(await attr(page, 'meta[property="og:description"]', "content")).toBe(p.description(l));
        expect(await attr(page, 'meta[property="og:image"]', "content")).toBe(`${SITE}/icons/icon-512.png`);
        expect(await attr(page, 'meta[property="og:image:width"]', "content")).toBe("512");
        const alternates = await page.locator('head meta[property="og:locale:alternate"]').evaluateAll((els) => els.map((e) => e.getAttribute("content")));
        expect(alternates.sort()).toEqual(LOCALES.filter((x) => x !== l).map((x) => OG_LOCALE[x]).sort());
        expect(await attr(page, 'meta[name="twitter:title"]', "content")).toBe(p.title(l));
        expect(await attr(page, 'meta[name="twitter:description"]', "content")).toBe(p.description(l));
        expect(await attr(page, 'meta[name="twitter:image"]', "content")).toBe(`${SITE}/icons/icon-512.png`);
      });

      test("18 installable from a static page: manifest of this language, apple-touch-icon, iOS standalone meta, all without JavaScript", async ({ page }) => {
        expect(await attr(page, 'link[rel="manifest"]', "href")).toBe(`/manifest-${l}.webmanifest`);
        expect(await attr(page, 'link[rel="apple-touch-icon"]', "href")).toBe("/icons/apple-touch-icon.png");
        expect(await attr(page, 'meta[name="apple-mobile-web-app-capable"]', "content")).toBe("yes");
        expect(await attr(page, 'meta[name="mobile-web-app-capable"]', "content")).toBe("yes");
        expect(await attr(page, 'meta[name="apple-mobile-web-app-title"]', "content")).toBe("Pausa");
      });

      test("19 content is in the HTML and no JavaScript is shipped", async ({ page }) => {
        // javaScriptEnabled is false for this whole file, so what we read is exactly what was served.
        await expect(page.locator("h1")).not.toBeEmpty();
        expect(await page.locator("script[src]").count()).toBe(0);
        expect(await page.locator('link[as="script"]').count()).toBe(0);
        const inline = await page.locator("script:not([type='application/ld+json'])").count();
        expect(inline).toBe(0);
        expect((await page.locator("body").innerText()).length).toBeGreaterThan(200);
      });

      test("the other languages of the same page are announced (hreflang; as in v1 guides and legal pages have no visible switcher)", async ({ page }) => {
        for (const other of LOCALES) {
          const alt = page.locator(`head link[rel="alternate"][hreflang="${other}"]`);
          await expect(alt, other).toHaveAttribute("href", new RegExp(`/${other}${p.sub.replace(/\//g, "\\/")}$`));
        }
      });
    });
  }

test.describe("landing", () => {
  test("20 og:type website, 21 JSON-LD graph of 4 nodes with the exact fields", async ({ page }) => {
    for (const l of LOCALES) {
      await page.goto(`/${l}`);
      const blocks = await ld(page);
      expect(blocks, "exactly one JSON-LD script").toHaveLength(1);
      const graph = blocks[0]["@graph"];
      expect(graph.map((n: any) => n["@type"])).toEqual(["Organization", "WebSite", "WebApplication", "FAQPage"]);
      const [org, site, app, faq] = graph;
      expect(org["@id"]).toBe(`${SITE}/#organization`);
      expect(site).toMatchObject({ "@id": `${SITE}/#website`, url: `${SITE}/`, inLanguage: ["it", "en", "es"] });
      expect(app).toMatchObject({ applicationCategory: "EntertainmentApplication", isAccessibleForFree: true, offers: { price: "0", priceCurrency: "EUR" }, url: `${SITE}/${l}` });
      expect(faq.mainEntity).toHaveLength(7);
      // each answer equals the text in the FAQ section (textContent: innerText would apply the heading capitals)
      const body = (await page.locator("body").textContent()) ?? "";
      for (const q of faq.mainEntity) {
        expect(q["@type"]).toBe("Question");
        expect(body).toContain(q.name);
        expect(body).toContain(q.acceptedAnswer.text);
      }
    }
  });

  test("22 anchors, footer links, three language links, TMDB attribution", async ({ page }) => {
    await page.goto("/it");
    for (const id of ["how", "privacy", "faq"]) await expect(page.locator(`#${id}`), `#${id}`).toHaveCount(1);
    for (const href of ["/it/guide", "/it/privacy", "/it/terms"]) await expect(page.locator(`footer a[href="${href}"], [role="contentinfo"] a[href="${href}"]`)).toHaveCount(1);
    for (const l of LOCALES) await expect(page.locator(`header a[href="/${l}"], [role="banner"] a[href="/${l}"]`).first()).toBeVisible();
    await expect(page.locator("body")).toContainText(msg.it.tmdb.attribution);
  });

  test("23 the Italian h1 says what the old e2e said, and the guides link is there", async ({ page }) => {
    await page.goto("/it");
    await expect(page.locator("h1")).toContainText(/Cosa guardiamo stasera/i);
    await expect(page.getByRole("link", { name: msg.it.landing.footer.guides }).first()).toBeVisible();
    // the primary call to action is a real link to the sign-in page even without JavaScript
    await expect(page.getByRole("link", { name: msg.it.landing.hero.cta }).first()).toHaveAttribute("href", "/it/sign-in");
  });
});

test.describe("guides", () => {
  test("24 index JSON-LD: CollectionPage with the guide at position 1, breadcrumb of 2", async ({ page }) => {
    for (const l of LOCALES) {
      await page.goto(`/${l}/guide`);
      const graph = (await ld(page))[0]["@graph"];
      const coll = graph.find((n: any) => n["@type"] === "CollectionPage");
      expect(coll.mainEntity.itemListElement).toEqual([{ "@type": "ListItem", position: 1, url: `${SITE}/${l}/guide/${SLUG}`, name: msg[l].guides.items[SLUG].title }]);
      const bc = graph.find((n: any) => n["@type"] === "BreadcrumbList");
      expect(bc.itemListElement).toHaveLength(2);
    }
  });

  test("25 the index links to the guide", async ({ page }) => {
    await page.goto("/it/guide");
    await expect(page.locator(`a[href="/it/guide/${SLUG}"]`).first()).toBeVisible();
  });

  test("27 28 Article JSON-LD matches the page, breadcrumb of 3 ends at the canonical", async ({ page }) => {
    for (const l of LOCALES) {
      await page.goto(`/${l}/guide/${SLUG}`);
      const graph = (await ld(page))[0]["@graph"];
      const art = graph.find((n: any) => n["@type"] === "Article");
      const canonical = `${SITE}/${l}/guide/${SLUG}`;
      expect(art.headline).toBe((await page.locator("h1").textContent())!.trim());
      expect(art.headline).toBe(msg[l].guides.items[SLUG].title);
      expect(art.description).toBe(await attr(page, 'meta[name="description"]', "content"));
      expect(art.inLanguage).toBe(l);
      expect(art.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
      expect(art.dateModified).toBe(art.datePublished);
      expect(art.mainEntityOfPage["@id"]).toBe(canonical);
      expect(art.author["@id"]).toBe(`${SITE}/#organization`);
      expect(art.publisher["@id"]).toBe(`${SITE}/#organization`);
      const bc = graph.find((n: any) => n["@type"] === "BreadcrumbList");
      expect(bc.itemListElement).toHaveLength(3);
      expect(bc.itemListElement[2].item).toBe(canonical);
    }
  });

  test("30 the date, the invitation and the way back are there", async ({ page }) => {
    await page.goto("/it/guide/" + SLUG);
    await expect(page.locator("body")).toContainText(`${msg.it.guides.updated}: ${msg.it.guides.updatedOn}`);
    await expect(page.getByRole("link", { name: msg.it.guides.try })).toHaveAttribute("href", "/it#try");
    await expect(page.getByRole("link", { name: msg.it.guides.back })).toHaveAttribute("href", "/it/guide");
  });

  test("29 an unknown slug is a real 404", async ({ page }) => {
    const res = await page.goto("/it/guide/xyz");
    expect(res?.status()).toBe(404);
    expect(await attr(page, 'meta[name="robots"]', "content")).toMatch(/noindex/);
  });
});

test.describe("legal", () => {
  for (const kind of ["privacy", "terms"] as const)
    test(`31 ${kind}: date shown, controller and contact visible (a placeholder while the build has no LEGAL_ENTITY / CONTACT_EMAIL)`, async ({ page }) => {
      for (const l of LOCALES) {
        await page.goto(`/${l}/${kind}`);
        const body = await page.locator("body").innerText();
        expect(body).toContain(msg[l].legal.updatedOn);
        // The e2e build runs without the variables: the page must say so instead of hiding the section.
        expect(body).toContain(msg[l].app.legal.entityPlaceholder);
        expect(body).toContain(msg[l].app.legal.contactPlaceholder);
      }
    });
});

test.describe("site files", () => {
  test("1 robots.txt", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const txt = await res.text();
    const star = txt.split(/\n\s*\n/).find((g) => /User-Agent: \*/i.test(g))!;
    for (const rule of ["Disallow: /api/", "Disallow: /*/c/", "Disallow: /*/join/", "Disallow: /*/sign-in", "Disallow: /*/home", "Disallow: /*/account", "Allow: /"]) expect(star).toContain(rule);
    const blocked = txt.split(/\n\s*\n/).find((g) => /GPTBot/.test(g))!;
    for (const bot of ["GPTBot", "ClaudeBot", "CCBot"]) expect(blocked).toContain(`User-Agent: ${bot}`);
    expect(blocked).toContain("Disallow: /");
    expect(txt).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });

  test("2 sitemap.xml: 15 URLs, 4 alternates each, x-default Italian, every page answers 200 with no redirect", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("xml");
    const xml = await res.text();
    const urls = xml.split("<url>").slice(1);
    expect(urls).toHaveLength(PAGES.length * LOCALES.length);
    for (const u of urls) {
      const loc = /<loc>([^<]+)<\/loc>/.exec(u)![1];
      const alts = [...u.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)];
      expect(alts.map((a) => a[1]).sort()).toEqual(["en", "es", "it", "x-default"]);
      const sub = loc.replace(`${SITE}/`, "").replace(/^(it|en|es)/, "");
      expect(alts.find((a) => a[1] === "x-default")![2]).toBe(`${SITE}/it${sub}`);
      const local = loc.replace(SITE, "");
      const r = await request.get(local, { maxRedirects: 0 });
      expect(r.status(), local).toBe(200);
    }
  });

  test("33 private pages are noindex, script-bearing shells, and not in the sitemap", async ({ request, page }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    for (const l of LOCALES)
      for (const p of ["sign-in", "home", "account", "c/anything", "c/anything/settings", "join/ABCD2345"]) {
        const r = await page.goto(`/${l}/${p}`);
        expect(r?.status(), p).toBe(200);
        expect(await attr(page, 'meta[name="robots"]', "content"), `${l}/${p}`).toMatch(/noindex/);
        expect(xml).not.toContain(`/${l}/${p}`);
      }
  });

  test("the root page links to the three languages and says which is which", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "it");
    for (const l of LOCALES) {
      const a = page.locator(`a[href="/${l}"]`);
      await expect(a).toHaveCount(1);
      await expect(a).toContainText(msg.it.app.languages[l]);
    }
    expect(await attr(page, 'link[rel="canonical"]', "href")).toBe(`${SITE}/`);
  });

  test("a missing page is a 404 with the 404 page (not a soft 200), only in the language of the address, noindex, no JavaScript", async ({ page }) => {
    for (const [l, others] of [["it", ["en", "es"]], ["en", ["it", "es"]], ["es", ["it", "en"]]] as const) {
      const res = await page.goto(`/${l}/this-does-not-exist`);
      expect(res?.status()).toBe(404);
      await expect(page.locator("html")).toHaveAttribute("lang", l);
      await expect(page.locator("h1")).toContainText(msg[l].errors.notFoundTitle);
      for (const o of others) await expect(page.locator("body")).not.toContainText(msg[o].errors.notFoundTitle);
      expect(await attr(page, 'meta[name="robots"]', "content")).toMatch(/noindex/);
      expect(await page.locator("script[src]").count()).toBe(0);
      await expect(page).toHaveTitle(`${msg[l].errors.notFoundTitle} · Pausa`);
    }
  });
});
