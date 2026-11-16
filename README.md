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
