# Pausa

Il diario privato della tua Cerchia: film, serie e anime, rating, commenti, liste, e la Serata per decidere cosa guardare in due minuti.
Spec: `MASTER_PROMPT_PAUSA.md` v2.2 · Design: [`design/DESIGN_PLAN.md`](design/DESIGN_PLAN.md).

**Per chi mette online il progetto: [`docs/DEPLOY.md`](docs/DEPLOY.md).** Per capire il codice: [`docs/ARCHITETTURA.md`](docs/ARCHITETTURA.md). Cosa resta da fare: [`docs/COSA_MANCA.md`](docs/COSA_MANCA.md). Test su telefono: [`docs/PHONE_TEST.md`](docs/PHONE_TEST.md).

## Stack

| | |
| --- | --- |
| App | Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 |
| i18n | `next-intl`, routes `/it` `/en` `/es` (Italian default); `/` picks from `Accept-Language` |
| Data | Cloudflare D1 (SQLite) + Drizzle ORM; migrations in `drizzle/` |
| Auth | Better Auth: email link, Google (optional), anonymous guests (for Serata, Phase 2) |
| Media | TMDB (search + localized titles), canonical `media_entity` table |
| Recommendations | Rust engine compiled to WebAssembly (`engine/`, loaded by `worker.ts`), TypeScript reference in `src/lib/core/insights.ts` |
| Deploy | Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`) |

## Run locally

```bash
npm install
cp .env.example .env.local        # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run db:migrate:local          # create the local D1 database
npm run db:seed:local             # Divano Club: 4 friends, 6 logs, 2 lists
npm run dev
```

Open http://localhost:3000 and sign in with a seed email: `giulia@pausa.test`, `marco@pausa.test`, `sofi@pausa.test`, `luca@pausa.test`.
In dev the sign-in page shows four buttons, one per seed person: click one and you are in (no email). That shortcut (`/api/dev/login`) exists only when `NODE_ENV=development`. Typing an email still works too: with no email provider the link is printed in the `npm run dev` terminal.

`npm run db:reset:local` wipes and re-seeds the local DB. On Windows, stop `npm run dev` first (it locks the DB file).

## Scripts

| Script | What it does |
| --- | --- |
| `dev` / `build` | Next.js dev server / production build |
| `test` | Unit tests of the domain logic and the Rust engine parity (real SQLite, no browser) |
| `e2e` | Playwright: main journeys and an axe accessibility audit (needs the seeded local DB) |
| `engine:build` | Recompile the Rust engine to `src/lib/engine/engine.wasm` (committed; only after changing `engine/`) |
| `dev:lan` | Dev server reachable from a phone on the same Wi-Fi |
| `typecheck`, `lint` | `tsc --noEmit`, ESLint |
| `db:generate` | Generate a migration from `src/db/schema.ts` |
| `db:migrate:local` / `db:migrate:remote` | Apply migrations to local / production D1 |
| `db:seed:local`, `db:reset:local` | Seed / wipe + migrate + seed local D1 |
| `preview` | Build for Workers and run it locally in workerd |
| `deploy` | Build for Workers and deploy |
| `cf-typegen` | Regenerate `cloudflare-env.d.ts` after editing `wrangler.jsonc` |

## First deploy (not done yet)

1. `npx wrangler d1 create pausa` → put the id in `wrangler.jsonc`.
2. `npm run db:migrate:remote`
3. Secrets: `npx wrangler secret put BETTER_AUTH_SECRET` (and `BETTER_AUTH_URL=https://pausa.gnagno.org`, `RESEND_API_KEY`, `EMAIL_FROM`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TMDB_API_TOKEN`).
   Without `RESEND_API_KEY`, sign-in fails in production on purpose (links are never logged there).
4. `npm run deploy`, then route `pausa.gnagno.org` to the Worker.

## Layout

```
src/
  app/[locale]/          pages (sign-in, join/[code], c/[circleId]/{feed,log,lists,members,serata})
  app/api/auth/          Better Auth handler
  components/            Poster, Stars, LogCard, Reactions, Spoiler, TabBar, Avatar
  db/schema.ts           all tables (auth + Cerchie + media + diario + liste + notifiche)
  lib/data.ts            reads (every Cerchia read checks membership)
  lib/actions.ts         server actions (create/join Cerchia, log, react, search, lists)
  lib/auth.ts            Better Auth config
  lib/tmdb.ts            TMDB search → media_entity + media_title
messages/{it,en,es}.json UI strings (ICU plurals)
seed/seed.sql            local seed data
design/                  Design Plan, locked tokens, direction prototype
```

## Decisions worth knowing

- **No proxy/middleware.** Locale lives in the URL; server actions receive the locale from the form. Node-runtime proxy is still experimental on Workers.
- **Cache Components off.** Every page is per user and per Cerchia; revisit after Phase 2.
- **A log is visible to every Cerchia its author belongs to.** "Visto con" only accepts members of the Cerchia you're logging from.
- **Non-members get 404**, not 403: a Cerchia's existence is private.
- **TMDB attribution** is shown on sign-in and on the Cerchia page, as the TMDB terms require. The free API is non-commercial.

## Phase 1 status

Done:
- Cerchie + invite links/codes
- Diary: half-star rating, review, spoiler guard, "visto con", rewatch, platform
- Reactions and comment threads (spoiler-guarded comments)
- "Sto guardando": set from the log form (with episode), clear with "Finito o mollato"
- Group lists and personal lists, add any logged title to a list
- Notifications inbox: new log, comment, reaction, "sto guardando", new member; marked read when seen
- Sign-in email via Resend (`RESEND_API_KEY`), sent in the language of the page it was requested from
- PWA: manifest, app icons (generated), iOS home-screen metadata
- IT / EN / ES throughout

Needs your accounts before the first deploy: Resend key + verified sender, Google OAuth keys, TMDB read token, D1 database id.
Push notifications and the offline page came later (see "Settings, notifications and the PWA").

## Phase 2: Serata

From a Cerchia's **Serata** tab: pick a mode and a shortlist of 2–8 titles (group watchlists first, or search), then share the link `/<locale>/s/<CODE>`.

- **Torneo lampo (bracket):** single elimination, one head-to-head at a time, 30 s per match. Byes go to the top seeds. A match closes when everyone has voted or time is up; a tie is a random draw.
- **Tavolo:** everyone places exactly 3 dots and may veto one title, 60 s. Most dots wins among non-vetoed titles (if everything is vetoed, vetoes are ignored).
- **Guests** join with a name only: an anonymous Better Auth session (a cookie, no OAuth, fine in WhatsApp/Instagram browsers). Guests can't reach the rest of the app. After the result they're offered to save the account (email link; their Serata moves to the new account) and to join the Cerchia.
- **Result Card 9:16** (Locandina style): shown in the room, public at `/<locale>/s/<CODE>/card` with a link-preview image, and as a story PNG (`/api/serata/<CODE>/card`, 1080×1920) shared as a file where the phone supports it. The Card never shows who voted what.
- **Log from the Serata:** members get "Registra nel diario" with the winner preselected and the other members tagged as "visto con".

How it works: rules live in `src/lib/serata/engine.ts` (pure functions, tested in `engine.test.ts`, `npm test`). Phones poll `/api/serata/<CODE>` every 1.5 s; it answers 204 when nothing changed. Closing a match uses compare-and-set on `serata.version`, so two simultaneous "last votes" close it once. Durable Objects are the upgrade path if polling ever feels slow.

Testing two people locally: open the host on `http://localhost:3000` and the guest on `http://127.0.0.1:3000` (separate cookies; allowed in dev only).

## Landing page

`/<locale>` shows a public landing page to anyone who isn't signed in (signed-in people go straight to their Cerchia).
Smooth scrolling and a light parallax come from [Lenis](https://lenis.darkroom.engineering) (`src/components/landing/smooth-scroll.tsx`); the hero entrance is pure CSS, sections fade in on scroll, and "How it works" is a sticky panel that follows the scroll.
Everything animated is switched off for `prefers-reduced-motion`. The page includes a real, tiny Serata people can play before signing up, a sticky call-to-action on phones, an FAQ, per-language metadata with hreflang, structured data (WebApplication and FAQPage), `robots.txt`, `sitemap.xml` and a social preview image.
Copy lives in `messages/*.json` under `landing`. It makes no claim that isn't true today (no invented numbers, reviews or logos).
Set `NEXT_PUBLIC_SITE_URL` (or `BETTER_AUTH_URL`) to the public origin so canonical links and the sitemap are right.

## Invites and roles

A Cerchia can have many invites, each with an optional expiry and use limit, and any of them can be revoked. A new Cerchia starts with a 14-day invite. Admins create and revoke invites and manage roles (promote, demote, remove); anyone can leave. A Cerchia always keeps an admin: the last one can't be demoted or leave while others remain. A used-up, expired or revoked link says exactly that on the join page.
The logic is in `src/lib/core/circles.ts`.

## Insights

`/<locale>/c/<circle>/insights`, linked from the Cerchia page: Year in Review (watches, titles, hours of films, average rating, title of the year, most active, busiest month, top platform, who watches together most), taste similarity between members, titles you agree and split on, and "worth watching together".
All of it is computed from the Cerchia's own logs and ratings (`src/lib/core/insights.ts`), with these rules: similarity needs at least 3 shared rated titles, hours count films only (series store a per-episode runtime), recommendations come from your own ratings weighted by taste (an opposite-taste rating counts mirrored), and someone already watching a title isn't offered it.
The "where to watch" filter needs the TMDB token (see "TMDB token").

## Settings, notifications and the PWA

- **Cerchia settings** (members page, admins): description and cover image, and a switch that turns off the live "X is watching episode N" notices for the whole Cerchia. Each person can also switch off their own live notices, and **mute** a Cerchia (nothing from it is notified). Logic and tests: `src/lib/core/settings.ts`.
- **Notification preferences** (Account page): per type (log, comment, reaction, watching, new member, Serata) and per channel (inbox, push). `filterRecipients` in `src/lib/actions.ts` is applied at every place that notifies.
- **Email fallback / daily digest**: people who opt in get one email a day with what they missed, sent by the scheduled handler in `worker.ts` (cron `0 17 * * *`, needs `RESEND_API_KEY`; a second cron `17 3 * * *` does the cleanup). Code: `src/lib/core/digest.ts`, `mailer.ts`.
- **Offline page and iPhone splash**: `public/sw.js` caches only `/offline.html` (never a private page) and handles push; `src/app/apple-splash/[size]` draws the splash images for each iPhone size (`src/lib/splash.ts`); `RegisterSw` registers the worker.
- **Content-Security-Policy**: static, set in `next.config.ts` (no nonce, on purpose: see `docs/SICUREZZA.md`).

## Episodes and people

- **Episode diary.** A log of a series or anime can carry season and episode. Season and episode counts come from TMDB (series) and AniList (anime), cached in `media_episodes` (migration 0011); the inputs stop at the real last episode, and finishing the last episode of a season rolls over to the next (`src/lib/core/episodes.ts`, `progress.ts`, `src/lib/episode-info.ts`).
- **AniList and MyAnimeList.** AniList (GraphQL, public, no key) searches anime and gives covers, titles, episode totals and the official streaming sites (`src/lib/anilist.ts`); MyAnimeList lists are read by username through Jikan (public) or from the XML export. The Jikan response shape has not been tried against the live API: test it once.
- **Person page** (`/c/<circle>/p/<user>`, members only): their logs, favourites, stats, taste similarity with you, what they are watching now.
- **Feed search and filters** (`?q=`, kind, person, rating, streaming service): `src/lib/data.ts` `getCircleFeed`, UI in `c/[circleId]/filter-bar.tsx`.
- **Landing.** The hero has the Google sign-in button; "Prova la Serata" lives only in the navbar.

## Group ranking and list import

- **Ranking** (`/<locale>/c/<circle>/ranking`, linked from the diary and the Cerchia tab): every title anyone in the Cerchia logged, with each member's latest rating, the group's average and the number of votes. Filters: search, type, who watched it, release year (from / to), minimum votes (starts at 2 from three members up, so one lonely 5★ does not top the list), "only what everyone watched"; sort by average, most rated, release year, recently watched or title; 40 per page, all in the URL. Genre is not filtered: the app does not store it. Logic and tests: `src/lib/core/ranking.ts`.
- **Letterboxd lists and watchlist.** The Letterboxd tab also reads `watchlist.csv` and the `lists/` folder of the export ZIP (or a list CSV picked on its own, from a list's ··· menu → *Export list as CSV*). The person chooses to import them as personal lists or as group lists. Importing again fills the same list (found by owner, Cerchia and name) and adds only what is missing. Code: `letterboxdList` / `letterboxdWatchlist` in `import-parsers.ts`, `importList` in `import.ts` (shares `resolveMedia` with the diary import), `importListChunk` in `src/lib/import/actions.ts`. Letterboxd does not export the *likes*, only links, so those are not imported.

## Tests

`npm test` runs the Serata engine and the `src/lib/core` modules against a real SQLite: `sql.js` (WebAssembly, no native build) with the project's actual migrations applied and foreign keys on, like D1. Core modules take the database as a parameter, so tests and app share the same queries.

## Importing your history

`/<locale>/c/<circle>/import`, linked from the Cerchia page. Five sources (Letterboxd, IMDb, Trakt, AniList, MyAnimeList), all read in the browser, then sent to the server in small chunks:

- **Letterboxd:** upload the ZIP from *Settings → Data → Export your data* (or `diary.csv`, `ratings.csv`, `reviews.csv`, `watched.csv`). One viewing per diary entry, with rewatch flag, rating, review and watched date; films that only appear in ratings/watched become one viewing dated by when you rated or marked them. Only the ZIP's top-level files are read (`deleted/`, `lists/`… are ignored). With a TMDB token the server matches each film to TMDB (title and year within one year) for cover and localized title; without one, films import with no cover.
- **AniList:** a username. The browser reads the public list of completed anime straight from AniList's API (the profile must be public while you import); the server then looks up covers and titles by id.
- **MyAnimeList:** the `.xml` or `.xml.gz` export. Only *Completed* anime are imported; the count of what was left out (watching, planned, on hold, dropped) is shown. Covers and titles come from AniList by MAL id.

How it behaves: imports are **idempotent** (a viewing already logged for the same title and date is skipped, so re-running or overlapping exports add nothing); titles are matched to what the app already has by source id, then by title and year, so imported films join the same title other people logged; imported logs are dated by when they were watched, so they don't flood the feed, and **create no notifications**; they are visible to all the importer's Cerchie, which the page says up front. Items with no date are left out unless the person opts to date them today.

Security: the browser may only send the person's own data and the source id. Posters, TMDB ids and localized titles are looked up by the server (TMDB / AniList) and anything else is dropped, so a member can't make other people's browsers load a URL of their choosing. Cover URLs are only accepted from TMDB paths or `https://s4.anilist.co/`.

Limits: the work is split into chunks of 20 films (each triggers a TMDB lookup) or 30 anime. A test (`import.test.ts`, "D1 limits") records every query of a worst-case chunk and fails if one binds more than 100 variables or a chunk needs more than 45 queries, the limits of D1 and of the free Workers plan. Not done: importing watchlists/lists, MAL "plan to watch", and AniList private profiles.

## Launch basics

- **Edit and delete.** Logs (author only; comments and reactions go with it), comments (author edits; author or the log's owner deletes), lists (rename, remove items, reorder rankings, add any title by search, delete). Rules live in `src/lib/core/content.ts` and are tested on real SQLite.
- **Cerchia profile.** Admins rename it; people in several Cerchie switch from the Cerchia tab, and the app reopens the last one used (cookie `pausa-circle`).
- **Account** (`/account`): name, JSON export of your data (`/api/account/export`), deletion with the email typed back. Deleting hands a Cerchia you created to its oldest other member (made admin) and deletes it if you were alone (`src/lib/core/account.ts`).
- **Legal** (`/privacy`, `/terms`, in it/en/es, linked from the footer and the account page): `src/lib/legal.ts`. **It is a draft written from what the code does and has not been reviewed by a lawyer.** Set `CONTACT_EMAIL` and `LEGAL_ENTITY` (shown at the bottom of both pages) before launch.
- **Abuse limits.** Better Auth's rate limiter, stored in D1 (`rate_limit`, migration 0004): 5 sign-in emails per 10 min and 10 guests per hour per IP, 60 requests/min overall.
- **Errors.** Translated not-found and error pages. The feed pages 20 at a time (`?before=`).

## Retention

- **Memorie** ("a year ago…"): logs from the same calendar day (±3 days) in earlier years, shown on top of the feed with their review.
- **First steps** checklist (log something, invite someone, run a Serata), gone when all three are done.
- **Guest avatars**: guests pick one of eight emoji when joining a Serata (stored as `emoji:<glyph>` in `user.image`, whitelisted).

- **Episodes and seasons.** "Sto guardando" stores season and episode (`now_watching.season/episode`), with **+1 episode** and **New season** buttons on the feed; old free-text labels such as `S1·E9` are read when you first tap. A log of a series or anime can name its season (`log.season`). Logic in `src/lib/core/progress.ts`, tested. There is no per-episode diary and no episode count from TMDB yet (inputs accept 1..99 seasons, 1..9999 episodes).

Streaming filters, individual recommendations, web push and launch metrics are done (sections below).

## TMDB token

Put the v4 **API Read Access Token** (themoviedb.org → Settings → API) in `.env.local` as `TMDB_API_TOKEN=...` for local work (the file is git-ignored), and in production with `npx wrangler secret put TMDB_API_TOKEN`. Never paste it in chat or commit it. Without it Pausa still works: search covers only titles already in the database, and the features below show an "off" note.

With the token:
- **Streaming services in common.** Each person picks their country and services on the Account page (`user_provider`); availability per title is cached for a week (`media_provider`, from TMDB watch providers, data by JustWatch, credit shown on screen). The Serata shows which services everyone has, and the suggested roster drops titles the shared services cannot stream.
- **For you** (Insights page): TMDB recommendations seeded from the titles you rated 4 stars or more, merged and ranked (`src/lib/core/discovery.ts`), never what you have already logged, with a badge when it is on one of your services.

## Killer features and sharing

- **Fill the roster for us** (new Serata): watchlist + group recommendations, minus titles half of the group has seen, minus what the shared services cannot stream (`src/lib/core/roster.ts`, tested). No token needed for the base roster.
- **Link previews.** An open Serata link previews as an invitation ("<host> invites you…", mode, a strip of posters) at `/api/serata/<code>/invite`; a finished one as its Card. Neither shows who voted what.
- **Year card** (9:16, `/api/circle/<id>/year/<year>/card`, members only) with a share button on the Insights page: totals and the title of the year, no individual ratings.

## SEO

Landing in three languages (hreflang, JSON-LD, OG) plus eight public guides per language under `/guide` (`src/lib/guides.ts`): choosing a film with friends, bracket vs dot voting, a Letterboxd alternative for friends, how to run a movie night. Each has Article + Breadcrumb JSON-LD, canonical and hreflang, and a call to try a Serata; they are in the sitemap. `public/llms.txt` describes the site for AI crawlers. After deploy: register the domain in Search Console and Bing Webmaster Tools and submit `/sitemap.xml`.

## Native app (Tauri v2)

`src-tauri/` is a thin shell that opens the hosted app (`https://pausa.gnagno.org/it`) in a window, or in a webview on iOS/Android, so there is one UI to maintain. Icons are generated from the PWA icon. Commands:

- `npm run tauri dev` (opens the shell on `http://localhost:3000/it`; run `npm run dev` first)
- `npm run tauri build` (desktop installer)
- `npm run tauri android init` / `npm run tauri ios init`, then `... dev` / `... build`, once the Android SDK / Xcode are installed.

Not done yet: native push notifications (they need a Tauri notification plugin plus a server-side sender, not in the web app yet) and store submission. Android needs the Android SDK and NDK; iOS needs a Mac with Xcode.

**Windows prerequisite.** Building the Tauri shell needs the Microsoft C++ Build Tools ("Desktop development with C++" workload, which provides `link.exe`) and WebView2. On the dev machine used so far they are not installed, so `cargo check` stops at "linker `link.exe` not found": the shell's code has not been compiled yet. In Git Bash a GNU `link` can also shadow the MSVC one; run Tauri commands from PowerShell.

## Notifications, metrics and phone tests

- **Web Push** (`src/lib/push.ts`, `public/sw.js`, toggle on the Account page): sent when someone logs, comments, reacts, starts watching, joins, or opens a Serata (the tap opens the log or the Serata). It uses WebCrypto (`@block65/webcrypto-web-push`), so it runs on Workers; dead subscriptions are deleted. Generate keys with `node scripts/vapid.cjs --write-env` (local) and in production set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (build-time variable), `VAPID_PRIVATE_KEY` (`wrangler secret put`) and optionally `VAPID_SUBJECT`. Needs HTTPS; on iPhone only from the installed Home Screen app. Without keys the Account page says notifications are not configured and nothing is sent.
- **Metrics** (`/it/admin/metrics`, `src/lib/core/metrics.ts`): the §10 numbers from the database plus `event` rows for shared Cards and invites. Only emails in `ADMIN_EMAILS` can open it (in dev, the first seed person). "n.d." means not enough data.
- **Phone tests**: `npm run dev:lan` and the checklist in `docs/PHONE_TEST.md`.
