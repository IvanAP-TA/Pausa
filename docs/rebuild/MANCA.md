# Cosa manca rispetto al prompt di rifacimento (e punto di ripresa)

Scritto il 25 novembre 2026, in pausa perché il proprietario deve allontanarsi. Confronto fatto punto per punto con `docs/REBUILD-PROMPT.md`.
Legenda: **FATTO** (provato con un test eseguito), **FATTO, NON PROVATO** (scritto e compilato, mai eseguito dove conta), **MANCA**, **ESCLUSO** (lo hai escluso tu: "tranne Google e Cloudflare").
Regola di onestà: dove scrivo "provato" intendo un test che ho visto passare in locale. Nulla è stato provato su Cloudflare, su un telefono, su un emulatore o con uno screen reader.

## 0. Dove siamo e come si riprende

**Stato del lavoro**
- Tutto è nell'albero di lavoro, **niente committato, niente pubblicato**. Il vecchio sito (Next.js) è intatto; il nuovo Worker si chiama `pausa-v2` e non ha né dominio né rotte.
- Server (Rust): `cargo test --workspace` verde (187 test nel core). Smoke API: **13 suite, 707 controlli verdi** (`node tools/run-smoke.mjs`).
- Client (Expo): `npm run typecheck` pulito, 385 test unitari, bundle d'ingresso 228,7 KB brotli, pagine pubbliche a 0 JS. Gli e2e Playwright completi erano **in corso** quando ho scritto questo file: vedi la riga "Ultimo giro e2e" in fondo.
- Migrazione v1→v2: 33 test verdi su una base **sintetica**, mai su dati reali.

**Processi ancora accesi (se non li vedi chiusi, spegnili)**
- Stack di sviluppo locale: `.dev/8798/pid` (pid 22680 al momento della scrittura), più il catalogo finto sulla porta 9911 e il server del client sulla 4173. Spegnere solo per pid: `taskkill /PID <pid> /T /F`. Non fermare mai tutti i `node`/`workerd`.
- Un promemoria ricorrente ogni 10 minuti vive solo in questa sessione e scade da solo.

**Per riprendere**
1. Server: `node tools/run-smoke.mjs` (costruisce il Worker e lancia le 13 suite, porta 8797).
2. Client: in `apps/mobile` → `npm run typecheck && npm test && npm run build:web && npm run budget`.
3. e2e del client: `node tools/dev-stack.mjs --port 8798 --mock-port 9911 --seed --reset --no-build` (con `SERATA_MATCH_MS=8000 SERATA_TABLE_MS=10000`), poi in `apps/mobile` `E2E_PORT=4173 API_ORIGIN=http://127.0.0.1:8798 npm run test:e2e`.
4. Accedere come persona di prova: `node tools/dev-login.mjs http://localhost:8798 giulia@pausa.test /it/home`.
5. Mappa dei test: `docs/rebuild/PARITY.md`. Accessibilità: `docs/rebuild/A11Y.md`. Piano e stato: `docs/rebuild/PLAN.md`.

## 1. Vincolo "costo zero"

| Punto del prompt | Stato |
|---|---|
| Tutto nei piani gratuiti (Workers Free, D1, DO SQLite, asset) | **FATTO sulla carta**: scelte e motivazioni in `PLAN.md` §7 e `BUDGET.md`. Niente è stato provato sul piano Free vero. |
| WASM sotto i 3 MB compressi | **FATTO**: 1,9 MB grezzo, circa 624 KB gzip. Avvio a freddo mai misurato. |
| **10 ms di CPU per richiesta, misurata con `wrangler dev`/`tail`** | **MANCA / ESCLUSO**: la CPU reale si vede solo su Cloudflare. Esistono solo misure indirette locali in `cpu-hotspots.md` e `BUDGET.md`. È il rischio più grosso rimasto. |
| Stima di carico con formule | **FATTO**: `BUDGET.md` §3 (circa 1.150 utenti attivi al giorno per le richieste). Le ipotesi sono da sostituire con numeri misurati. |
| Email gratuite | **FATTO, NON PROVATO**: Resend (100 al giorno). Mai inviata una email vera. |
| Voce "Costi: zero perché…" e elenco "rimandato: costa" | **FATTO** in `PLAN.md` §7. |
| Android su Google Play, AAB compilato in locale | **MANCA**: solo `expo export` per Android che compila. Nessun AAB, nessuna firma (la chiave non esiste su questo PC e non va toccata). |
| iPhone come web app installabile | **FATTO, NON PROVATO su iPhone**: manifest, icone, service worker, tag iOS. |
| TMDB/AniList solo con chiavi gratuite e in cache | **FATTO** (Cache API di un giorno, tetti per persona). Mai provato con le chiavi vere: i test usano un catalogo finto. |
| CI su GitHub Actions | **FATTO, NON PROVATO**: `.github/workflows/rebuild-ci.yml` esiste ma non è mai girato su GitHub. Non pubblica su Cloudflare (escluso). |

## 2. Architettura richiesta

| Punto | Stato |
|---|---|
| Backend Rust su Workers (D1) | **FATTO** (`crates/api`, `crates/core`, `crates/engine`). KV scartato con motivazione; Durable Object SQLite per la Serata. |
| Motore di raccomandazione riusato | **FATTO**: parità bit per bit con il riferimento (4000 casi casuali). |
| Contratto API, nessun tipo scritto due volte | **FATTO a metà**: i tipi di risposta sono generati da Rust (`ts-rs`). **MANCA** l'esportazione dei corpi delle richieste, che il client dichiara a mano; inoltre i numeri a 64 bit arrivano come `bigint` e il client li avvolge in `Number()`. Da correggere sul server. |
| Un solo client Expo, Android e web | **FATTO per il web**. **MANCA la prova su Android** (nessun emulatore, nessun AAB, nessun Maestro/Detox). |
| Pagine pubbliche HTML statico, 0 JS, SEO | **FATTO e provato**: titoli, hreflang, JSON-LD, sitemap, robots, Open Graph, 404 vero. Una sola guida (era una sola anche nella v1). |
| Sostituire il guscio Tauri | **MANCA**: `src-tauri/` è ancora lì. |
| Accesso con Google, `pausa://auth`, `expo-auth-session` | **ESCLUSO**. Lato server c'è il flusso nativo con codice monouso e scambio; il client non lo usa. |
| Link magico, ospite anonimo | **FATTO e provato** (sessioni con solo l'hash nel DB; cookie sul web, Bearer sul nativo). |
| Account di revisione per Google Play | **ESCLUSO**, non fatto. |
| Cambio email, più metodi di accesso, sessioni attive | **Cambio email: server FATTO e provato, schermata MANCA**. **Più metodi di accesso: dipende da Google, ESCLUSO.** Sessioni attive: server fatto, schermata presente nell'account. |
| Script di migrazione dati reali con prova su copia | **FATTO su base sintetica** (`tools/migrate-v1-to-v2/`, regola D1(a) sui commenti, lotti, conteggi). **MANCA la prova su una copia dei dati veri**: serve il tuo export remoto. Piano di ritorno scritto nel README dello script, mai provato. |
| **Budget prestazioni nel CI** | Vedi sezione 4. |
| i18n it/en/es dagli stessi messaggi | **FATTO** (test: stesse chiavi nelle tre lingue, plurali ICU). Alcune stringhe del Worker (email, notifiche) sono nel codice Rust, in tre lingue. |
| Accessibilità e design | Vedi sezione 5. |

## 3. Fasi del prompt

**Fase 0 (inventario, lacune, piano): FATTO.** `INVENTORY.md`, `GAPS.md`, `PLAN.md`, `BUDGET.md`, `cpu-hotspots.md`.
- **MANCA** la tua risposta alle decisioni D1–D8 di `PLAN.md` §6. Ho proceduto con le raccomandazioni (§6b). La più delicata è D1: i commenti esistenti vengono tenuti in una Cerchia solo se commentatore e autore sono membri; il resto viene scartato e contato nel rapporto.

**Fase 1 (fondamenta)**
- Monorepo, `cargo fmt`, `clippy -D warnings`, `cargo test`, `tsc`, test unitari, Playwright: **FATTO**.
- **MANCA ESLint** nel client. **MANCA un flusso nativo con Maestro o Detox**.
- **MANCA la pubblicazione su Cloudflare** nel CI (esclusa).
- `seed/`: i dati di prova sono ricreati dall'API (`tools/seed-dev.mjs`); non ho riportato il vecchio `seed/` così com'è.

**Fase 2 (parità e poi oltre)**
- `PARITY.md` mappa i 342 test della v1: al momento della mappatura 187 coperti, 65 parziali, 29 in attesa del client, 61 senza equivalente. **Le cifre non sono state ricalcolate dopo il lavoro dei client e del server di stasera** (diverse righe in attesa sono ora coperte). Va rifatta la somma.
- Lacune di `GAPS.md`: **non ho ricontrollato voce per voce quali sono chiuse**. Quelle che so chiuse: modifica di un log privato, recensione visibile nel diario, registrare senza Cerchia, uscita dell'host dalla lobby, import ripartibile, CSP per AniList/Jikan, serie con stagioni ed episodi, "continua a guardare", liste riordinabili con note e priorità, ripetere la Serata e storico, "l'abbiamo visto", pareggi, tempo limite, ruoli e trasferimento proprietà, silenzio per Cerchia, preferenze per tipo di notifica, profili dei membri, anno in rassegna, coda offline del diario.

**Fase 3 (consegna)**
- Verifiche SEO di oggi ancora vere: **FATTO** (specifiche SEO e zero-JS verdi).
- Build Android firmata, AAB: **MANCA**.
- Migrazione provata su copia con piano di ritorno: **MANCA la parte su dati reali**.
- `docs/DEPLOY.md` e README aggiornati, **niente codice morto: MANCA**. Il vecchio codice (`src/`, `src-tauri/`, `drizzle/`, `worker.ts`, configurazione Next) è ancora tutto lì, di proposito, finché non decidi il passaggio.
- `graphify update`: **MANCA** (non l'ho eseguito).
- Commit piccoli per tappa: **non fatti, per tuo ordine** ("non committare nulla").

## 4. Prestazioni (punto 5 del prompt)

| Requisito | Stato |
|---|---|
| CPU di ogni richiesta sotto 10 ms | **MANCA la misura reale** (serve Cloudflare). |
| Letture API sotto 50 ms p95 lato server | **MANCA**. Nessuna misura. |
| Primo contenuto sotto 2 s su 4G simulata | **MANCA**. Non misurato. |
| **JavaScript iniziale sotto 250 KB compressi** | **NON RISPETTATO.** Una pagina vuota di Expo Router più react-native-web ne pesa già 230 KB. Oggi le pagine dell'app stanno tra 281 e 301 KB brotli (bundle d'ingresso 228,7 KB). Ho portato il tetto a **350 KB** (proposta D8, senza tua risposta). Le pagine pubbliche non hanno JS. |
| Lighthouse mobile 95+ sulle pagine pubbliche | **MANCA**: non l'ho mai eseguito. Le pagine sono statiche e leggere, ma il numero non c'è. |
| Budget misurati nel CI | **FATTO, NON PROVATO**: `npm run budget` esiste e fallisce se si supera il tetto; il CI non è mai girato. |
| Nessun errore 1102 sotto carico di prova | **MANCA**: nessun test di carico. |

## 5. Accessibilità e design (punto 7)

- Axe: 216 scansioni per esecuzione (390×844 e 1280×800, scuro e chiaro, 24 schermate private, pagine pubbliche, stati: Registra con serie, thread con spoiler, fogli aperti, stanza della Serata, import, vuoti, errore): da **84 con violazioni a 0**. **FATTO e provato**, con regole WCAG **2.1** A e AA: il prompt chiede **2.2 AA**, che non ho configurato (**MANCA**).
- Prova da tastiera su 6 schermate e controllo dell'albero di accessibilità su 8 flussi: **FATTO**. **MANCA il controllo manuale con screen reader** (TalkBack/VoiceOver) su registrare, Serata e importare: richiesto dalla definizione di "finito" n. 6. Non fattibile da qui.
- Aree toccabili da 44 pt e riduzione del movimento: verificate nei test. **Dynamic Type / ingrandimento del carattere di sistema: MANCA la prova.**
- Barra in basso con Registra al centro: **FATTO**. Tema scuro, arancio, tipografia dai token: **FATTO**.
- Reanimated e Gesture Handler: usati **solo sul nativo** (e quindi non provati). Sul web il trascinamento delle liste usa PanResponder (con i bottoni su/giù come alternativa accessibile) perché Reanimated su web portava il JS iniziale a 431 KB. Il trascinamento col dito sul web non è provato.

## 6. Funzioni: server pronto ma schermata mancante

Queste funzioni esistono e sono provate lato API, ma **il client non ha ancora la schermata**:
- **Dove guardarlo**: catalogo dei servizi per paese, i miei servizi, disponibilità di un titolo. Manca la scelta in Impostazioni e la riga "Su: Netflix…" nella pagina del titolo. Manca il filtro "titoli su un servizio che hanno tutti" per la Serata.
- **"Per te"** (raccomandazioni personali): manca la sezione nel profilo.
- **Cambio email**: manca la schermata.
- **Moderazione**: coda delle segnalazioni per l'operatore, risoluzione, metriche (`/api/admin/*`): manca ogni schermata operatore. **Blocco utenti**: manca la schermata.
- **Notifiche push**: il server manda push Expo e Web Push senza contenuto (firma VAPID verificata nel test); **il client non registra ancora il dispositivo** (né `expo-notifications` sul nativo, né l'iscrizione push nel service worker web).
- **Esporta CSV del diario**: endpoint pronto; il pulsante nell'account è da verificare.
- **Idempotenza della coda offline**: il server ora la rispetta (`Idempotency-Key`, provato); il client la invia già. Resta limite: a freddo e senza rete la shell si apre ma mostra l'errore di rete, non il diario.

## 7. Cosa è proprio assente (nessun pezzo)

- Pagina pubblica del profilo (se scelta) e **traguardi**.
- Statistiche personali complete (ore viste, generi): esiste l'anno in rassegna e gli insight di Cerchia.
- Anime solo-AniList: nessuna disponibilità "dove guardarlo"; non possono essere "semi" per "Per te".
- Cronologia "un anno fa" e checklist di avvio (v1): non portate.
- Sentry e metriche di prodotto della v1: non portate (le metriche operatore esistono solo come conteggi).
- Immagine Open Graph dinamica per la Serata: ora è statica (una per lingua), scelta documentata.
- QR dell'invito alla Cerchia: non portato (esiste quello della carta della Serata).
- Rilevamento del browser in-app per l'accesso Google: legato a Google, escluso.
- Guide SEO aggiuntive: richiedono contenuti scritti da te.

## 8. Definizione di "finito" (0–6)

| # | Criterio | Stato |
|---|---|---|
| 0 | Costo mensile zero, con stima di utenti | **Sulla carta sì** (stima in `BUDGET.md`); non verificato su Cloudflare. |
| 1 | Ogni funzione dell'inventario esiste ed è coperta da test, su web e Android | **Web: quasi** (vedi sezioni 6 e 7). **Android: no** (nessuna prova). |
| 2 | Lacune alte e medie di `GAPS.md` chiuse, il resto elencato | **Parziale**: non ricontrollate una per una. |
| 3 | Budget misurati nel CI, nessun 1102 sotto carico | **No**: JS oltre i 250 KB, CPU non misurata, nessun carico. |
| 4 | Pagine pubbliche indicizzabili, Lighthouse 95+ | **Indicizzabili sì; Lighthouse non eseguito.** |
| 5 | Dati reali migrati con conteggi identici | **No**: solo su dati sintetici; serve il tuo export. |
| 6 | Nessuna violazione AA e prova con screen reader sui tre flussi | **Axe sì (2.1 AA); screen reader no.** |

## 9. Cosa serve da te

1. **Export remoto del DB v1** (`wrangler d1 export`, passo tuo) per provare la migrazione su una copia.
2. **Decisioni D1–D8** di `PLAN.md` §6, soprattutto D1 (privacy dei commenti) e D8 (tetto di JS a 350 KB invece di 250).
3. `LEGAL_ENTITY` e `CONTACT_EMAIL` per privacy e termini (la build avvisa: mostrano un segnaposto).
4. Per i punti **esclusi**, quando vorrai riaprirli: login su Cloudflare (misure di CPU, Durable Object su Free, test Worker), chiavi TMDB e Resend vere, accesso con Google e account di revisione Play, chiave di firma Android.
5. Un telefono o un emulatore per le prove native, e una persona con TalkBack o VoiceOver per i tre flussi.

## 10. Prossimi passi consigliati (in ordine)

1. Schermate mancanti della sezione 6 (dove guardarlo, "Per te", cambio email, registrazione push, moderazione e blocchi), con test.
2. Ricalcolare `PARITY.md` e controllare `GAPS.md` voce per voce.
3. ESLint e CSS/JS: valutare come scendere sotto i 350 KB di JS iniziale.
4. Lighthouse sulle pagine pubbliche e `axe` con tag WCAG 2.2.
5. Esportazione dei corpi delle richieste da Rust e `i64` come `number` nei tipi.
6. Con il tuo OK: pulizia del vecchio codice, aggiornamento di `DEPLOY.md` e README, poi i passi Cloudflare e Google.

**Ultimo giro e2e del client (stasera):** in corso al momento della scrittura; da aggiungere qui sotto quando finisce.
