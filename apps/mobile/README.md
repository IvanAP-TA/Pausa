# Pausa client (Expo SDK 58: Android + web)

One React Native / React Native Web app. Own `package.json` and `node_modules`; the repo root belongs to the old Next.js app.

```
npm install                 # first time
npm run typecheck           # tsc --noEmit
npm test                    # vitest: tokens + contrast, i18n, API errors/client, postexport, budget, pure helpers
npm run build:web           # expo export -p web  +  scripts/postexport.mjs
npm run budget              # JS sizes; fails over 350 KB brotli; fails if a public page ships any JS
npm run test:e2e            # Playwright against dist/ (serve-dist.mjs); app-flow tests need the API, see below
```

## Running against a local API

`crates/api` under `wrangler dev --local --port 8798` (never `--remote`). The web build is same-origin in production
(`/api/*` goes to the Worker), so `scripts/serve-dist.mjs` serves `dist/` and proxies `/api/*` to `API_ORIGIN`
(default `http://127.0.0.1:8798`): `node scripts/serve-dist.mjs 4173`. The e2e tests start it themselves.

`EXPO_PUBLIC_API_URL` overrides the API origin (needed for `expo start`: the API sends no CORS headers, so the dev web server
cannot call it cross-origin; use the static build + serve-dist, or run native). Android emulator: `adb reverse tcp:8798 tcp:8798`
and `EXPO_PUBLIC_API_URL=http://localhost:8798` (10.0.2.2 did not work with workerd in our test).

## Legal pages

`LEGAL_ENTITY` and `CONTACT_EMAIL` are read at build time. Unset: the privacy and terms pages show a visible placeholder and the
build prints a warning.

## Layout

- `app/` routes. Public pages (`/`, `/{l}`, `/{l}/guide/*`, `/{l}/privacy`, `/{l}/terms`, 404) are static HTML with no JavaScript;
  `app/[locale]/(app)/` is the private shell (sign-in, home, Cerchia, settings, account, join).
- `src/theme` tokens (OKLCH, from `src/app/tokens.css`), `src/ui` primitives, `src/i18n` ICU formatter + catalogues,
  `src/api` typed client over `packages/api-types`, `src/features` screens, `src/seo` metadata and JSON-LD.
- `scripts/postexport.mjs`, `scripts/budget.mjs`, `scripts/serve-dist.mjs`: Node builtins only.
- Strings live in `packages/messages/{it,en,es}.json` (the old `messages/` plus the namespaces `app`, `legal`, `guides`).

## Installable, offline, security headers

- `scripts/make-icons.mjs` draws the icons from the pause mark into `public/icons/` (no dependency; `node scripts/make-icons.mjs`, a
  test checks the committed PNGs are what the script writes). `postexport.mjs` writes one manifest per language
  (`/manifest-it.webmanifest`, start URL `/{l}/home`), puts the manifest / apple-touch-icon / iOS tags in the `<head>` of every page
  (static tags: public pages stay at 0 JS), and builds `offline.html`.
- `scripts/sw.template.js` is the service worker (hand written). `postexport.mjs` fills in this build's precache list and version and
  writes `dist/sw.js`. It is registered ONLY by the app shell (`src/pwa/register.ts`, called from `app/[locale]/(app)/_layout.tsx`), never
  by a public page. An update waits; the shell shows "update available" and the tap activates it and reloads. `/api/*` is never touched.
- `src/offline/outbox.ts` is the diary's outbox (viewings written offline), shown in the diary as "waiting to be sent".
- `public/_headers` is the Cloudflare static-assets headers file (CSP, HSTS, caching). `postexport.mjs` fills the script hashes and
  fails the build if the policy loses a guard rail. `serve-dist.mjs` applies it like Cloudflare (`scripts/headers.mjs`), so
  `npm run test:e2e` runs under the real policy (`NO_HEADERS=1` turns that off for comparison).
- Playwright blocks service workers by default (a worker hides requests from `page.route`); `e2e/pwa.spec.ts` and `e2e/csp.spec.ts`
  allow them.

## Accessibility tests

`e2e/a11y-axe.spec.ts` (axe-core, WCAG 2.1 A + AA, any violation fails), `e2e/a11y-keyboard.spec.ts` (Tab order, focus indicator, sheet
focus trap, Escape), `e2e/a11y-tree.spec.ts` (what the accessibility tree exposes). The data comes from `e2e/a11y-scene.ts` (fresh
accounts every run: the API allows 5 sign-in links per address per 10 minutes and 30 members per Cerchia). `A11Y_REPORT=<file>` keeps
the numbers, `A11Y_SHOTS=<dir>` a screenshot of every scanned state. None of this is a screen-reader session.
