# Pausa

Il diario privato della tua Cerchia: film, serie e anime, rating, commenti, liste, e (Fase 2) la Serata per decidere cosa guardare.
Spec: `MASTER_PROMPT_PAUSA.md` v2.2 · Design: [`design/DESIGN_PLAN.md`](design/DESIGN_PLAN.md) (direction: **Sala**, Share Card **Locandina**).

## Stack

| | |
| --- | --- |
| App | Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 |
| i18n | `next-intl`, routes `/it` `/en` `/es` (Italian default); `/` picks from `Accept-Language` |
| Data | Cloudflare D1 (SQLite) + Drizzle ORM; migrations in `drizzle/` |
| Auth | Better Auth: email link, Google (optional), anonymous guests (for Serata, Phase 2) |
| Media | TMDB (search + localized titles), canonical `media_entity` table |
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
There is no email provider in dev: **the sign-in link is printed in the `npm run dev` terminal**. Open it in the browser.

`npm run db:reset:local` wipes and re-seeds the local DB. On Windows, stop `npm run dev` first (it locks the DB file).

## Scripts

| Script | What it does |
| --- | --- |
| `dev` / `build` | Next.js dev server / production build |
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
Not in Phase 1: push notifications and offline support (service worker).

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
Not done: a "where to watch" filter. It needs real TMDB availability data and a key.

## Tests

`npm test` runs the Serata engine and the `src/lib/core` modules against a real SQLite: `sql.js` (WebAssembly, no native build) with the project's actual migrations applied and foreign keys on, like D1. Core modules take the database as a parameter, so tests and app share the same queries.

## Importing your history

`/<locale>/c/<circle>/import`, linked from the Cerchia page. Three sources, all read in the browser, then sent to the server in small chunks:

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

Still open: episodes and seasons, a streaming-services filter and individual recommendations (they need TMDB availability data), web push with a service worker, and launch metrics.
