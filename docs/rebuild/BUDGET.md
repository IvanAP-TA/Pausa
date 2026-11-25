# BUDGET — limiti gratuiti, stima di carico, misure

Stato: **stime a tavolino + zero misure**. Le misure reali si scrivono qui durante la tappa T0 (spike) e poi a ogni tappa. Una cella "—" significa "non ancora misurato", non "ok".

## 1. Limiti Cloudflare Free (verificati il 2026-11-25 sulla documentazione ufficiale)

| Risorsa | Limite Free | Fonte |
|---|---|---|
| Richieste Worker | 100.000/giorno (azzeramento 00:00 UTC) | workers/platform/limits |
| CPU per richiesta | 10 ms (anche per ogni cron). Sforare di continuo → errore 1102 | idem |
| Sub-richieste per invocazione | 50 (fetch esterni, query D1 contano) | idem |
| Dimensione Worker | 64 MiB non compressi (il tetto 3 MB compresso non c'è più dal 2026-09-04) | changelog 2026-09-04 |
| Avvio (scope globale) | 1 s | limits |
| Cron trigger | 5 per account | limits |
| Asset statici | richieste gratuite e senza limite; 20.000 file/versione, 25 MiB/file. Le rotte in `run_worker_first` invocano il Worker e danno 429 a quota finita | static-assets/billing-and-limitations |
| D1 | 5 M righe lette/giorno, 100.000 righe scritte/giorno, 5 GB totali, 500 MB per database, 50 query per invocazione (un `batch()` conta 1), 100 parametri, 100 KB per istruzione. Ogni indice = 1 riga scritta in più per scrittura | d1/platform/limits |
| KV | 100.000 letture/giorno, **1.000 scritture/giorno**, 1 GB | kv/platform/limits |
| Durable Objects | solo SQLite; 100.000 richieste/giorno, 13.000 GB-s/giorno, 5 M righe lette e 100.000 scritte/giorno; messaggi WebSocket in ingresso fatturati 20:1; oggetti in ibernazione non pagano durata | durable-objects/platform/pricing |
| Email da Worker (Cloudflare) | solo a indirizzi verificati nell'account → **inutilizzabile per i link magici** | email-service/platform/pricing |
| Resend | 3.000/mese e **100/giorno**, dominio verificato | resend.com/pricing |

Non confermato su Free (da provare in T0): ibernazione WebSocket dei Durable Object, binding di rate limit, comportamento delle navigazioni verso percorsi senza file con `not_found_handling = "single-page-application"` (invocano il Worker o no?).

## 2. Budget di CPU per richiesta (obiettivo: < 10 ms, meglio < 5 ms p95)

Regole di progetto:
1. Una richiesta = al massimo **1 `batch()` D1** di lettura (sessione + dati insieme) e, se scrive, 1 `batch()` di scrittura.
2. Niente rendering di interfacce, immagini o PDF nel Worker. JSON piccolo, paginato (≤ 20 elementi).
3. Hash della sessione = SHA-256 (WebCrypto, nativo). Niente argon2/bcrypt. Niente verifica RSA/JWT: l'ID token di Google arriva direttamente dall'endpoint token di Google su TLS e non si ri-verifica.
4. JSON in Rust con `serde_json` su strutture piccole; niente `regex`, niente `chrono`, niente crate pesanti (`time` o aritmetica a mano).
5. Cache API (per data center) per risposte pubbliche e dati TMDB; D1 per cache persistente (`media_detail`, disponibilità).
6. Scritture rare: `last_seen` della sessione al massimo 1 volta al giorno; contatori di rate limit solo su azioni sensibili (accesso, creazione, import).

Tabella da riempire con `wrangler dev` + `wrangler tail` (campo `cpuTime`) e, dopo T0, con Worker di anteprima:

| Rotta | Query D1 | Righe lette (stima) | CPU p50 | CPU p95 | Stato |
|---|---|---|---|---|---|
| `GET /api/me` (sessione + profilo) | 1 batch | ~5 | — | — | — |
| `GET /api/circles/:id/feed` | 1 batch | ~60 | — | — | — |
| `POST /api/circles/:id/logs` | 2 batch | ~15 + scritture fan-out | — | — | — |
| `GET /api/circles/:id/ranking` | 1 batch | righe di `rating_current` della Cerchia | — | — | — |
| `GET /api/circles/:id/recommendations` (motore Rust) | 1 batch | tutte le valutazioni della Cerchia | — | — | — |
| `POST /api/import/chunk` (20 titoli) | ≤ 3 batch | ~100 | — | — | — |
| `POST /api/auth/magic-link` | 1 + 1 fetch Resend | ~3 | — | — | — |
| WebSocket Serata (messaggio) | scrittura SQLite DO | — | — | — | — |
| `GET /api/health` (base di riferimento: Worker vuoto) | 0 | 0 | — | — | — |

Costo del motore Rust: il vecchio `engine.wasm` pesa 155.775 byte; **nessun tempo era mai stato registrato** (il bench gira solo con `BENCH=1`). Da misurare con dati di seed grandi (`scripts/gen-load-seed.cjs`) per Cerchie da 8, 30 e 100 persone. Se non sta nei 10 ms: calcolo spezzato per persona + cache del risultato per `(circle, versione dati)` nella Cache API.

Punti caldi del vecchio sistema da non riprodurre (dettagli in `cpu-hotspots.md`):
- Card/invito/anno/OG/icone con Satori + resvg e 4–6 scaricamenti di font Google a richiesta, senza cache e senza limiti.
- Poll della Serata ogni 1,5 s per partecipante, 4–6 query quando cambia qualcosa.
- Un chunk di import da 20 titoli = 18 query + 20–40 chiamate TMDB (a ridosso delle 50 sub-richieste).
- Ogni visita anonima alla landing chiama il Worker due volte (`get-session`, `config`).

## 3. Stima di carico: quanti utenti reggono i limiti

Ipotesi di partenza (da sostituire con numeri misurati dall'app in T9): un **utente attivo al giorno** (DAU) apre l'app 2 volte, fa ~25 richieste API per apertura (sessione, feed, 2–3 schede, immagini fuori conto perché sono statiche o TMDB), scrive ~3 volte.

Formule:

- Richieste API per DAU al giorno: `R = aperture × richieste_per_apertura + scritture_extra = 2 × 25 + 10 = 60`.
- Richieste di Serata: una Serata di 10 persone = 10 upgrade WebSocket + ~150 messaggi → 10 richieste Worker + 150/20 = 8 richieste DO equivalenti: trascurabile.
- Margine di sicurezza: usare al massimo il 70 % del tetto, cioè 70.000 richieste/giorno (picchi, cron, bot, crawler).
- **DAU massimi per richieste** `= 70.000 / R = 70.000 / 60 ≈ 1.150`.
- Letture D1 per DAU `= R × righe_medie_per_richiesta = 60 × 50 = 3.000` → **DAU massimi** `= (5.000.000 × 0,7) / 3.000 ≈ 1.160`. Con query non indicizzate o classifiche non materializzate questo numero crolla: per questo `rating_current` e indici sono requisiti.
- Scritture D1 per DAU: una visione in una Cerchia da `N` membri scrive `1 (log) + 3 (indici) + (N − 1) × 2 (notifica + indice) + 1 (rating_current) + 2 (indici)`. Con `N = 8`: `1 + 3 + 14 + 1 + 2 = 21` righe. Aggiungendo ~5 altre scritture da ~4 righe: `21 + 20 ≈ 41` righe/DAU. **DAU massimi** `= (100.000 × 0,7) / 41 ≈ 1.700`. Per Cerchie da 30 persone la visione costa ~70 righe e il tetto scende a ~900: **tetto alla dimensione della Cerchia (proposta: 30 membri)** e notifiche in-app aggregate invece di una riga per persona.
- Email: link magici ≤ 100/giorno (Resend). Se ogni nuovo accesso da dispositivo nuovo richiede un link, il tetto è ~100 accessi nuovi/giorno; la sessione lunga (90 giorni) lo rende un limite pratico solo alla crescita, non all'uso quotidiano. Il riepilogo email usa solo la quota avanzata (riservati 60/100 all'accesso).

**Collo di bottiglia atteso: richieste Worker (≈ 1.150 DAU), poi D1 (≈ 1.160 letture, ≈ 1.700 scritture).** Oltre ~1.000 utenti attivi al giorno il gratuito finisce: costa $5/mese (Workers Paid) → voce "rimandato: costa" in `PLAN.md`.

## 4. Budget del client e del web (verificati in CI da T1)

| Metrica | Soglia | Misura | Stato |
|---|---|---|---|
| JS iniziale web (compresso) | < 250 KB | — | — |
| Primo contenuto su 4G simulato (Moto G Power, 1,6 Mbps/150 ms) | < 2 s | — | — |
| Lighthouse mobile pagine pubbliche (Perf, A11y, SEO, Best Practices) | ≥ 95 | — | — |
| p95 server API di lettura | < 50 ms | — | — |
| CPU per richiesta | < 10 ms | — | — |
| Errori 1102 sotto carico di prova | 0 | — | — |

## 5. Misure T0 (2026-11-25, locale)

Ambiente: `wrangler dev --local` (workerd 4.158) su questo PC, Windows 11, 15 GB RAM. Il tempo è **da muro** misurato dal client su localhost (include HTTP): è una stima per eccesso della CPU, **non** il `cpuTime` di Cloudflare. Il costo per chiamata si ottiene da `(tempo con 21 ripetizioni − tempo con 1) / 20`, per togliere avvio e rete. Codice dello spike in scratchpad (`spike-api/`), non nel repository. Dati sintetici **densi** (ogni persona vota il 60 % dei titoli): scenario peggiore, una Cerchia vera è più rada.

| Misura | Risultato |
|---|---|
| Worker Rust vuoto + D1 + motore (`worker` 0.9.0, `opt-level="s"`, LTO, `wasm-opt`) | **390.140 byte** WASM, **159.391 byte** gzip |
| Build a freddo (`worker-build --release`, dipendenze incluse) | ~30 s compilazione + ~40 s `wasm-opt` |
| `GET /api/health` (nessuna query) | 6,2 ms totali (quasi tutto HTTP locale) |
| `GET /api/me` (1 `batch()` D1, 2 query) | 6,9 ms totali → D1 locale ≈ 0,7 ms |
| Motore, 8 persone × 300 titoli (1.440 voti, JSON 164 KB) | **1,2 ms** (parsing 0,9 + calcolo 0,2) |
| Motore, 30 persone × 1.000 titoli (18.000 voti, JSON 2 MB) | **19,7 ms** (parsing JSON 11,9 + calcolo 7,8) → **fuori budget** |
| Motore, 100 persone × 2.000 titoli (JSON 13,6 MB) | **535 ms** → inutilizzabile |

Conclusioni:
1. **Il confine JSON costa più del calcolo** (≈ 60 %). Nel Worker Rust il motore deve ricevere strutture lette direttamente dalle righe D1, senza serializzare e rileggere JSON.
2. Anche solo calcolo, 30 persone dense (7,8 ms) lasciano pochissimo margine: servono voti compatti (interi, indici al posto delle stringhe), classifica da `rating_current` e **risultato in cache per versione dei dati**. Tetto alla Cerchia (D4) confermato come necessario.
3. WASM da 159 KB gzip: la dimensione **non** è un problema; il limite vero resta la CPU.
4. Asset statici + `run_worker_first: ["/api/*"]`: le pagine pubbliche e la shell arrivano dagli asset senza invocare il Worker; `/api/*` va al Worker. Con `not_found_handling: "single-page-application"` un percorso **inesistente** (es. `/robots.txt` mancante) risponde **200 con la shell**: soft-404. Da risolvere in T0(e): assicurare che ogni file pubblico esista, `noindex` sulla shell, oppure confinare l'app privata sotto un prefisso. Non confermato in produzione.
5. Non provati qui (richiedono D3): CPU reale su Cloudflare, ibernazione DO, binding di rate limit, conteggio richieste degli asset.

### T1 — motore su input compatto (`crates/engine`, 2026-11-25)

Stesso calcolo, ma persone e titoli sono indici `u32`, voti ordinati per titolo con merge-join, bitset per "visto" e "sta guardando", nessun JSON. **Risultato bit-identico** al riferimento a stringhe (`reference.rs`) su 4.000 Cerchie casuali (punteggi, ordine, `unseen_by`, `loved_by`, coppie).

| Cerchia sintetica densa | Spike (WASM, con JSON) | `crates/engine` (nativo, release) |
|---|---|---|
| 8 persone × 300 titoli (1.483 voti) | 1,16 ms | **0,09 ms** |
| 30 persone × 1.000 titoli (18.123 voti) | 19,69 ms | **2,83 ms** |
| 100 persone × 2.000 titoli (120.166 voti) | 535 ms | **46,9 ms** |

I due ambienti non sono confrontabili 1:1: lo spike è WASM su workerd, la colonna nuova è nativa (il WASM costa tipicamente 1,5–2×). Da rimisurare in WASM su workerd e su Cloudflare (D3). Lettura prudente: 30 persone dense sono ~3–6 ms, dentro i 10 ms; 100 persone restano fuori budget → il **tetto di 30 membri (D4)** resta necessario. Bench: `cargo test -p pausa-engine --release -- --ignored --nocapture bench`.

Altre misure T1: WASM di `crates/api` (router + D1 + engine + core) **283.177 byte**; schema v2 = 36 tabelle, 27 indici espliciti, tutte le letture calde (sessione, diario, feed di Cerchia, thread, classifica, notifiche) usano indici (`tools/check-schema.mjs`).

### T2a — accesso e Cerchie (`crates/api`, 2026-11-25)

Tempi da muro del Worker in `wrangler dev --local` (workerd + D1 locale), letti dal log durante `tools/api-smoke.mjs`: **non** sono CPU Cloudflare, ma danno l'ordine di grandezza (dentro ci sono query D1 reali, SHA-256, serializzazione).

| Rotta | Query D1 | n | p50 | p95 |
|---|---|---|---|---|
| `GET /api/me` (sessione + utente + Cerchie con non lette) | 3 (sessione, Cerchie, utente) | 21 | 4 ms | 6 ms |
| `POST /api/auth/magic-link` (2 contatori + 1 insert) | 3 | 51 | 12 ms | 21 ms |
| `GET /api/auth/magic-link/verify` (consuma il link, upsert utente, sessione) | 2 | 18 | 12 ms | 33 ms |
| `POST /api/auth/guest` | 2 | 3 | 9 ms | 12 ms |
| `POST /api/circles` (Cerchia + owner + invito in un batch) | 3 (1 contatore, 1 sessione, 1 batch) | 12 | 11 ms | 14 ms |
| `POST /api/circles/join` | 5 (contatore, sessione, lettura invito, batch scrittura) | 21 | 10 ms | 23 ms |

Note:
- `GET /api/me` oggi usa 3 query separate: da riportare a **un solo `batch()`** (regola 1 del §2) prima di T9; resta ben sotto i 10 ms locali.
- Il contatore di frequenza è **una sola istruzione atomica** (`INSERT … ON CONFLICT DO UPDATE … RETURNING`): 1 riga scritta per controllo. Una richiesta di accesso scrive 1 (token) + 2 (contatori) righe; la sessione scrive 1 riga al giorno al massimo.
- WASM dell'API ora **651 KB raw / 232 KB gzip** (era 283 KB senza auth): `sha2`, `serde_json`, `url`, formattazione. Lontano dal limite (64 MiB) e dall'avvio (1 s), da tenere d'occhio.
- `tools/api-smoke.mjs`: **51 controlli** sul comportamento (link monouso, solo l'hash del token nel database, cookie HttpOnly/SameSite, protezione contro redirect aperti, un solo owner, inviti scaduti/revocati/esauriti, Cerchia da 30 piena, ospite, logout, account disattivato, limiti 3/email e 5/IP con `Retry-After`). Passano tutti contro D1 locale.

### T2b — gestione Cerchie, account, handshake nativo, cron (2026-11-25)

`tools/api-smoke.mjs` ora ha **178 controlli, tutti passati** contro `wrangler dev --local --test-scheduled` (D1 locale). Tempi da muro locali (workerd + D1 locale, **non** CPU Cloudflare), p50 / p95 in ms, sulle rotte nuove:

| Rotta | p50 | p95 |
|---|---|---|
| `GET /api/circles/:id` (Cerchia + persone + inviti, 1 batch) | 4 | 6 |
| `POST /api/circles/:id/invites` | 10 | 12 |
| `PATCH /api/circles/:id` | 8 | 10 |
| `PUT …/members/:u/role` | 5 | 11 |
| `DELETE …/members/:u` | 4 | 11 |
| `POST …/transfer`, `POST …/leave` | 7, 10 | 11, 10 |
| `DELETE /api/circles/:id` | 9 | 13 |
| `GET /api/account/export` (7 query in 1 batch) | 2 | 4 |
| `DELETE /api/account` (con eredità delle Cerchie, 1 batch atomico) | 6 | 13 |
| `POST /api/auth/native/exchange` | 9 | 12 |

Note: l'esportazione e la cancellazione sono misurate con dati minimi; con un diario da migliaia di visioni l'esportazione leggerà tante righe in un colpo (limite D1: 5 M righe lette/giorno) → da paginare o spezzare prima del lancio (voce in `GAPS.md` "esportazione standard", T9). WASM dell'API: **784 KB raw / 267 KB gzip** (era 651/232): ruoli, account, pagina nativa, cron.

Cosa prova la suite (oltre a quanto già elencato per T2a): matrice dei permessi (membro/admin/owner/estraneo → 403 o 404), un solo owner dopo trasferimento, eliminazione con nome digitato, `circle_join` a chi non ha silenziato, rientro dopo rimozione, ereditarietà alla persona giusta (admin più anziano prima del membro più anziano), `created_by` azzerato senza violare le chiavi esterne, handshake nativo (pagina, codice monouso, token Bearer, scadenza), cron (sessioni e token scaduti, contatori vecchi, ospiti > 30 giorni).

### T3 — diario, titoli, commenti, segnalazioni, serie (2026-11-25)

`node tools/run-smoke.mjs` (build + D1 pulito + catalogo finto + `wrangler dev`) esegue **300 controlli, tutti passati**: 178 di accesso/Cerchie/account + 122 di diario. Tempi da muro locali (workerd + D1 locale, **non** CPU Cloudflare), p50 / p95 ms:

| Rotta | p50 | p95 | Note |
|---|---|---|---|
| `GET /api/circles/:id/feed` (20 righe, filtri) | 5 | 6 | una query su `log_share` (indice per Cerchia) + join; nessuna scansione dei log dei membri |
| `GET /api/circles/:id/logs/:logId` (visione + thread + "visto con") | 5 | 6 | 1 batch |
| `GET /api/me/diary` | 4 | 5 | keyset su (data, creazione, id) |
| `POST /api/logs` | 11 | 32 | 1 contatore + sessione + (membership) + risoluzione titolo + letture + 1 batch di scritture; il p95 è la prima creazione di un titolo dal catalogo |
| `PUT /api/logs/:id`, `…/shares` | 11, 5 | 11, 14 | ricalcolo di `rating_current` incluso (2 statement) |
| `POST …/comments`, `…/reactions` | 10, 7 | 14, 8 | notifiche con un solo `INSERT … SELECT` |
| `GET /api/media/search` | 23 | 47 | include 2 chiamate al catalogo finto; con cache: 0 chiamate (provato) |
| `GET /api/media/:id` | 7 | 26 | il p95 è il primo accesso in una nuova lingua (1 chiamata al catalogo, poi salvata) |
| `POST /api/reports`, `…/withdraw` | 9, 8 | 12, 13 | |

Cosa si è deciso e perché (impatto sul budget D1):
- **Visibilità esplicita (`log_share`), niente "visibile in tutte le mie Cerchie"**. Con il modello v1 una pagina di feed doveva leggere tutti i log di tutti i membri (30 membri × 1.000 log = 30.000 righe a pagina; × pagine × utenti = fuori da 5 M righe/giorno). Ora una pagina legge ~20 righe indicizzate. È anche più privato (niente storico non richiesto in una Cerchia nuova) e riduce "togli i miei film" a un solo `DELETE`.
- **`rating_current` per Cerchia**: la classifica e le raccomandazioni di una Cerchia leggono solo voti di visioni condivise lì. Costo: 2 statement dopo ogni scrittura che può cambiarlo.
- **Ricerca locale a prefisso su indice** (`media_title_search_idx`), non `LIKE '%q%'`: il vecchio sistema leggeva l'intero catalogo a ogni battuta. Sottostringa e fuzzy sono compito di TMDB.
- **Una ricerca non scrive più nulla**; il titolo nasce quando lo si sceglie (v1: fino a 18 righe per ricerca, scelte o no). Dettagli (sinossi, generi, cast, stagioni, durata) arrivano nella stessa chiamata TMDB e restano in D1.
- **Cache API** per TMDB (1 giorno) e AniList (1 ora); solo le chiamate di rete contano nel limite 300/ora (cache hit gratis).
- **Testo spoiler non inviato** al client finché non lo si chiede (`reveal=1`): v1 lo mandava e lo sfocava in CSS.

WASM dell'API: **1,10 MB raw / 368 KB gzip** (era 784/267). Cresce con le funzionalità; il limite è 64 MiB, l'avvio deve restare sotto 1 s (da misurare su Cloudflare).

### T5 — Serata con Durable Object (2026-11-25)

Architettura: una stanza = un Durable Object (`SerataRoom`, SQLite, chiave = codice). Tutte le regole stanno in `pausa_core::serata::Room` (pura: tempo e casualità iniettati, **26 test** sulle regole, 36 con i tipi); il DO persiste, imposta l'allarme, spinge a ogni persona **la propria vista** sul WebSocket e scrive la stanza finita su D1 una volta sola. Il Worker autentica e inoltra con `x-user-id`; la stanza non è raggiungibile da fuori. `tools/api-smoke-serata.mjs`: **81 controlli, tutti passati** su `wrangler dev --local` (workerd locale).

Cosa cambia rispetto alla v1 e perché (dal lavoro sulle lacune):
- **Timer lato server** (allarme del DO): un turno chiude alla scadenza anche se nessuno ha la pagina aperta. Provato: tavolo senza voti e turno con un voto su due si chiudono da soli. v1: restava in votazione per sempre.
- **Costo**: niente polling ogni 1,5 s per persona (4–6 query D1 a ogni cambio). Ora 0 query D1 durante la partita; D1 si tocca alla creazione (1 batch) e alla fine (1 batch). Le richieste al DO sono: 1 per azione + 1 upgrade WebSocket per persona.
- **Ingresso solo in lobby** (v1: chiunque col codice entrava a votazione in corso e alzava il quorum); chi è già dentro può rientrare. Tetto 30 persone.
- **"Esci"**: chi esce non blocca il turno; l'host che esce passa la stanza alla persona più anziana; stanza vuota → `expired`. Lobby non avviata → scade dopo `SERATA_LOBBY_TTL_MS` (default 2 h).
- **Un voto dopo la scadenza non conta** (v1 lo scriveva e lo contava).
- **Pareggio registrato** (`drew`) e mostrato nel risultato (v1: sorteggio invisibile).
- **Storico** (`GET /api/circles/:id/serate`, 20 per volta, non mostra stanze scadute), **ripeti** (stessi titoli e modalità, `repeated_from`), **"l'abbiamo visto"** (`watched_log_id` collega la Serata a una mia voce di diario per il titolo vincitore).
- **Card**: l'API dà i dati (`GET /api/serate/:code/result`, pubblico, con limite per IP, mai chi ha votato cosa); l'immagine la disegna il client (niente Satori/resvg nel Worker, 4–6 fetch di font a richiesta in meno).

Misure: WASM dell'API **1,79 MB raw / 586 KB gzip** (era 1,10 MB / 368 KB: il Durable Object e la macchina a stati). Limite Cloudflare 64 MiB; l'avvio (1 s) va ancora misurato online.

**Non verificato e da dichiarare**: l'**ibernazione dei WebSocket e l'allarme su piano Free** non sono provati (workerd locale non è Cloudflare). Se l'ibernazione non fosse disponibile su Free, il client ha comunque `GET /api/serate/:code` (stato per persona): basta un polling lento (3–5 s) come ripiego; i turni si chiudono comunque dall'allarme. Da provare con il Worker di prova (D3).

### T0(e) — Expo SDK 58 (expo 58.0.26, expo-router 58.0.32, react-native-web 0.21.4), export statico

| Misura | Risultato |
|---|---|
| JS di una pagina **vuota** (router + RNW + react-dom, nessun codice nostro) | 1.107 KB raw → **292 KB gzip / 230 KB brotli** (entry); totale con runtime e chunk comuni **302 KB gzip / 239 KB brotli** |
| Composizione (raw) | expo-router 42 %, react-native-web 27 %, react-dom 19 %, resto 12 % |
| Tree shaking sperimentale (`EXPO_UNSTABLE_TREE_SHAKING`) | −1 %: inutile |
| Rotte asincrone | Sì, un chunk per rotta (300–800 byte): ma il peso sta tutto nell'entry |
| `generateMetadata` nell'export statico | **Funziona** (title, description, robots, canonical, hreflang con `x-default`, Open Graph) **solo senza `app/+html.tsx` personalizzato**: con `+html.tsx` sparivano metadata e tag `<script>` |
| JSON-LD | Non previsto dal tipo `Metadata`. Un `<script type="application/ld+json">` creato con `createElement` dentro la pagina **finisce nell'HTML statico** |
| `<html lang>` | Sempre `en` senza `+html.tsx`: va corretto dallo script di post-export |
| Pagine statiche | 14 rotte incl. `generateStaticParams` per lingua × slug; ciascuna 19 KB di HTML (CSS di RNW incluso) |
| Rotte dinamiche private (`/[locale]/c/[id]`) | Generata una shell `[locale]/c/[id].html` |
| Asset: `not_found_handling: "404-page"` + `run_worker_first: ["/api/*", "/*/c/*"]` | **Provato in locale**: pagine pubbliche dagli asset (200, title giusto), `/it/c/abc/members` servita dal Worker con la shell, **percorsi inesistenti → 404 vero** (risolve il soft-404). Costo: 1 richiesta Worker per apertura diretta di una rotta privata |

Conclusioni:
1. **Il budget "JS iniziale < 250 KB" è già consumato al 96 % (brotli) da una pagina vuota**; aggiungendo Reanimated, Gesture Handler, i18n, query cache e il codice dell'app lo si supera. Non c'è leva fra le opzioni gratuite di Expo (tree shaking inutile). Proposta in `PLAN.md` §6 D8.
2. **Le pagine pubbliche devono andare senza JavaScript**: sono già HTML completo; lo script di post-export toglie `<script defer>` e `<link rel=preload>` dalle pagine che non hanno interazione (landing, guide, privacy, termini, 404) → 0 KB di JS, Lighthouse realistico. L'app privata paga il peso una volta e lo tiene nella cache del service worker.
3. Lo script di post-export deve anche: impostare `<html lang>` per lingua, rinominare `+not-found.html` in `404.html`, generare `sitemap.xml`/`robots.txt`, aggiungere JSON-LD dove serve (o crearlo nei componenti con `createElement`).

### Client: PWA, coda offline, correzioni di accessibilità (2026-11-25, `apps/mobile`, `npm run budget`)

| | prima | dopo | limite |
|---|---|---|---|
| bundle d'ingresso (brotli) | 228,4 KB | 228,3 KB | 350 KB |
| pagina di shell peggiore (`en/import`, brotli) | 296,8 KB | 300,5 KB | 350 KB |
| `it/home` (brotli) | 276,8 KB | 280,5 KB | 350 KB |
| tutto il JS, 43 file (brotli / raw) | 515,8 KB / 2408,6 KB | 519,4 KB / 2422,0 KB | |
| pagine pubbliche con JS | 0 | 0 | 0 |

Costi nuovi, non gratis: il service worker precache tutto il JS della build (71 file, circa 520 KB brotli / 630 KB gzip + font + icone) alla **prima visita della shell privata** (registrato solo da lì, in background dopo il primo render); `dist/sw.js` pesa poche KB. L'aumento del JS viene dalla coda del diario, il banner di aggiornamento e la registrazione del worker, più i `listitem` di `Row`. Le pagine pubbliche non scaricano né registrano nulla.
