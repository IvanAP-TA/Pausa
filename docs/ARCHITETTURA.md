# Architettura

## Stack

| Layer | Scelta | Note |
|---|---|---|
| Frontend / BFF | Next.js 15.5 (App Router, `src/`) | server components + server actions |
| Linguaggio | TypeScript strict | |
| Styling | Tailwind v4 (config in CSS) | `@tailwindcss/postcss` |
| Database | Cloudflare D1 (SQLite) | via Drizzle ORM |
| Migrazioni | drizzle-kit | `src/db/migrations/` |
| Deploy | Cloudflare (via `@opennextjs/cloudflare`) | adapter attuale (next-on-pages deprecato) |
| Auth | **custom** (sessioni D1 + Google OAuth + magic-link HMAC) | Lucia scartata perché deprecata |
| Media | TMDB (mockato in dev) | |
| Test | Vitest | unit + integration SQLite reale |
| Package manager | **npm** | pnpm non installabile (corepack EPERM) |

**Glossario:** BFF = backend-for-frontend (il server di Next che parla col DB); server action = funzione server chiamata da un form senza scrivere API; ORM = strato che mappa tabelle a oggetti TS; D1 = SQLite gestito da Cloudflare; edge = server vicino all'utente.

## Perché l'app sta in una sottocartella

L'app Next vive in `Ivan progetto/pausa/`. Il nome "Ivan progetto" non è un nome npm valido (maiuscola + spazio), quindi lo scaffold è in `pausa/`. La documentazione e le spec stanno a livello progetto in `Ivan progetto/docs/`.

## Struttura cartelle

```
Ivan progetto/
  MASTER_PROMPT_PAUSA(1).md     # spec prodotto originale
  docs/                          # questa documentazione
  pausa/
    wrangler.toml                # binding D1 + migrations_dir
    .dev.vars                    # variabili locali (MOCK_MODE=1) — gitignored
    drizzle.config.ts
    next.config.ts               # init opennext per dev
    src/
      env.ts                     # accesso tipizzato alle env (+ isMockMode)
      lib/id.ts                  # newId() = crypto.randomUUID
      db/
        schema.ts                # TUTTE le tabelle Drizzle
        index.ts                 # getDb(d1) -> Drizzle
        migrations/              # SQL generati
      modules/                   # logica di dominio (isolata, testabile)
        auth/                    # token, session, google, index
        tmdb/                    # client, mapper, mock, index
        circles/                 # Cerchie, inviti, ruoli
        diary/                   # log, rating, commenti, reazioni
        lists/                   # liste personali/gruppo
        feed/                    # timeline attività
        notifications/           # notifiche in-app
        serata/                  # Fase 2: bracket, tavolo, index
        now-watching/            # Fase 2: "sto guardando"
        recs/                    # Fase 3: similarità, consigli, aggregate
      app/                       # route Next (pagine + api + server actions)
        _actions.ts              # tutte le server action
        page.tsx                 # landing/login
        circles/...              # Cerchie, diario, log, serata/new, insights
        serata/[id]/             # room Serata (guest-first)
        api/auth/...             # google, magic, dev (mock), verify
        manifest.ts              # PWA manifest
      ui/
        tokens via globals.css   # palette Midnight Screening Room
        components/              # StarRating, PosterCard, SpoilerText,
                                 # LivePoll, ResultCard, SWRegister
    public/                      # icon.svg, sw.js (PWA)
    tests/                       # mirror dei moduli
```

## Modello dati (tabelle D1)

### Fase 1
- **users** — id, email, name, avatar_url, created_at
- **sessions** — id, user_id, expires_at
- **circles** — id, name, created_by, created_at
- **circle_members** — (circle_id, user_id) PK, role (admin|member), joined_at
- **invites** — id, circle_id, code (unique), created_by, expires_at?, max_uses?, uses
- **media_entities** — id (UUID interno), tmdb_id (unique), imdb_id?, anilist_id?, type (movie|tv|anime), title, year?, poster_path?, overview?, cached_at — *tabella canonica, un titolo = una riga*
- **log_entries** — id, circle_id, user_id, media_entity_id, rating?, watched_on?, platform?, created_at
- **log_watched_with** — (log_id, member_user_id) PK — tag "visto con"
- **comments** — id, log_id, user_id, body, is_spoiler, created_at
- **reactions** — id, target_type (log|comment), target_id, user_id, emoji, created_at
- **lists** — id, scope (personal|circle), owner_user_id?, circle_id?, name, is_ranked, created_at
- **list_items** — (list_id, media_entity_id) PK, position, added_by, added_at
- **notifications** — id, user_id, type, payload_json, is_read, created_at

### Fase 2
- **serate** — id, circle_id?, mode (bracket|tavolo), status (open|done), created_by, winner_media_id?, created_at
- **serata_candidates** — (serata_id, media_entity_id) PK, position
- **serata_participants** — id, serata_id, user_id?, guest_name, avatar?, joined_at — *user_id null = ospite*
- **serata_votes** — id, serata_id, participant_id, media_entity_id, kind (dot|veto|pick), round, created_at
- **now_watching** — id, user_id, circle_id, media_entity_id, started_at

## Flusso dati principale

1. Ricerca titolo → `tmdb.searchMedia` (mock: catalogo locale).
2. Selezione → `tmdb.getOrCacheMovie` → upsert in `media_entities` → id interno.
3. `diary.createLog(circleId, userId, mediaEntityId, rating…)`.
4. Commenti / reazioni / "visto con" collegati al log.
5. `feed.getFeed` o query dirette aggregano la timeline della Cerchia.
6. Eventi → `notifications.notify` verso i membri (nelle server action).

## Principi di struttura

- Ogni modulo in `src/modules/` ha una responsabilità, un'interfaccia pubblica (`index.ts`) e dipendenze esplicite (`db`, altri moduli).
- La **logica pura** (validazione rating, tally voti, bracket, similarità) è separata e testata senza DB.
- Le **server action** (`app/_actions.ts`) orchestrano: autenticano, chiamano i moduli, invalidano la cache.
- Le pagine sono server component che leggono via moduli/query e mutano via action.
