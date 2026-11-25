# PLAN — Pausa in Rust + Expo (costo zero)

Bozza di Fase 0, 2026-11-25. Base: `INVENTORY.md` (comportamento attuale), `GAPS.md` (cosa manca), `BUDGET.md` (limiti e stima), ricerca sui limiti gratuiti verificata oggi.

## 0. Cosa è cambiato rispetto alle ipotesi del prompt

| Ipotesi del prompt | Realtà verificata | Effetto |
|---|---|---|
| WASM sotto 3 MB compresso | Tetto rimosso (64 MiB non compressi dal 2026-09-04) | Si può usare un framework leggero; il vincolo vero è **10 ms di CPU** e 1 s di avvio |
| Email di accesso da Cloudflare | Solo a indirizzi verificati su Free | Link magico via **Resend** (già in uso: 100/giorno, 3.000/mese) |
| `eas build --local` per l'AAB | Non funziona su Windows | `expo prebuild` + Gradle con JDK 17 (JBR di Android Studio c'è già) |
| Google sign-in "nativo" | La libreria più nota ha Credential Manager a pagamento | OAuth via browser di sistema + `pausa://auth` (come oggi) oppure `react-native-nitro-google-signin` |
| Sitemap/hreflang/JSON-LD da Expo | **Provato in T0(e)**: `generateMetadata` dà title/description/robots/canonical/hreflang/OG in HTML statico, ma solo **senza `+html.tsx`**; JSON-LD arriva con un `<script>` creato nel componente; **nessun `sitemap.xml`**, `<html lang>` sempre `en` | Script di post-export: `lang`, `404.html`, `sitemap.xml`, `robots.txt`, rimozione dei `<script>` dalle pagine pubbliche |
| JS web < 250 KB | Una pagina Expo vuota = 239 KB brotli (T0(e)) | Pagine pubbliche a 0 KB di JS; budget della shell privata da decidere (D8) |
| Asset: SPA fallback | Dà **200 su percorsi inesistenti** (soft-404) | `404-page` + `run_worker_first` per le rotte private (il Worker serve la shell); provato in locale |
| KV per sessioni/contatori | 1.000 scritture/giorno | Sessioni in D1, rate limit su binding o D1 solo per azioni sensibili |
| Il repository è in `C:\Users\triof\...` | Questo PC: `C:\Users\Giuseppe\Desktop\Personal Project\Pausa`; **`C:\Users\triof\.pausa-signing` non esiste qui** | AAB firmato solo sul PC del proprietario. Qui si produce l'AAB non firmato/debug e si prova su emulatore `Pixel_8a` |

Il vecchio `COSA_MANCA.md` dice che serve il piano Workers a pagamento: il rebuild lo smentisce con numeri (vedi `BUDGET.md` §3) o lo conferma con una cifra, ma non lo propone.

## 1. Architettura

```
Telefono / browser
   │  HTML+JS+immagini statici (gratis, illimitati)         Expo Router, output "static"
   ├────────────────────────────────────────────►  Cloudflare Workers Assets
   │  /api/*  (JSON piccolo, cookie o Bearer)                run_worker_first: ["/api/*"]
   └────────────────────────────────────────────►  Worker Rust (workers-rs)
                                                       ├─ D1  (dati, sessioni)
                                                       ├─ Cache API (risposte pubbliche, TMDB)
                                                       ├─ Durable Object SQLite (sala Serata, WebSocket ibernati)
                                                       ├─ crates/engine (raccomandazioni, linkato come libreria, non come .wasm separato)
                                                       └─ fetch: TMDB, AniList, Resend, Expo push
```

Un solo Worker, un solo deploy, dominio `pausa.gnagno.org` già presente.

**Workspace** (`Cargo` + `npm workspaces`):

| Percorso | Contenuto |
|---|---|
| `apps/mobile` | Expo SDK 58 (React Native 0.88, React 19.3), Expo Router, Reanimated 4, Gesture Handler 3 |
| `crates/api` | Worker: router, handler, auth, D1, DO |
| `crates/core` | Logica pura (visibilità, ranking, serata, limiti, parser di import): compila nativa e a WASM, test con `cargo test` |
| `crates/engine` | Motore di raccomandazione esistente, riusato quasi invariato (`engine/src/lib.rs`: `recommend`, `tastePairs`, formule identiche; si toglie solo l'interfaccia C `alloc/run/dealloc`) |
| `packages/api-types` | `.ts` **generati** da Rust con `ts-rs` (12.0.1) via `cargo test`; nessun tipo scritto due volte |
| `packages/messages` | `it/en/es.json` portati da `messages/` (932 chiavi, 36 namespace, tono invariato) |
| `migrations/` | SQL D1 v2 (squash dello schema + miglioramenti) |
| `tools/migrate-v1-to-v2` | Script di migrazione dati con conteggi e prova su copia |

Scelte da decidere con numeri in T0 (non per gusto):

1. **Router**: `worker::Router` puro contro `axum` (feature `http`). Si sceglie in base a CPU e dimensione del WASM di un endpoint reale. Default: `worker::Router`, niente macro.
2. **Contratto API**: `ts-rs` + client `fetch` tipizzato scritto a mano (sottile). OpenAPI/`utoipa` scartato: peso e CPU per un progetto con un solo client. Costi: zero.
3. **Tempo reale della Serata**: Durable Object con SQLite e WebSocket ibernati. **Se l'ibernazione non regge su Free** → ripiego: long-poll con versione in memoria del DO. Il polling D1 ogni 1,5 s del vecchio sistema non passa i budget.
4. **Rendering di immagini condivisibili**: non nel Worker. Card di Serata, "anno in rassegna" e invito si **disegnano sul client** (`react-native-view-shot` su nativo, canvas su web) e si condividono come file. Le anteprime dei link (`og:image`) per inviti e guide sono **statiche**, una per lingua, generate in build. Cambia: l'anteprima di un invito non mostra più nome e locandina della Serata. Costi: zero.

## 2. Schema v2 (miglioramenti che chiudono lacune strutturali)

Base: lo schema attuale (33 tabelle in `src/db/schema.ts`), non riscritto per capriccio. Cambia solo ciò che `GAPS.md` mostra rotto:

- **Ruoli**: `circle_member.role ∈ owner | admin | member`. Il creatore diventa `owner`; solo l'owner promuove admin, trasferisce la proprietà, elimina la Cerchia. Mai una Cerchia senza owner: alla cancellazione di un account la proprietà passa all'admin più anziano, poi al membro più anziano.
- **Commenti/reazioni/"visto con" legati alla Cerchia**: `comment.circle_id`, `reaction.circle_id`. Oggi un log `scope=circles` mostra lo stesso filo in tutte le Cerchie dell'autore (fuga di nomi e commenti tra gruppi senza membri in comune). **Richiede una decisione tua prima della migrazione** (§6, D1).
- **Voti per titolo, non per episodio**: `rating_current(user_id, media_id, rating, rated_at)` aggiornata alla scrittura, da log di titolo intero; i voti di episodio/stagione restano sul log e non sovrascrivono. Classifica, affinità, raccomandazioni e scheda titolo leggono la stessa fonte. È anche ciò che rende la classifica leggibile in poche centinaia di righe invece di tutte le visioni (budget D1).
- **Serie**: `watch_progress(user_id, media_id, season, episode, updated_at)` più elenco episodi; "sto guardando" non è più una riga unica per utente (più titoli in corso; "continua a guardare").
- **Log senza Cerchia**: `createLog` non richiede `circleId`. Diario personale con modifica, recensione leggibile e rivisione modificabile.
- **Disponibilità streaming**: tabelle esistenti tenute; mostrata sulla scheda titolo, con **attribuzione JustWatch obbligatoria** (condizione TMDB).
- **Sessioni** (`session`) con token opaco hashato; elenco sessioni attive, revoca.
- **Segnalazioni**: coda con azioni dell'operatore e blocco utenti; `reportAction` risponde l'esito vero.
- **Notifiche**: ogni tipo legato a una Cerchia (le reazioni oggi no: il silenzio non le ferma); lettura per Cerchia; push disiscritta al logout.
- **Serata**: scadenza decisa dal server (alarm del DO), host trasferibile, ingresso chiuso a votazione iniziata salvo invito, "esci", storico, ripeti, collegamento "l'abbiamo visto" → diario.
- **Import**: sessione di import ripresumibile (`import_batch.status`, `cursor`), esito per riga, dedupe stabile anche senza data.

## 3. Autenticazione

Implementazione propria (nessuna libreria Rust matura per questo set di funzioni su WASM; Better Auth è TypeScript):

- **Sessione**: token casuale 256 bit, in D1 solo `SHA-256(token)`. Web: cookie `HttpOnly; Secure; SameSite=Lax`, `Path=/api`. Nativo: `Authorization: Bearer`, token in `expo-secure-store`. Sliding expiry senza scrittura a ogni richiesta (aggiorna `last_seen` al massimo una volta al giorno).
- **Link magico**: token monouso 15 min, `SHA-256` in D1, invio con Resend via `fetch`; limite per email e per IP.
- **Google**: flusso "code" con PKCE; lo scambio avviene nel Worker contro l'endpoint token di Google (TLS diretto, ID token non ri-verificato per ridurre la CPU). Nativo: browser di sistema → `pausa://auth?code=<monouso>` → scambio con token. Account collegati per email verificata (stesso account per Google ed email).
- **Ospite anonimo** per la Serata: sessione `is_anonymous`, pulizia con cron; si fonde nell'account se poi lo crea.
- **Revisione Google Play**: porta di servizio per l'account di revisione come oggi (`/review`), abilitata solo da variabile segreta.
- Nessuna password. Nessun hash lento.

## 4. Client

- Expo Router con `web.output: "static"`. Ogni pagina pubblica (landing, guide × 3 lingue, privacy, termini, inviti `/join/[code]`, 404) è HTML vero in build. Percorsi `/{it,en,es}/…` con `generateStaticParams`.
- L'app privata (`/c/…`, `/me/…`, `/s/…`) è client-side con dati da `/api/*`. Cache locale (React Query + persistenza), aggiornamenti ottimistici, coda di scritture offline.
- **PWA** per iPhone: `manifest.json`, service worker generato da Workbox dopo l'export, splash iOS statici. Web Push solo da app installata (iOS ≥ 16.4).
- **Android**: `expo prebuild` + Gradle `bundleRelease` (JDK 17, SDK 36/37 già installati). Push con **Expo push service** (gratuito, nessuna firma RSA nel Worker; richiede credenziali FCM v1 caricate su Expo).
- **i18n**: `intl-messageformat` precompilato o equivalente piccolo, un file per lingua caricato a richiesta. Le 59 stringhe con plurali ICU (`one`/`other`/`=0`) e 7 con tag devono passare tutte. Se pesa troppo per i 250 KB, si scrive un formattatore minimo.
- **Design**: token da `src/app/tokens.css`/`DESIGN.md` (petrolio + corallo "Pellicola", Sofia Sans Extra Condensed, raggio 0, filetti, tema scuro di default), barra in basso con **Registra al centro**. Il **blocco token di `DESIGN.md` è in ritardo sul codice** (lettore 4): la fonte è `tokens.css`.
- **Accessibilità**: WCAG 2.2 AA, aree da 44 pt, Dynamic Type, `prefers-reduced-motion`, axe in Playwright (44 test oggi) e passaggio a mano con screen reader su registrare / Serata / importare.

## 5. Tappe

Commit piccoli, uno per tappa verificata — **ma vedi D6: non commito senza tuo ok**. Ogni tappa chiude con 5 righe (fatto / provato / resta / serve da te).

| T | Contenuto | Esce con |
|---|---|---|
| **T0 Spike** (1–2 giorni) | In ordine: (a) Worker Rust vuoto + D1 + `/api/health`: dimensione WASM e `cpuTime` di base; (b) assets + `run_worker_first` + comportamento SPA su `/it/c/xyz`; (c) DO SQLite con WebSocket ibernati; (d) binding rate limit; (e) Expo static export: `generateMetadata`, hreflang, JSON-LD, dimensione JS iniziale; (f) `nitro-google-signin` contro OAuth da browser. | Numeri in `BUDGET.md`; decisioni in §1 chiuse; **stop** se qualcosa non sta nei 10 ms |
| **T1 Fondamenta** | Workspace, CI GitHub Actions (Linux), clippy/fmt/`cargo test`, `tsc`, ESLint, Vitest, Playwright, generazione tipi, schema v2 + seed, i18n, tema | CI verde su un endpoint vero e una schermata vera |
| ↳ T1a **fatto (lato Rust)** | Workspace Cargo (`crates/engine`, `crates/core`, `crates/api`), motore compatto con parità bit-per-bit, schema v2 in `migrations/0001_init.sql` validato su SQLite, tipi `ts-rs` → `packages/api-types`, `/api/health` e `/api/health/db` su D1 locale, `.github/workflows/rebuild-ci.yml`, Worker `pausa-v2` senza dominio. fmt + clippy `-D warnings` + 18 test verdi (il workflow non è ancora stato eseguito su GitHub) | — |
| ↳ T1b **fatto** (agente client, 2026-11-25) | pps/mobile: Expo SDK 58, tema (token OKLCH, scuro/chiaro, AA calcolato), i18n con ICU in 3 lingue (932 chiavi intatte), client API tipizzato (cookie su web, Bearer su nativo), pagine pubbliche **a 0 KB di JS** (16 pagine, verificato), landing, guide (indice + 1), privacy/termini con segnaposto per titolare e contatto, 404 in 3 lingue, accesso, Cerchie (membri, ruoli, inviti, impostazioni, trasferimento, uscita, eliminazione), account, /join/{code}, pausa://auth. **Shell a 227,9 KB brotli** (limite D8: 350). Post-export: lang, 404, sitemap, robots, verifiche SEO. 190 test Vitest + 151 Playwright (121 SEO, 20 app, 10 zero-JS), 	sc pulito. Android: Pixel_8a in Expo Go arriva all'accesso. **Non fatto**: axe, screen reader a mano, Lighthouse, iOS, Google, scambio token nativo su build di sviluppo, 7 guide, og:image, manifest/icone, demo Serata, Diario/Registra/Serata (segnaposto) | — |
| **T2 Accesso + Cerchie** | Sessioni, link magico, Google, ospite, inviti, ruoli, impostazioni, eliminazione, account/esporta/elimina | Inventario Parte 1 al 100 % con test |
| ↳ T2a **fatto** | Link magico (Resend, 15 min, monouso), ospite, logout, sessioni con solo l'hash nel DB, `GET /api/me`, creare Cerchia (atomico, owner + primo invito), entrare con codice (stati, tetto 30, limiti). `crates/core`: `auth`, `circles` (ruoli, rimozione, uscita, erede della proprietà), `limits`, 30 test; `tools/api-smoke.mjs`: 51 controlli su D1 locale. **Non provato**: invio vero via Resend (serve la chiave), CI su GitHub | — |
| ↳ T2b **fatto in gran parte** | Handshake nativo (`/api/auth/native/{code,exchange}` + pagina `pausa://auth` in 3 lingue), elenco/creazione/revoca inviti, impostazioni, ruoli (owner/admin/member), rimozione, uscita, trasferimento, eliminazione con nome digitato, notifica `circle_join`, account (esporta, elimina con eredità, sessioni attive e revoca), cron giornaliero. `tools/api-smoke.mjs`: 178 controlli verdi | — |
| ↳ T2c **da fare** | Google (code + PKCE, serve `GOOGLE_CLIENT_ID/SECRET` per provarlo), account di revisione Play, cambio email e collegamento di più metodi, silenzio/"sta guardando" per Cerchia, preferenze di notifica, CSP e header di sicurezza, limite per IP sulla lettura degli inviti | Parte 1 al 100 % |
| ↳ T3 **fatto lato server** | Ricerca (locale a prefisso + TMDB + AniList, cache, nulla salvato), risoluzione del titolo alla scelta, scheda titolo localizzata a richiesta, registrare/modificare/eliminare, date vere (anche future rifiutate), condivisione esplicita per Cerchia, feed con filtri e paginazione senza salti, diario personale, thread per Cerchia (commenti con risposte, reazioni, spoiler non inviati), segnalazioni, "togli i miei film" con `PAUSA`, avanzamento serie ("continua a guardare", +1 episodio, stagione successiva), notifiche `log`/`comment`/`reaction`/`now_watching`. Cambi di modello: **niente `log.scope`** (visibile solo dove condiviso), `rating_current` per Cerchia, voto di episodio che non sovrascrive quello della serie. 122 controlli (300 con T2). **Non fatto**: coda segnalazioni per l'operatore, "dove guardarlo" (T4), push (T7), schermate (client) | — |
| ↳ T4 **fatto lato server** | Profilo (nome, bio, generi, avatar, preferiti), preferenze (lingua, paese, riepilogo email, tipi di notifica), interruttori per Cerchia (silenzio, nascondi "sta guardando"), profilo di un membro (viewing condivisi qui, media, amati, affinità), campanella (per Cerchia, paginata senza salti, non mostra Cerchie lasciate, "segna lette" per Cerchia), liste (watchlist, personali e di gruppo, note, priorità, riordino in una chiamata, duplica, tetto 200), classifica con filtri e pagine da 40, insight (d'accordo, divisi, coppie, anno in rassegna), raccomandazioni di gruppo (motore a input compatto). Dal rapporto client: anteprima invito senza accesso, ospite con token nativo, CORS solo con CORS_ORIGINS, tipi 	s-rs per ogni risposta. **438 controlli end-to-end** (4 suite), 106 test core. **Non fatto**: "dove guardarlo" e "per te" (serve TMDB vero), coda segnalazioni operatore | — |
| **T3 Diario + titoli** (spec originale) | Ricerca TMDB/AniList in cache, registra, modifica (anche privati), commenti, reazioni, spoiler, segnalazioni, scheda titolo, dove guardare | Parte 2 (diario) |
| **T4 Liste, classifica, profilo, raccomandazioni** | Liste (riordino, condivisione, note), classifica con filtri, profilo, statistiche, motore Rust integrato e misurato | Parte 2 (resto) |
| ↳ T5 **fatto lato server** | Stanza come Durable Object (SQLite) con regole in core (26 test), timer lato server, WebSocket con vista per persona, ingresso solo in lobby, esci/passa l'host/scadenza, pareggio registrato, storico, ripeti, "l'abbiamo visto", dati per la card pubblica. 81 controlli end-to-end (519 con le altre suite). **Non provato**: ibernazione WebSocket e allarme su piano Free, schermate della Serata (client), immagine card sul client | — |
| **T5 Serata** | DO + WebSocket, storico, ripeti, timer, risultato, card sul client | Parte 3A |
| ↳ T6 **fatto lato server** | Importazione a pezzi: apertura (destinazione privata o Cerchia), righe validate **una per una** (v1: una riga sbagliata faceva fallire il pezzo), abbinamento per id e poi titolo+anno (±1), arricchimento TMDB/AniList (id TMDB, IMDb, titolo; AniList per id o MAL), titolo minimo dal file se il catalogo non risponde, idempotente, **riprendibile** con cursore e stato (running/done/failed/cancelled), tetto di 12 titoli nuovi per chiamata (limiti Cloudflare: 50 richieste esterne e 50 query D1) con processed per rimandare il resto, liste e watchlist a pezzi, elenco importazioni, "togli dalla Cerchia", elimina (ricalcolo voti). 67 controlli (586 con le altre suite). **Non fatto**: parser dei file sul client (si riusano quelli TypeScript della v1), schermate, euristica "importazioni precedenti" (la migrazione dati creerà i lotti), esportazione CSV | — |
| **T6 Importazione** | Parsing sul client (Letterboxd, IMDb, Trakt, Cinemaniac `.bak`, AniList, MAL), chunk ripresumibili, gestione importazioni, esporta CSV | Parte 3B |
| ↳ Stato 25/11 (lato server) | Moderazione (coda operatore via `OPERATOR_EMAILS`, risoluzione, metriche), blocco utenti, header di sicurezza, push Expo (job a 1 minuto, lingua del dispositivo, dispositivi morti dimenticati), riepilogo email giornaliero (17:00 UTC, tetto 40/giro, **mai provato con Resend**), export CSV, filtro diario per titolo, ricerca senza duplicati, `host_id` nella Serata. **Esecuzione reale (25/11 sera): 12 suite, 693 controlli verdi** (`tools/run-smoke.mjs`, da copia isolata + suite asset dal Worker vero). Aggiunti: Worker che serve il client (asset + shell dei percorsi dinamici, 404 veri), "dove guardarlo" (catalogo per paese, servizi personali, disponibilità settimanale), "Per te", cambio email con conferma sul nuovo indirizzo, Web Push senza contenuto firmato VAPID (firma ES256 verificata nel test). **Non fatto/non verificato**: Web Push con contenuto cifrato e prova contro un vero servizio di push, "Per te" senza riga "su quali servizi", anime solo-AniList senza disponibilità, digest mai provato con Resend, CSP (in carico al client C) | — |
| ↳ Stato 25/11 (client) | Tutte le schermate di diario, feed, thread, Registra, profilo, notifiche, classifica, insight, persone, Serata, liste, import (parser v1 portati) su **web**, 346 test unitari, 227 e2e verdi (2 saltati), `typecheck` pulito, bundle d'ingresso 228,6 KB brotli (limite 350), pagine pubbliche a 0 JS. **Non fatto/non verificato**: Android/iOS su dispositivo (solo tipi + `expo export` Android compilato), axe e screen reader, Dynamic Type, trascinamento touch, guide SEO restanti, service worker, coda offline | — |
| ↳ T11 **script fatto** | `tools/migrate-v1-to-v2/`: regola D1(a), `rating_current` ricostruita, lotti, rapporto di conteggi, 33 test su fixture sintetica. **Non provato su dati veri** (serve l'export remoto del DB v1, passo tuo) | — |
| **T7 Notifiche** | In-app per Cerchia, push Android (Expo) e web (VAPID, firma con WebCrypto), riepilogo email nei limiti Resend, cron | Parte 1 notifiche |
| **T8 Pubblico + PWA** | Landing, guide, privacy/termini con titolare e contatto veri, sitemap, robots, OG statici, service worker, installazione iPhone | Checklist SEO (34 asserzioni, `INVENTORY.md` Parte 4) identica o migliore; Lighthouse ≥ 95 |
| **T9 Lacune** | Tutto ciò che in `GAPS.md` è "fastidioso" e non già chiuso, per priorità | `GAPS.md` aggiornato voce per voce |
| **T10 Android** | AAB debug/non firmato da qui; firmato sul PC del proprietario; test chiuso Play | AAB + schermate da emulatore |
| **T11 Migrazione dati** | `tools/migrate-v1-to-v2`, prova su **copia**, conteggi prima/dopo, piano di ritorno | Rapporto di conteggi |

Test esistenti: i 57 percorsi Playwright (13 percorsi + 44 axe) e ~294 casi unitari sono la specifica; ognuno si riscrive nella tappa della sua area e si spunta in una tabella di parità (`docs/rebuild/PARITY.md`, da creare in T1).

## 6. Decisioni che servono da te

Nulla blocca T0 e T1. Queste servono prima delle tappe indicate.

- **D1 · Privacy dei commenti esistenti (prima di T11, meglio prima di T3).** Oggi un commento su un log `scope=circles` è visibile in **tutte** le Cerchie dell'autore del log. Nel nuovo schema ogni commento appartiene a una Cerchia. Opzioni:
  (a) **intersezione, raccomandata**: il commento compare nella Cerchia C solo se **sia chi ha commentato sia l'autore del log** ne sono membri oggi. Riduce l'esposizione, perde solo commenti tra persone che non condividono più nessuna Cerchia (restano esportabili da chi li ha scritti).
  (b) **duplica** in ogni Cerchia dove il log è oggi visibile: nessun commento sparisce, ma la fuga tra gruppi senza membri in comune diventa permanente.
  (c) **solo la Cerchia di origine**: non determinabile, il log non ricorda dove è stato scritto.
- **D2 · Copia dei dati reali per provare la migrazione (prima di T11).** Serve un `wrangler d1 export` del database vero su questo PC (dati di persone vere: email, visioni, commenti). Dimmi se posso farlo e dove tenerlo; resta fuori dal repository, cancellato a fine prova.
- **D3 · Spike su un Worker di prova nel tuo account Cloudflare (T0 c–d).** Ibernazione dei DO e binding di rate limit su Free si verificano solo online. Un Worker `pausa-spike` su `*.workers.dev`, senza dominio e senza dati, cancellato a fine prova. Serve il tuo ok e `wrangler login` fatto da te (`! npx wrangler login`).
- **D4 · Dimensione massima della Cerchia (proposta 30).** Lo impone il costo di scrittura delle notifiche (`BUDGET.md` §3). Quante Cerchie/membri hai oggi?
- **D5 · AniList.** I termini vietano l'uso in servizi concorrenti di liste/tracker senza autorizzazione e la raccolta massiva; il limite è oggi 30 richieste/minuto (letto da una fonte indiretta, da riconfermare). Pausa lo usa già così. Proposta: restare come ora (solo ricerca e import dal browser dell'utente, risposte in cache) e scrivere ad AniList per un'autorizzazione; piano B = anime via TMDB. Dimmi se vuoi scrivere tu o procedere.
- **D6 · Commit.** La tua regola salvata dice "mai commit/push senza chiedere" e per Pausa avevi detto esplicitamente di non committare. Il prompt chiede un commit per tappa. Lavoro **senza commit** finché non mi dici "committa" per tappa (o "committa sempre per tappa").
- **D8 · Budget di JavaScript del web (da T0(e), misurato).** Una pagina Expo **vuota** pesa già 239 KB brotli / 302 KB gzip (expo-router 42 %, react-native-web 27 %, react-dom 19 %). Il tuo requisito è < 250 KB compressi. Proposta: **0 KB di JS sulle pagine pubbliche** (HTML statico completo, senza script) e **< 350 KB brotli per la shell dell'app privata** (scaricata una volta, poi in cache dal service worker). Alternativa che rispetta i 250 KB ovunque: l'app privata smette di usare Expo Router su web (costo alto, si perde il codice condiviso Android/web). Ti chiedo di scegliere; consiglio la proposta.
- **D7 · Titolare e contatto legali.** `CONTACT_EMAIL` e `LEGAL_ENTITY` esistono solo come variabili del Worker; pagine privacy/termini prerenderizzate rischiano di non mostrarli. Nel nuovo sistema vanno scritti in build: servono nome e contatto da pubblicare.

### 6b. Assunzioni prese con "fai il resto" (2026-11-25), da smentire se sbagliate

L'utente ha chiesto di proseguire senza rispondere a D1–D8. Procedo con le raccomandazioni di questo piano; ciò che richiede il suo accesso resta fermo.

| Decisione | Assunzione | Reversibile? |
|---|---|---|
| D8 budget JS | 0 KB JS sulle pagine pubbliche; shell privata < 350 KB brotli | Sì, prima di T8 |
| D4 tetto Cerchia | 30 membri (già nel codice, `MAX_MEMBERS`) | Sì, una costante |
| D1 commenti esistenti | Opzione (a), intersezione: il commento resta visibile nella Cerchia solo se commentatore **e** autore del log ne sono membri. Applicata solo dallo script di migrazione, mai su dati veri senza D2 | Sì: lo script non è ancora eseguito su nulla di reale |
| D5 AniList | Come oggi (ricerca e import dal browser dell'utente, risposte in cache); nessun contatto con AniList senza l'utente | Sì |
| D6 commit | **Nessun commit** (regola salvata: mai senza chiedere). Tutto resta non tracciato | — |
| D7 titolare legale | Nome e contatto letti da variabili di build (`LEGAL_ENTITY`, `CONTACT_EMAIL`); finché mancano le pagine privacy/termini mostrano un segnaposto visibile e il build avvisa | Sì |
| D2 dati reali | Non toccati. Lo script di migrazione si prova su un database v1 **sintetico** (schema e seed del repo) | — |
| D3 Worker di prova online | Non fatto (richiede `wrangler login` dell'utente). CPU reale e Durable Object con ibernazione restano **non provati** e sono dichiarati tali in ogni rapporto; il Durable Object avrà il ripiego long-poll | — |

## 7. Costi: zero perché…

| Scelta | Zero perché | Se cresce |
|---|---|---|
| Worker + D1 + Assets + DO su Free | Limiti in `BUDGET.md` §1, stima ≈ 1.000 DAU | Workers Paid $5/mese |
| Dominio `pausa.gnagno.org` | Già posseduto | — |
| Resend | 100/giorno, 3.000/mese | Brevo 300/giorno o Mailjet 200/giorno come ripiego gratuito |
| Push Android | Expo push service gratuito, FCM gratuito | — |
| Web Push iPhone (PWA) | Standard, firma VAPID con WebCrypto | — |
| Google OAuth | Gratuito | — |
| Google Play | Quota già pagata; test chiuso con 12 tester × 14 giorni | — |
| CI | GitHub Actions: repo privato = $12/mese di calcolo incluso (~2.000 min Linux); pubblico = illimitato. CI solo su Linux, caches di `cargo` | Rendere il repo pubblico o ridurre i test su CI |
| TMDB | Chiave gratuita (uso non commerciale: ok finché Pausa non incassa) | Licenza commerciale se ci sono ricavi |
| Test nativi | Maestro locale su emulatore, non in CI | — |

**Rimandato: costa**

| Funzione | Cifra |
|---|---|
| Build e distribuzione iOS (App Store) | Apple Developer $99/anno |
| Oltre ~1.000 utenti attivi al giorno | Workers Paid $5/mese |
| Email transazionali oltre 100/giorno | Piano a pagamento del provider |
| Immagine di anteprima dinamica per ogni invito/Serata (richiede rendering lato server) | Workers Paid (CPU 30 s) |
| Monitoraggio errori e analytics a pagamento | — (si usano Cloudflare Web Analytics e `wrangler tail`) |

## 8. Rischi

1. **10 ms di CPU**: ranking e raccomandazioni su Cerchie grandi, fan-out di notifiche, parsing. Mitigazione: `rating_current`, tetto 30 membri, cache per versione, misure in T0/T4.
2. **Durable Object WebSocket su Free non confermato** → ripiego long-poll (§1.3).
3. **Bundle iniziale < 250 KB** con React Native Web + Reanimated + i18n: non è garantito. Mitigazione: rotte asincrone (stabili in SDK 58), pagine pubbliche senza il codice dell'app, Reanimated caricato solo dove serve; se non basta, le pagine pubbliche diventano HTML+CSS senza React.
4. **SEO di Expo static**: hreflang/JSON-LD non documentati → script di post-export, coperto da test.
5. **Privacy**: D1 e D2 sopra. Nessun dato reale esce dal PC o viene toccato in produzione senza tuo ok.
6. **TMDB/AniList**: termini (D5) e limite AniList.
7. **Tempo**: è un rifacimento completo. T2–T9 sono il grosso; T0 decide se il progetto sta nei limiti prima di spenderlo.
8. **Strumenti mancanti su questo PC**: `wasm32-unknown-unknown`, `worker-build`, Maestro, `gh`, `graphify` (il prompt cita `graphify-out/` che non esiste qui: orientamento fatto con letture del codice; si può installare se lo vuoi).

## 9. Come misuro il successo

Definizione di "finito" del prompt (0–6) trasformata in controlli: `BUDGET.md` §4 in CI; `PARITY.md` (ogni test vecchio → test nuovo); checklist SEO di `INVENTORY.md` Parte 4 come test; conteggi di `tools/migrate-v1-to-v2`; axe a zero violazioni AA e passaggio manuale con screen reader.
