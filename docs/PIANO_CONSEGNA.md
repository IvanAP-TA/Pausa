# Piano di consegna

> **Stato: eseguito.** Il codice descritto qui è tutto fatto (Rust/WebAssembly, lancio sicuro, test, documentazione) e anche le funzioni della vecchia lista "Poi". Per ciò che resta davvero vedi `COSA_MANCA.md`; questo file resta come storia delle decisioni.

Obiettivo: finire tutto il codice e consegnare a un'altra persona un repository che lei possa mettere online (database compreso) senza chiedere a noi. Questo piano sostituisce l'ordine di `COSA_MANCA.md`.

**Chi**: *io* = lavoro di codice; *tu* = decisione o accesso tuo; *altra persona* = la persona che metterà online il progetto.

## Fase 0: tre decisioni (servono prima di cominciare)

1. **Rust: dove vive.** Proposta: **un modulo WebAssembly dentro lo stesso Worker** (vedi fase 1). Un servizio Rust separato (Fly.io o simili) richiederebbe un secondo deploy, un secondo segreto e latenza di rete, cioè più lavoro per chi riceve il progetto. Se vuoi comunque il servizio separato, dimmelo ora: cambia fase 1 e fase 3.
2. **Che cosa succede ai due codici**: il codice TypeScript delle raccomandazioni resta come *riferimento nei test* (e come ripiego se il modulo non si carica), oppure viene eliminato? Proposta: resta come riferimento e ripiego.
3. **Licenza e proprietà del repository**: chi è il titolare, quale licenza (o nessuna, "tutti i diritti riservati"). Va scritto in `LICENSE`.

## Fase 1: motore delle raccomandazioni in Rust (*io*)

Come funziona: una libreria Rust (`engine/`) compilata in WebAssembly, caricata dal Worker. Nessun servizio in più.

1. **Crate `engine/`**: solo `serde` e `serde_json`, esportazioni C semplici (`alloc`, `dealloc`, e una funzione per ogni calcolo che prende e restituisce JSON). Niente `wasm-bindgen`, quindi niente strumenti extra per chi compila.
2. **Cosa passa a Rust** (il calcolo che oggi è in `src/lib/core/insights.ts`, `discovery.ts` e `roster.ts`):
   - voti più recenti per titolo, somiglianza di gusto (`tasteSimilarity`) e coppie (`tastePairs`);
   - consigli di gruppo (`recommend`, con i voti "specchiati" per i gusti opposti);
   - consigli individuali (`rankDiscovery`) e composizione della rosa (`buildRoster`).
   Lettura dal database e chiamate a TMDB restano in TypeScript.
3. **Caricamento**: un piccolo `src/lib/engine/` che in Node (sviluppo e test) legge il file `.wasm`, e sul Worker lo importa già compilato (i Worker vietano di compilare WebAssembly a runtime). **Questo è il rischio principale**: lo provo per primo con una build OpenNext vera, prima di scrivere il resto.
4. **Prove di uguaglianza**: i test esistenti (153) devono passare identici con Rust. In più un test con dati casuali confronta, per migliaia di casi, il risultato di Rust con quello del TypeScript di riferimento (stesso ordine, stessi punteggi entro 1e-9).
5. **Build riproducibile**: `npm run engine:build` compila e copia `engine.wasm` in `src/lib/engine/`. **Il file compilato resta nel repository**, così chi mette online il progetto non ha bisogno di Rust. Una verifica automatica (fase 3) controlla che il `.wasm` committato corrisponda ai sorgenti.
6. **Onestà sui numeri**: con i volumi di oggi (qualche Cerchia, poche centinaia di log) il TypeScript risponde in pochi millisecondi: Rust non cambia ciò che vede l'utente. Lo facciamo perché lo vuoi e perché regge meglio quando i dati crescono; misuro prima e dopo e te lo scrivo.

## Fase 2: codice che manca (*io*, in quest'ordine)

Bloccanti per un lancio sicuro:
1. **Google OAuth**: nascondere il pulsante nei browser di WhatsApp e Instagram (Google li blocca) e verificare che Google ed email sulla stessa casella portino allo stesso account.
2. **Pulizia automatica** (lavoro pianificato di Cloudflare): ospiti anonimi vecchi, sessioni e link scaduti, contatori del rate limit.
3. **Limiti anti-spam** sulle azioni (Cerchie, Serate, inviti, commenti, log): oggi coprono solo l'accesso.
4. **Moderazione minima**: segnalare un commento, rimuovere un membro già c'è; aggiungere "segnala" e una vista admin per vedere le segnalazioni.
5. **Eliminare una Cerchia** e **trasferire la proprietà**.
6. **Monitoraggio degli errori**: aggancio opzionale a Sentry (attivo solo se c'è la variabile), così l'altra persona lo accende senza toccare il codice.

Qualità:
7. **Accessibilità con strumenti veri** (axe come dipendenza di sviluppo, nei test).
8. **Test end-to-end** con Playwright sui percorsi principali (accesso rapido di sviluppo, registrare una visione, Serata a due, account e cancellazione).
9. **Integrazione continua** su GitHub: tipi, lint, test della logica, test end-to-end, controllo del `.wasm`.

Funzioni di prodotto (le faccio dopo i bloccanti se c'è tempo; non bloccano la consegna):
10. Pagina offline (PWA), preferenze di notifica, pagina per ogni persona, ricerca nel feed, profilo della Cerchia (descrizione e immagine), diario per episodio.

## Fase 3: pacchetto di consegna (*io*)

L'altra persona deve poter lavorare solo con il repository.
1. **`docs/DEPLOY.md`**: procedura passo per passo, con i comandi esatti, in ordine: account Cloudflare, creazione del database D1 e id da mettere in `wrangler.jsonc`, migrazioni sul database vero (`npm run db:migrate:remote`), dominio, segreti e variabili (tabella: nome, a cosa serve, dove si ottiene, se è segreto, se serve a build o a runtime), primo deploy, controllo che funzioni.
2. **`docs/ARCHITETTURA.md`**: una pagina con la mappa del progetto (cartelle, il ruolo di `src/lib/core`, come girano i test sul database vero, dove sono i limiti di D1), e le "decisioni da conoscere".
3. **Deploy automatico** (`.github/workflows/deploy.yml`): a ogni push su `main` esegue controlli, migrazioni e deploy con wrangler; usa segreti di GitHub che inserisce l'altra persona. Facoltativo da attivare.
4. **Pulizia del repository**: rimuovere gli script usati una volta (`scripts/wire-*.cjs`, `apply-*.cjs`, `messages-batch*.json`, ecc.), tenere solo quelli utili (`dev-lan`, `vapid`, `add-messages` se serve), `.gitattributes` per fine riga uniformi, controllare che `.env.example` sia completo e che nessun segreto sia nel repository (compresa la cronologia), la cartella `pausa/` non tracciata, il branch `giuseppe_branch`.
5. **Controllo di sicurezza** finale di tutto il codice (accessi, input, segreti, cancellazione dei dati) con revisione dedicata.
6. **`README.md` aggiornato** e **`LICENSE`**.
7. **Elenco "cosa resta da fare online"** (sotto) dentro `DEPLOY.md`, così non dipende dalla nostra conversazione.

## Fase 4: che cosa fa l'altra persona (non dipende da noi)

- Account e piano **Cloudflare** (il piano Workers a pagamento è probabilmente necessario), **dominio** `pausa.gnagno.org`, **database D1** con **backup** (Time Travel).
- **Segreti e variabili** della tabella di `DEPLOY.md`: tra cui `BETTER_AUTH_SECRET`, `RESEND_API_KEY` (con dominio verificato), `TMDB_API_TOKEN`, chiavi VAPID, `ADMIN_EMAILS`, `CONTACT_EMAIL`, `LEGAL_ENTITY`.
- **Google OAuth**: progetto su Google Cloud, schermata di consenso con link a privacy e termini, credenziali con l'URI di ritorno del dominio vero, pubblicazione.
- **Revisione legale** di privacy e termini, accordi sui dati con i fornitori, **licenza TMDB** se c'è un ricavo.
- **Prove sul sito vero**: telefono, browser dentro WhatsApp e Instagram, notifiche push, installazione.
- **App nativa**: installer desktop firmati, Android e iOS, store.
- **SEO e lancio**: Search Console, Bing, contatore senza cookie, lancio.

## Fase 5: cosa serve da te prima di consegnare

- Le tre decisioni della fase 0.
- Il nome della persona e come riceverà l'accesso (GitHub: collaboratore o trasferimento del repository), **senza** passarle chiavi nel repository: le chiavi che abbiamo usato (TMDB, VAPID locali) vanno rigenerate da lei per la produzione.
- Dire se il database di prova (`seed/`) deve restare nel repository (serve per lo sviluppo, non va mai in produzione).

## Ordine proposto

1. Fase 0 (qualche minuto di tue risposte).
2. Fase 1, partendo dalla prova di caricamento del WebAssembly sul Worker (se non regge, ci fermiamo e ne parliamo prima di scrivere il resto).
3. Fase 2, punti 1-9.
4. Fase 3 completa.
5. Fase 2, punto 10 se resta tempo.
6. Consegna.
