# Fasi

Roadmap del prompt (§5), tutte realizzate in codice.

## Fase 1 — Foundation + Cerchie + Diario ✅

Il nucleo social privato.

- **Auth**: Google OAuth + magic-link email + login demo (mock). Sessioni custom su D1.
- **Cerchie**: creazione, inviti via codice/link, ruoli admin/member.
- **Diario film**: log con rating a mezze stelle, commenti con controllo spoiler, reazioni rapide, tag "visto con", data/piattaforma.
- **Liste**: personali e di gruppo.
- **Feed**: timeline attività della Cerchia.
- **Notifiche** in-app (nuovo log, commento, reazione).
- **Design system** Midnight Screening Room.

File: `modules/{auth,circles,diary,lists,feed,notifications,tmdb}`, `app/circles/*`, `app/api/auth/*`.
Spec: `superpowers/specs/2026-11-15-pausa-fase1-design.md` · Piano: `superpowers/plans/2026-11-15-pausa-fase1.md`.

## Fase 2 — Motore di Decisione + Now Watching ✅

La feature killer: decidere cosa guardare senza litigare.

- **Serata** in due modalità:
  - **Bracket** = torneo a eliminazione 1 contro 1 (`modules/serata/bracket.ts`, pura+testata).
  - **Tavolo** = voto a punti (dot) + 1 veto d'emergenza (`modules/serata/tavolo.ts`, pura+testata).
- **Guest-first**: si entra con solo un nome, senza account (partecipante tracciato via cookie `pid_<serataId>`).
- **Realtime**: mockato con polling (`ui/components/LivePoll.tsx` → `router.refresh()` ogni 2,5s). Nel reale userebbe WebSocket/Durable Objects.
- **Card 9:16** condivisibile del risultato (`ui/components/ResultCard.tsx`).
- **Now Watching** ("sto guardando…") per Cerchia (`modules/now-watching`).
- **Log diretto** dei titoli dal diario alla Serata (la rosa pesca dai film loggati).

File: `modules/{serata,now-watching}`, `app/circles/[id]/serata/new`, `app/serata/[id]`.

## Fase 3 — Media unificato + Intelligenza ✅

- **Media unificato**: film + **serie TV** + **anime** (`media_entities.type`, catalogo mock esteso, ricerca multi-tipo `searchMedia`).
- **Import** storico da Letterboxd / AniList — dataset campione mock (`importAction`).
- **Raccomandazioni** di gruppo + **confronto gusti** (`modules/recs`: `tasteSimilarity`, `recommend`, `aggregate` — pure+testate). Il prompt chiedeva un servizio Rust: qui è TypeScript con la stessa logica.
- **Year in Review**: statistiche aggregate della Cerchia.
- **Filtri streaming in comune**: mock (sezione dimostrativa).
- **PWA**: manifest + service worker + icona (installabile) — `app/manifest.ts`, `public/sw.js`, `public/icon.svg`, `ui/components/SWRegister.tsx`.

File: `modules/recs`, `app/circles/[id]/insights`, `modules/tmdb/mock.ts`.

## Non realizzato (per scelta)

- Backend **reale** (serve credenziali): vedi [MOCK.md](MOCK.md).
- Servizio raccomandazioni in **Rust** separato: sostituito da modulo TS.
- Realtime con **WebSocket/Durable Objects**: sostituito da polling.
