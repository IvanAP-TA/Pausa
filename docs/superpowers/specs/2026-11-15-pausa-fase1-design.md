# Pausa — Spec Fase 1 (Foundation + Cerchie + Diario)

**Data:** 15 Novembre 2026
**Dominio:** pausa.gnagno.org
**Fonte di verità prodotto:** `MASTER_PROMPT_PAUSA(1).md` (v2.3)
**Scope di questo spec:** solo Fase 1 della roadmap (§5). Fase 2 (Serata/realtime) e Fase 3 (media unificato + raccomandazioni) avranno spec propri.

---

## 1. Obiettivo Fase 1

Costruire il **nucleo social privato** di Pausa: un gruppo di amici (Cerchia) che tiene un diario condiviso di **film**, con rating, commenti, reazioni, "visto con", liste e feed di attività. Backend reale e persistente fin da subito.

MVP = una Cerchia funzionante in cui più utenti loggano film veri (da TMDB), si commentano, reagiscono e vedono il feed di gruppo.

---

## 2. Scope

### In scope
- Auth: Google OAuth + Email magic link
- Cerchie: creazione, inviti via link/codice, ruoli Admin/Member
- Diario film: log, rating a mezze stelle, commenti (con flag spoiler), reazioni rapide, tag "Visto con", data visione + piattaforma
- Liste: watchlist personale e di gruppo, aggiunta rapida
- Feed attività della Cerchia
- Notifiche base (in-app): nuovo log, nuovo commento, reazione, invito
- Integrazione TMDB (ricerca + dettaglio + poster) con tabella canonica `media_entities`
- Design system completo (Midnight Screening Room)

### Fuori scope (fasi successive)
- Serata / Bracket / Tavolo / realtime / Card 9:16 (Fase 2)
- Stato "Sto guardando…" (Fase 2)
- Guest-first anonimo (Fase 2 — serve solo alla Serata)
- Serie TV, episodi, anime (Fase 3)
- Import Letterboxd / AniList (Fase 3)
- Motore raccomandazioni Rust + confronto gusti (Fase 3)
- Year in Review, memorie, filtri streaming (Fase 3)
- Web Push (Fase 3, PWA completa)

---

## 3. Stack tecnico

| Layer | Scelta | Note |
|---|---|---|
| Frontend / BFF | Next.js 15 (App Router) + TypeScript | shadcn/ui + Tailwind |
| Styling | Tailwind + design tokens custom | palette anti-AI-slop (§6 spec) |
| Database | Cloudflare D1 (SQLite) | via Drizzle ORM |
| ORM / migrazioni | Drizzle + drizzle-kit | migrazioni versionate |
| Deploy | Cloudflare Pages + Workers | `@cloudflare/next-on-pages` |
| Auth | Google OAuth + Email magic link | sessione server-side |
| Media | TMDB API | gratuita, non commerciale, attribuzione obbligatoria |

**Glossario:** D1 = database SQLite gestito da Cloudflare; Workers = funzioni serverless su edge; Drizzle = ORM TypeScript (traduce codice TS in query SQL); ORM = strato che mappa tabelle DB a oggetti del codice.

---

## 4. Architettura — moduli isolati

Ogni modulo ha una responsabilità, un'interfaccia pubblica, dipendenze esplicite.

### 4.1 `db` — schema e accesso dati
Schema Drizzle + migrazioni. Punto unico di verità delle tabelle.

### 4.2 `auth` — identità e sessione
- Google OAuth + Email magic link
- Interfaccia: `getCurrentUser()`, `requireUser()`, guardie route
- Dipende da: `db` (users, sessions)

### 4.3 `tmdb` — fonte media
- Client API: `searchMovies(q)`, `getMovie(tmdbId)`
- Mapping TMDB → `media_entities` (UUID interno, upsert idempotente)
- Cache su D1 per ridurre chiamate
- Dipende da: `db` (media_entities), TMDB API key

### 4.4 `circles` — gruppi privati
- Crea Cerchia, genera codice/link invito, accetta invito, lista membri, ruoli
- Interfaccia: `createCircle`, `createInvite`, `joinByCode`, `listMembers`, `setRole`
- Dipende da: `db`, `auth`

### 4.5 `diary` — logging
- Log film in una Cerchia: rating mezze stelle, commento (flag spoiler), reazioni, "visto con" (membri), data visione, piattaforma
- Interfaccia: `createLog`, `addComment`, `addReaction`, `listLogs(circleId)`
- Dipende da: `db`, `circles`, `tmdb`

### 4.6 `lists` — watchlist e liste
- Watchlist personale + di gruppo, aggiunta rapida da qualsiasi titolo
- Interfaccia: `createList`, `addItem`, `removeItem`, `listLists(scope)`
- Dipende da: `db`, `circles`, `tmdb`

### 4.7 `feed` — attività di gruppo
- Aggrega log, commenti, reazioni, nuove liste di una Cerchia in timeline
- Interfaccia: `getFeed(circleId, cursor)`
- Dipende da: `db`

### 4.8 `notifications` — notifiche in-app
- Genera notifica su: nuovo log, commento, reazione, invito accettato
- Interfaccia: `notify(event)`, `listNotifications(userId)`, `markRead`
- Dipende da: `db`

### 4.9 `ui` — design system
- Token palette/typography/spacing, componenti base, poster-grid 2:3
- Nessuna dipendenza di dominio

---

## 5. Modello dati (tabelle D1)

- **users** — id, email, name, avatar_url, created_at
- **sessions** — id, user_id, expires_at (o gestione via libreria auth)
- **circles** — id, name, created_by, created_at
- **circle_members** — circle_id, user_id, role (admin|member), joined_at
- **invites** — id, circle_id, code, created_by, expires_at, max_uses, uses
- **media_entities** — id (UUID interno), tmdb_id, imdb_id?, anilist_id?, type (movie), title, year, poster_path, overview, cached_at
- **log_entries** — id, circle_id, user_id, media_entity_id, rating (0.5–5.0 step 0.5), watched_on, platform, created_at
- **log_watched_with** — log_id, member_user_id
- **comments** — id, log_id, user_id, body, is_spoiler, created_at
- **reactions** — id, target_type (log|comment), target_id, user_id, emoji, created_at
- **lists** — id, scope (personal|circle), owner_user_id?, circle_id?, name, is_ranked, created_at
- **list_items** — list_id, media_entity_id, position, added_by, added_at
- **notifications** — id, user_id, type, payload_json, is_read, created_at

Vincoli: rating a step 0.5; `media_entities` upsert per `tmdb_id`; cancellazione log a cascata su comments/reactions/watched_with.

---

## 6. Data flow

1. Utente cerca film → `tmdb.searchMovies` → risultati.
2. Seleziona → `tmdb.getMovie` → upsert in `media_entities` → `media_entity_id`.
3. `diary.createLog(circleId, userId, mediaEntityId, rating, …)`.
4. Commenti/reazioni/"visto con" collegati al log.
5. `feed.getFeed(circleId)` aggrega eventi in timeline.
6. Ogni evento → `notifications.notify` verso membri rilevanti.

---

## 7. Design system (vincolante — spec §3)

- **Base:** off-black caldo `#0F1115` / `#14181C`. Mai `#000000`.
- **Surfaces:** `#1C2228` (s1), `#242C34` (s2) per profondità a livelli.
- **Testo:** primario `#F3F0EB`, secondario `#9CA3AF`.
- **Accento primario:** Mandarin `#FF6B35` — solo CTA/azioni critiche, uno per viewport.
- **Accento secondario:** Forest `#2D6A4F` — stati positivi, rating, appartenenza.
- **Bordi:** sottili, desaturati, niente glow.
- **Layout:** poster-driven, grid 2:3. Poster = contenuto principale.
- **Typography:** editoriale, con carattere. Vietato Inter di default.
- **Contrasto:** WCAG AA minimo.
- **Zero AI slop:** no gradient arancione sfondo, no pure black + neon, no overuse glass/glow, no card identiche senza gerarchia.
- **Design Plan** obbligatorio prima di generare ogni schermata (verifica palette, contrasto, gerarchia, mood).

---

## 8. Testing

- **Unit:** mapping `tmdb`→`media_entities`; generazione/validazione codici invito; aggregazione feed; validazione rating step 0.5.
- **Integration:** flusso auth; crea Cerchia → invita → join → log film → commenta → reazione → feed mostra evento → notifica generata.
- **Seed:** realistici, con film veri TMDB, una Cerchia demo con 3–4 membri e log d'esempio.

---

## 9. Prerequisiti utente (bloccanti)

1. **TMDB API key** (gratuita). Attribuzione obbligatoria in UI.
2. **Account Cloudflare** per D1 + Pages.
3. **Google OAuth** client ID + secret (consent screen).
4. Provider email per magic link (es. Resend) + relativa API key.

---

## 10. Criteri di successo Fase 1

- Un utente può autenticarsi (Google o email).
- Può creare una Cerchia e invitare altri via link/codice.
- Più membri possono loggare film veri con rating, commenti (spoiler toggle), reazioni, "visto con".
- Liste personali e di gruppo funzionanti.
- Feed di Cerchia mostra l'attività in tempo quasi reale (refresh, non websocket).
- Notifiche in-app sugli eventi chiave.
- UI conforme al design system Midnight Screening Room, zero AI slop.
- Deploy funzionante su Cloudflare Pages.

---

## 11. Rischi e note

- **TMDB non commerciale:** rispettare licenza; attribuzione visibile.
- **Next.js su Cloudflare:** usare `@cloudflare/next-on-pages`; attenzione a runtime edge vs node (alcune librerie auth richiedono adattatori edge-compatibili).
- **Auth edge-compatibile:** scegliere libreria che gira su Workers (es. Auth.js con adattatore D1/edge, oppure Lucia). Da decidere in fase di piano.
- **media_entities canonica:** progettata ora per accogliere AniList/IMDb in Fase 3 senza migrazione distruttiva.
