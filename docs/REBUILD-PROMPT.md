# Prompt: rifare Pausa in Rust + React Native (+ React Native Web)

Da incollare in una sessione nuova di Claude Code, aperta nella cartella del repository (`C:\Users\triof\Desktop\Progetti\Pausa`), con un modello capace (Fable o Opus).

---

## Ruolo e obiettivo

Sei l'ingegnere capo di **Pausa** (pausa.gnagno.org). Devi consegnare la **forma finale** del prodotto: non una migrazione a parità di funzioni, ma l'app completa che Pausa dovrebbe essere. Il codice esistente (Next.js 16 su Cloudflare Workers con OpenNext, D1, Better Auth) è la **specifica vivente** del comportamento e il materiale da cui partire. Non è l'architettura da conservare.

**Perché si rifà:** Next.js su Workers è pesante. Il rendering lato server supera il limite di CPU del Worker (errore Cloudflare 1102) e abbiamo dovuto prerenderizzare le pagine pubbliche per sopravvivere. Il bundle è grande e i tempi di avvio a freddo si sentono. Il nuovo sistema deve essere veloce per costruzione, non per rimedi.

## Vincolo assoluto: costo zero

Il proprietario **non vuole spendere un euro**. Tutto deve stare nei piani gratuiti, e il prompt vale più di ogni altra preferenza tecnica:
- **Cloudflare piano Free**: Workers (100.000 richieste al giorno, **10 ms di CPU per richiesta**, WASM compresso sotto i 3 MB), D1 e KV nei limiti gratuiti, Pages o asset statici (gratuiti, senza limite di banda), Durable Objects solo con archiviazione SQLite (disponibili nel piano Free). **Vietato** proporre Workers Paid, domini nuovi, database a pagamento, servizi di email o push a pagamento. Per le email usa un servizio con piano gratuito sufficiente (verifica i limiti reali) o riduci l'uso delle email.
- **Il Rust è qui un vantaggio concreto**: con 10 ms di CPU il codice deve fare pochissimo lavoro per richiesta. Progetta per questo: niente rendering lato server di interfacce, risposte JSON piccole, cache aggressiva (Cache API, KV, intestazioni HTTP), query D1 poche e indicizzate, lavoro pesante fatto una volta e salvato. Misura la CPU reale di ogni rotta con `wrangler dev` e `wrangler tail` e scrivi i numeri in `docs/rebuild/BUDGET.md`. Se una funzione non sta nei 10 ms, ridisegnala, non cercare un piano a pagamento.
- **Stima di carico**: calcola quante richieste al giorno genera un utente attivo e quanti utenti reggono i 100.000 al giorno e i limiti di D1 (letture e scritture al giorno). Scrivilo con le formule, così il proprietario sa quando il gratuito finisce.
- **Piattaforme**: Android si pubblica su Google Play (la quota di iscrizione è già stata pagata) e l'AAB si compila in locale. **iOS non si pubblica**: l'account Apple Developer costa 99 dollari l'anno. Su iPhone l'app si usa come **web app installabile** (PWA da Safari), quindi il web deve essere ottimo su telefono. Non costruire pipeline iOS a pagamento (niente Mac in cloud, niente Apple Developer). Il codice Expo resta compatibile con iOS per il futuro, ma non si consegna.
- **API esterne** (TMDB, AniList): solo con le chiavi gratuite già in uso, rispettando i loro limiti; metti in cache le risposte (KV o D1) per non sprecarli.
- **Strumenti**: CI su GitHub Actions nei minuti gratuiti (repository pubblico o limiti del piano Free: controlla); niente servizi di monitoraggio, test su dispositivi o analytics a pagamento.
- Ogni scelta con un possibile costo nascosto va scritta in `docs/rebuild/PLAN.md` nella voce "Costi: zero perché…". Se una funzione richiederebbe di pagare, **non farla** e mettila nell'elenco "rimandato: costa" con la cifra.

## Che cos'è Pausa

Diario privato di film, serie e anime per gruppi di amici ("**Cerchie**"), più la **Serata**: un voto di gruppo per decidere cosa guardare stasera. Lingue: italiano (prima), inglese, spagnolo. Si usa soprattutto da telefono.

## Architettura richiesta

1. **Backend in Rust**, sul runtime Cloudflare: `workers-rs` (WASM) con **D1** per i dati. Valuta e decidi con numeri (dimensione del WASM sotto i 3 MB compressi, tempo di avvio a freddo, CPU per richiesta sotto 10 ms) se servono anche **KV** (cache, rate limit) o **Durable Objects** con SQLite (la sala della Serata in tempo reale). Documenta la scelta. Se il WASM non sta nei limiti gratuiti, riduci le dipendenze (niente crate pesanti, `opt-level = "z"`, `wasm-opt`).
   - Esiste già un **motore di raccomandazione in Rust** nella cartella `engine/`. Riusalo e integralo nel backend invece di riscriverlo.
   - API con contratto esplicito (OpenAPI o tipi condivisi generati dal Rust verso TypeScript, per esempio `ts-rs` o `specta`). Nessun tipo scritto a mano due volte.
2. **Un solo client in React Native con Expo (Expo Router)**: **Android e web** da un'unica base di codice (il web tramite **React Native Web**, installabile come PWA su iPhone).
   - **Le pagine pubbliche devono restare HTML statico indicizzabile** (landing, guide, privacy, termini, sitemap, robots, pagine di invito). Usa il rendering statico di Expo Router (`output: "static"`) e servi tutto da Cloudflare Pages o dagli asset dei Workers. Una SPA vuota farebbe perdere il lavoro SEO già fatto (vedi `docs/DEPLOY.md` e la sezione "Public pages are static" del README): titoli, descrizioni, hreflang it/en/es, JSON-LD, sitemap, Open Graph.
   - Le app native sostituiscono il guscio Tauri/Android attuale (`src-tauri/`). Accesso con Google, link profondi `pausa://auth` e ritorno dal browser di sistema devono funzionare in modo nativo (`expo-auth-session`, `expo-linking`).
3. **Autenticazione** con le stesse capacità di oggi: link magico via email, Google, ospite anonimo (per la Serata), account di revisione per Google Play. Scegli una libreria Rust o un'implementazione propria e motiva la scelta; sessioni con cookie sul web e token sicuri sul nativo.
4. **Dati e migrazione.** Schema in `src/db/schema.ts` e migrazioni in `drizzle/`. Il nuovo schema può migliorare, ma deve esistere uno **script di migrazione dei dati reali** da D1 attuale a quello nuovo, con prova su una copia, conteggi prima e dopo e nessuna perdita di visioni, voti, commenti, liste, appartenenze alle Cerchie.
5. **Prestazioni come requisito, non come speranza.** Budget da rispettare e misurare nel CI:
   - **CPU di ogni richiesta sotto 10 ms** (limite del piano Free) e risposta API di lettura sotto 50 ms lato server (p95);
   - primo contenuto sul telefono sotto 2 s su rete 4G simulata;
   - JavaScript iniziale del web sotto 250 KB compressi (spezzetta per rotta);
   - Lighthouse mobile 95+ su Performance, Accessibilità, SEO, Best Practices per le pagine pubbliche.
6. **Internazionalizzazione** it/en/es con gli stessi messaggi di `messages/*.json` come punto di partenza (stesso tono). Nessun testo scritto nel codice.
7. **Accessibilità e design.** Stessa identità visiva di oggi (vedi `DESIGN.md`, `design/`, `src/app/tokens.css`, `src/app/base.css`): tema scuro, arancio, tipografia, la barra in basso su telefono con **Registra al centro**. Almeno WCAG 2.2 AA, aree toccabili da 44 pt, supporto a Dynamic Type e a ridurre il movimento, gesti e animazioni fluidi (usa Reanimated e Gesture Handler).

## Fase 0 · Inventario (prima di scrivere codice)

1. Leggi `graphify-out/` (il grafo del codice) per orientarti, poi `AGENTS.md`, `README.md`, `DESIGN.md`, `docs/`, `src/app/`, `src/lib/core/`, `src/lib/*-actions.ts`, `engine/`, `e2e/`, `seed/`.
2. Produci `docs/rebuild/INVENTORY.md`: per ogni schermata e ogni azione dell'app attuale, che cosa fa, chi la può usare, quali dati tocca, quali limiti di frequenza ha. Include almeno:
   - **Cerchie**: creare, invitare con codice o link, unirsi, uscire, eliminare, impostazioni, ruoli, "rimuovi tutti i miei film dal gruppo" con parola di conferma `PAUSA`;
   - **Diario**: registrare una visione (film, serie, anime) con ricerca TMDB/AniList, voto a mezze stelle, due righe di recensione, data, rivisione, visibilità (solo io / Cerchie), modifica, eliminazione, commenti, segnalazioni;
   - **Serata**: sala con codice, ospite senza account (nome e immagine), scelta dei titoli dalle liste, voto con crediti, risultato, immagine d'invito;
   - **Classifica** della Cerchia con filtri; **Liste** personali e di gruppo, watchlist, eliminazione;
   - **Profilo**: avatar tra quelli predefiniti, nome utente, biografia, generi e film preferiti, watchlist, raccomandazioni "per te";
   - **Raccomandazioni di gruppo** (motore Rust);
   - **Importazione** da Letterboxd, IMDb, Trakt, Cinemaniac (`.bak`), AniList, MyAnimeList, con gestione delle importazioni passate (rimuovi dalla Cerchia, elimina);
   - **Notifiche** (la campanella), **account** (esporta i dati, elimina l'account), **metriche operatore** (`/admin/metrics`);
   - pagine pubbliche e guide, immagini Open Graph, PWA e installazione.
3. **Cerca le lacune.** Il proprietario è convinto che molte sezioni manchino di funzioni di base. Non fidarti dell'elenco sotto: ricavalo dal codice, dalle schermate e dai test. Per ogni sezione scrivi in `docs/rebuild/GAPS.md` che cosa manca rispetto a ciò che un utente si aspetta da un prodotto del genere, con priorità (blocca l'uso / fastidioso / rifinitura). Ipotesi da verificare, non verità:
   - **Ricerca e filtri** nel diario, nelle liste e nella classifica (per persona, genere, anno, piattaforma, voto, serie contro film);
   - **Serie**: tracciare stagioni ed episodi, "continua a guardare", prossimo episodio; oggi una serie è una sola visione;
   - **Dove guardarlo** (disponibilità per piattaforme e paese, tramite TMDB watch providers);
   - **Liste**: riordinare, condividere, collaborare, duplicare, copertine, note per titolo; watchlist con priorità;
   - **Cerchie**: ruoli e permessi, trasferire la proprietà, espellere o silenziare, regole di visibilità, attività recente, menzioni e reazioni, risposte ai commenti, "chi ha visto questo";
   - **Serata**: ripetere una serata, storico delle serate, pareggi, tempo limite, notifica all'apertura, collegarla al diario ("l'abbiamo visto");
   - **Notifiche**: push native, email di riepilogo, preferenze per tipo, silenzio per Cerchia;
   - **Profilo**: pagina pubblica (se scelta), statistiche (ore viste, generi, anno in rassegna), traguardi, profili degli altri membri;
   - **Account**: cambio email, collegare più metodi di accesso, sessioni attive, esportazione in formati standard (CSV per Letterboxd);
   - **Offline e velocità percepita**: cache locale, aggiornamenti ottimistici, coda di scritture senza rete;
   - **Moderazione**: coda delle segnalazioni per l'operatore, blocco utenti, limiti di frequenza visibili;
   - **Stati vuoti, errori e caricamenti** curati in ogni schermata; tastiera e screen reader ovunque.
4. Presenta il piano in `docs/rebuild/PLAN.md` con tappe, rischi, costi (zero) e come misuri il successo. **Fermati e chiedi conferma** solo se una scelta rischia la privacy dei dati o se un requisito non sta nel piano gratuito. Per il resto decidi tu e annota perché.

## Fase 1 · Fondamenta

Monorepo ordinato (per esempio `apps/mobile` per Expo, `crates/api` per il Rust, `crates/engine` per il motore, `packages/` per tipi e messaggi condivisi). Strumenti di verifica: `cargo fmt`, `clippy` senza avvisi, `cargo test`, `tsc`, ESLint, test unitari, test end-to-end del web con Playwright e almeno un flusso nativo con Maestro o Detox. CI su GitHub Actions che esegue tutto e pubblica su Cloudflare. Dati di prova (`seed/`) riportati nel nuovo sistema.

## Fase 2 · Parità e poi oltre

Porta ogni funzione dell'inventario, **con i test**: i 58 test end-to-end e i ~294 unitari di oggi descrivono il comportamento atteso, riscrivili sul nuovo sistema invece di buttarli. Poi chiudi le lacune di `GAPS.md` in ordine di priorità: prima quelle che bloccano l'uso. Ogni funzione nuova ha stati vuoti, errori, accessibilità e traduzioni in tre lingue al momento della consegna, non "dopo".

## Fase 3 · Consegna

- Pagine pubbliche statiche con tutte le verifiche SEO di oggi ancora vere (confronta prima e dopo);
- build Android firmata (AAB per il test chiuso di Google Play) e web app installabile per iPhone; la chiave di firma è fuori dal repository (`C:\Users\triof\.pausa-signing`), **non toccarla e non stamparne mai le password**;
- migrazione dei dati reali provata su copia, con piano di ritorno;
- `docs/DEPLOY.md` aggiornato, README aggiornato, nessun file di vecchio codice morto.

## Regole di lavoro

- **Prima il grafo, poi i file.** Interroga `graphify-out/` prima di rileggere il codice; aggiornalo con `graphify update` a ogni tappa.
- **Non perdere dati degli utenti**, non fare `push --force`, non toccare i segreti. Non eseguire in produzione migrazioni o deploy senza conferma esplicita del proprietario; lavora su ambiente locale e di anteprima.
- Commit piccoli e leggibili, uno per tappa verificata. Se un test fallisce, dillo con l'output, non nasconderlo.
- Le librerie vanno controllate sulla versione reale installata (le API cambiano: leggi la documentazione allegata ai pacchetti prima di scrivere codice, non andare a memoria).
- Verifica in un browser vero e, per il nativo, su emulatore, con screenshot: non dire "funziona" senza averlo visto.
- Scrivi in italiano nei messaggi per il proprietario e nell'interfaccia; il codice e i commenti in inglese come ora.
- A ogni tappa riassumi in cinque righe: che cosa è fatto, che cosa è provato, che cosa resta, che cosa serve da me.

## Definizione di "finito"

0. **Costo mensile: zero.** Tutto sta nei piani gratuiti, con la stima di quanti utenti reggono.
1. Ogni funzione dell'inventario esiste ed è coperta da test, su web (anche installato su iPhone) e Android.
2. Ogni lacuna di priorità alta e media di `GAPS.md` è chiusa; le rifiniture rimaste sono elencate con motivo.
3. I budget di prestazioni sono rispettati e misurati nel CI; nessun errore 1102 o simili sotto carico di prova.
4. Pagine pubbliche indicizzabili, con punteggio Lighthouse mobile 95+.
5. Dati reali migrati con conteggi identici prima e dopo.
6. Accessibilità: nessuna violazione AA nei test automatici e controllo manuale con screen reader sui tre flussi principali (registrare, Serata, importare).
