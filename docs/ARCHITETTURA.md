# Architettura di Pausa

Una pagina per chi riceve il progetto. Per mettere online: `docs/DEPLOY.md`.

## In breve

Pausa è un'app **Next.js 16** (App Router, React 19, TypeScript, Tailwind v4) che gira come **Cloudflare Worker** tramite **OpenNext**. Dati su **Cloudflare D1** (SQLite) con **Drizzle**. Accesso con **Better Auth** (link via email, Google facoltativo, ospiti anonimi per le Serate). Testi in italiano, inglese e spagnolo con **next-intl**. Il motore delle raccomandazioni è in **Rust**, compilato in WebAssembly e caricato dallo stesso Worker.

```
Browser ──► Worker (worker.ts)
              ├─ OpenNext → Next.js (pagine, azioni, API)
              │     ├─ D1  (database)
              │     ├─ TMDB / AniList (titoli, locandine, dove si guarda)
              │     └─ engine.wasm (raccomandazioni)
              └─ pianificazione (pulizie periodiche)
```

## Cartelle

| Percorso | Cosa contiene |
|---|---|
| `src/app/[locale]/…` | Pagine. `c/[circleId]/…` è tutto ciò che sta dentro una Cerchia (privato). `s/[code]` la Serata. `guide/`, `privacy`, `terms`: pubbliche. |
| `src/app/api/…` | Auth (`auth`), stato della Serata (`serata`), immagini condivisibili (card, invito, anno), export dati, controllo del motore (`health/engine`), login rapido solo in sviluppo (`dev/login`). |
| `src/lib/core/` | **La logica di dominio, pura e testata.** Ogni modulo prende il database come parametro, quindi gira identico in produzione (D1) e nei test (SQLite vero in WebAssembly con le migrazioni vere). |
| `src/lib/*.ts` | Colla: azioni server (`actions.ts`, `manage-actions.ts`…), TMDB, push, sessione. |
| `src/lib/engine/` | Caricatore del motore Rust e `engine.wasm` (committato). |
| `engine/` | Sorgente Rust del motore (`npm run engine:build` per ricompilare). |
| `src/db/schema.ts`, `drizzle/` | Schema e migrazioni (`npm run db:generate` per crearne una nuova). |
| `messages/{it,en,es}.json` | Tutti i testi. Ogni chiave deve esistere nelle tre lingue. |
| `worker.ts` | Punto d'ingresso del Worker: aggiunge il WebAssembly al Worker generato da OpenNext. |
| `src-tauri/` | Guscio nativo (Tauri v2) che apre il sito. |
| `seed/` | Dati di prova **solo per lo sviluppo**. Mai in produzione. |
| `docs/` | Questa documentazione, la checklist dei test su telefono, i piani. |

## Decisioni da conoscere

1. **Tutto il dominio sta in `src/lib/core`.** Le pagine non fanno calcoli: chiamano questi moduli. Si testano senza avviare nulla (`npm test`).
2. **Limiti di D1.** Al massimo ~100 valori per istruzione e ~50 query per richiesta (piano gratuito). Il codice scrive a blocchi e un test (`import.test.ts`, "D1 limits") lo verifica. Chi aggiunge scritture massicce deve rispettarlo.
3. **Privacy per costruzione.** Un contenuto è visibile solo ai membri delle Cerchie dell'autore. Ogni lettura passa da `getCircleForMember` / `logVisibleTo`; una Cerchia a cui non appartieni risponde 404, non 403. L'unica cosa pensata per uscire è la Card della Serata (non mostra chi ha votato cosa).
4. **Ospiti.** Chi entra in una Serata riceve una sessione anonima (nome e immagine). Se poi crea un account, i suoi dati passano all'account (`onLinkAccount` in `lib/auth.ts`).
5. **Realtime della Serata** a polling (`/api/serata/[code]`, 204 se nulla è cambiato). Semplice e basta per gruppi piccoli; se serve di più si passa a Durable Objects.
6. **Raccomandazioni.** La versione di riferimento è `core/insights.ts` (TypeScript); quella in uso è il motore Rust, che deve dare risultati identici (test di parità su migliaia di casi casuali). Se il WebAssembly non si carica il codice ricade da solo sul TypeScript.
7. **TMDB.** Locandine e dati vengono da TMDB (chiave gratuita = uso non commerciale; attribuzione obbligatoria, già nelle pagine). La disponibilità sui servizi è di JustWatch tramite TMDB, in cache una settimana.
8. **Nessun cookie di tracciamento.** Solo sessione, tema e lingua. Non serve il banner del consenso finché resta così.
9. **Stili.** Colori e caratteri sono token in `src/app/globals.css`; il tema chiaro e scuro sono due set di token. La Card condivisibile ha colori fissi (`card-*`).
10. **Convenzioni.** Italiano nell'interfaccia di default; codice e commenti in inglese; nessuna dipendenza nuova senza motivo.

## Moduli aggiunti per ultimi

- **Impostazioni e notifiche**: `src/lib/core/settings.ts` (silenzio, "sta guardando" per Cerchia e per persona, tipi di notifica), `digest.ts` e `mailer.ts` (riepilogo email), usati da `src/lib/actions.ts` (`filterRecipients`) e dal cron di `worker.ts`. Migrazione 0010.
- **Episodi**: `episodes.ts` (limiti e passaggio di stagione), `progress.ts`, `src/lib/episode-info.ts` (TMDB e AniList, cache nella tabella dei conteggi, migrazione 0011).
- **Fonti esterne**: `src/lib/tmdb.ts`, `src/lib/anilist.ts` (GraphQL pubblico), Jikan per MyAnimeList; importatori in `import-parsers.ts` (Letterboxd, IMDb, Trakt, AniList, MAL).
- **PWA**: `public/sw.js` (solo pagina offline e push), `public/offline.html`, `src/app/apple-splash`, `src/components/register-sw.tsx`.
- **Classifica e liste**: `src/lib/core/ranking.ts` (medie e filtri, pura) e la pagina `/ranking`; importazione di watchlist e liste Letterboxd con `importList` (condivide `resolveMedia` con l'importazione del diario).
- **Velocità**: `getCircleContext` (una sola query per layout e pagine), `readAll` (letture raggruppate in un batch D1), `LOG_QUERIES=1` per misurare. Dettagli nella sezione "Speed" del README.
- **Sicurezza HTTP**: header e CSP statica in `next.config.ts`.

## Come lavorare

```bash
npm install
cp .env.example .env.local        # poi imposta BETTER_AUTH_SECRET
npm run db:migrate:local && npm run db:seed:local
npm run dev                       # http://localhost:3000 (accesso rapido con i 4 utenti di prova)
npm test                          # logica di dominio + motore, su SQLite vero
npm run lint && npx tsc --noEmit
npm run e2e                       # percorsi principali nel browser (Playwright)
```
