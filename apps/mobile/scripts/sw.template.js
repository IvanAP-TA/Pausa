/* Pausa service worker. TEMPLATE: scripts/postexport.mjs fills in three placeholders (version, asset list, shell pages) and writes dist/sw.js.
 *
 * Registered ONLY by the signed-in app shell (src/pwa/register.ts); public pages never register it. Once active its scope is "/",
 * so it also sees navigations to public pages, where it does nothing but fall back to /offline.html when the network is gone.
 *
 *   - precache:  the app shell of THIS build (every JS/CSS chunk, the fonts, the icons, /{locale}/home for the three languages and
 *                /offline.html). The cache name carries the build version, so a new build never mixes with an old one.
 *   - static assets (/_expo/, /fonts/, /assets/, /icons/): precache first, else stale-while-revalidate in the runtime cache.
 *   - navigations: network first (the HTML is never stale while online, 6 s patience); offline or too slow, a private page gets the
 *                cached shell (the client router renders the right screen from the URL), a public page gets its last copy, then
 *                /offline.html.
 *   - /api/* and everything that is not a GET: not touched (network only). Their failures reach the screens' own error states.
 *   - update: a new worker installs and WAITS. The page shows "update available"; its button posts {type:"SKIP_WAITING"}, the new
 *                worker activates, deletes the old caches, and the page reloads on `controllerchange`.
 */
"use strict";

const VERSION = "__VERSION__";
const PRECACHE = `pausa-pre-${VERSION}`;
const RUNTIME = `pausa-run-${VERSION}`;
/** Same-origin URLs of this build that make the shell work offline. */
const ASSETS = __ASSETS__;
/** The cached shell page per language: any private URL of that language is answered with it when the network is gone. */
const SHELL = __SHELL__;
const OFFLINE_URL = "/offline.html";
const LOCALE_RE = /^\/(it|en|es)(\/|$)/;
const STATIC_RE = /^\/(_expo|fonts|assets|icons)\//;
const NAV_TIMEOUT_MS = 6000;

/** Public pages: `/`, `/{l}`, `/{l}/guide...`, `/{l}/privacy`, `/{l}/terms`. Everything else under `/{l}/` is the private shell. */
const isPublicPath = (p) => p === "/" || /^\/(it|en|es)\/?$/.test(p) || /^\/(it|en|es)\/(guide|privacy|terms)(\/|$)/.test(p);
const localeOf = (p) => (LOCALE_RE.exec(p) || [])[1] || "it";

/** A response that can answer a navigation: the browser refuses redirected responses there, so those are rebuilt without the flag. */
async function clean(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      // One by one with `reload`: a copy from the HTTP cache of an older build must not end up in this version's cache.
      await Promise.all(
        [...ASSETS, OFFLINE_URL].map(async (url) => {
          const res = await fetch(new Request(url, { cache: "reload" }));
          if (!res.ok) throw new Error(`precache ${url}: ${res.status}`);
          await cache.put(url, await clean(res));
        }),
      );
      // No skipWaiting() here: an update waits until the person taps "update" (a page must not change code under their hands).
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("pausa-") && key !== PRECACHE && key !== RUNTIME) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") void self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // TMDB posters, AniList covers: the browser handles them
  if (url.pathname.startsWith("/api/")) return; // network only
  if (url.pathname === "/sw.js") return;
  if (req.mode === "navigate") {
    event.respondWith(navigate(req, url, event));
    return;
  }
  if (STATIC_RE.test(url.pathname) || url.pathname === "/favicon.ico") event.respondWith(staticAsset(req, event));
});

async function staticAsset(req, event) {
  const pre = await caches.match(req, { cacheName: PRECACHE });
  if (pre) return pre; // build assets are content-hashed: the precached copy IS the file
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req);
  const refresh = fetch(req)
    .then((res) => {
      if (res.ok) void cache.put(req, res.clone());
      return res;
    })
    .catch(() => undefined);
  event.waitUntil(refresh);
  return hit || (await refresh) || Response.error();
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function navigate(req, url, event) {
  const path = url.pathname;
  try {
    const res = await withTimeout(fetch(req), NAV_TIMEOUT_MS);
    // A public page that loaded is kept (last copy) so it can be read again offline. Private pages are never stored: they are the shell.
    if (res.ok && isPublicPath(path)) {
      const copy = res.clone(); // cloned now, before the page starts reading the body
      event.waitUntil(caches.open(RUNTIME).then((c) => c.put(path, copy)));
    }
    return res;
  } catch {
    if (LOCALE_RE.test(path) && !isPublicPath(path)) {
      const shell = await caches.match(SHELL[localeOf(path)] || SHELL.it, { cacheName: PRECACHE });
      if (shell) return shell;
    }
    const last = await caches.match(path, { cacheName: RUNTIME });
    if (last) return last;
    return (await caches.match(OFFLINE_URL, { cacheName: PRECACHE })) || Response.error();
  }
}

// Web Push: the server sends a push with NO payload (crates/api/src/webpush.rs). Waking up, the worker asks what is new and says it.
const PUSH_LINE = {
  it: { log: "ha visto {t}", comment: "ha commentato {t}", reaction: "ha reagito a {t}", now_watching: "sta guardando {t}", serata_invite: "ti invita a una Serata", circle_join: "è entrato nel gruppo", mention: "ti ha nominato su {t}", other: "novità", someone: "Qualcuno" },
  en: { log: "watched {t}", comment: "commented on {t}", reaction: "reacted to {t}", now_watching: "is watching {t}", serata_invite: "invites you to a Serata", circle_join: "joined the group", mention: "mentioned you on {t}", other: "news", someone: "Someone" },
  es: { log: "ha visto {t}", comment: "ha comentado {t}", reaction: "ha reaccionado a {t}", now_watching: "está viendo {t}", serata_invite: "te invita a una Serata", circle_join: "se ha unido al grupo", mention: "te ha mencionado en {t}", other: "novedades", someone: "Alguien" },
};

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let n = null;
      try {
        const res = await fetch("/api/notifications", { credentials: "include" });
        const page = res.ok ? await res.json() : null;
        n = page && page.items ? page.items.find((i) => !i.read) || null : null;
      } catch {
        n = null;
      }
      const lang = (self.navigator.language || "it").slice(0, 2);
      const L = PUSH_LINE[lang] || PUSH_LINE.it;
      const who = (n && n.actor && n.actor.name) || L.someone;
      const title = (n && n.media && n.media.title) || "";
      const line = (L[n ? n.type : "other"] || L.other).replace("{t}", title).trim();
      const url = n ? (n.circleId && n.logId ? `/${lang}/c/${n.circleId}/log/${n.logId}` : n.circleId ? `/${lang}/c/${n.circleId}` : `/${lang}/notifications`) : "/";
      await self.registration.showNotification((n && n.circleName) || "Pausa", { body: `${who} ${line}`.trim(), icon: "/icons/icon-192.png", tag: n ? n.id : undefined, data: { url } });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) {
          await c.focus();
          if ("navigate" in c) await c.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
