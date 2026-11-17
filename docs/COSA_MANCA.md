# Cosa manca a Pausa

Stato al 17 novembre 2026. **Chi**: *tu* = serve un tuo account, una tua chiave o una tua decisione; *io* = lavoro di codice che posso fare; *insieme* = servono entrambi.

## 1. Per andare online (blocca tutto il resto)

- [ ] **Cloudflare** (*tu*): account, `npx wrangler d1 create pausa`, id nel `wrangler.jsonc`, `npm run db:migrate:remote` (migrazioni 0000-0007).
- [ ] **Piano Workers** (*tu*): il piano gratuito ha 10 ms di CPU per richiesta e Next.js su Workers di solito ne richiede di più. Mettere in conto il piano a pagamento (circa 5 $/mese) e provare.
- [ ] **Dominio** (*tu*): `pausa.gnagno.org` su Cloudflare e route verso il Worker; poi `npm run deploy` (*insieme*).
- [ ] **Segreti e variabili in produzione** (*tu*, con `npx wrangler secret put`): `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `TMDB_API_TOKEN`, `VAPID_PRIVATE_KEY`; variabili di build: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; più `ADMIN_EMAILS`, `CONTACT_EMAIL`, `LEGAL_ENTITY`.
- [ ] **Resend** (*tu*): account, verifica del dominio (SPF/DKIM), chiave API. Senza, nessuno riesce ad accedere in produzione.
- [ ] **Google OAuth** (*tu*, poi *io* per i dettagli sotto):
  - Google Cloud Console: nuovo progetto, schermata di consenso OAuth (tipo esterno), email e profilo come ambiti, link a `/it/privacy` e `/it/terms`, dominio autorizzato.
  - Credenziali: "ID client OAuth" di tipo Web, con URI di reindirizzamento `https://pausa.gnagno.org/api/auth/callback/google` e, per lo sviluppo, `http://localhost:3000/api/auth/callback/google`.
  - Mettere `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` (secret in produzione, `.env.local` in locale).
  - Portare l'app da "Test" a "In produzione", altrimenti entrano solo gli utenti di prova elencati.
  - **Da sistemare nel codice** (*io*): Google blocca l'accesso dentro i browser incorporati di WhatsApp e Instagram (errore `disallowed_useragent`). Va nascosto il pulsante Google lì e lasciato il link via email. Va anche verificato che chi entra con Google e poi con email (stessa email) finisca sullo stesso account.
- [ ] **Test su telefono vero** (*tu*, `npm run dev:lan` e `docs/PHONE_TEST.md`): mai fatto.
- [ ] **Prova dopo il deploy** (*insieme*): notifiche push (Chrome/Android; iPhone solo da app installata), browser dentro WhatsApp e Instagram, installazione come app, velocità con rete mobile.
- [ ] **Pagine dopo l'accesso mai misurate in produzione**: i tempi veri si vedono solo dal sito pubblico.

## 2. Legale e fiducia

- [ ] **Revisione di privacy e termini** da un legale o DPO (*tu*): oggi sono una bozza scritta da quello che fa il codice.
- [ ] **Titolare del trattamento** (*tu*): nome o ragione sociale e contatto da mettere in `LEGAL_ENTITY` e `CONTACT_EMAIL`.
- [ ] **Accordi sul trattamento dei dati** (*tu*) con Cloudflare, Resend e Google; registro dei trattamenti.
- [ ] **TMDB per uso commerciale** (*tu*): l'API gratuita è solo non commerciale. Se Pausa genera ricavi serve una licenza.
- [ ] **Età minima** (*tu*): i termini dicono 14 anni; decidere se serve un controllo.
- [ ] **Moderazione** (*io*): nessuna segnalazione di commenti o persone, nessun blocco, nessun pannello admin per rimuovere contenuti.

## 3. Prodotto: funzioni che mancano

**Cerchie**
- [ ] Eliminare una Cerchia (*io*): oggi si può solo uscire.
- [ ] Trasferire la proprietà a un altro admin (*io*).
- [ ] Profilo della Cerchia: oggi ha solo il nome; mancano descrizione e immagine (*io*).

**Diario**
- [ ] Diario per singolo episodio e conteggio degli episodi veri da TMDB: oggi c'è solo "stagione sul log" e "S3·E4 in corso" (*io*).
- [ ] Ricerca e filtri nel feed (per persona, tipo, anno) (*io*).
- [ ] Pagina per ogni persona della Cerchia (i suoi log, i suoi gusti) (*io*).
- [ ] Aggiunta rapida a una lista da qualsiasi locandina (oggi dalla lista o dal log) (*io*).
- [ ] Riordino delle classifiche trascinando (oggi con frecce su e giù) (*io*).

**Notifiche**
- [ ] Preferenze per tipo, silenziare una Cerchia, riepilogo (*io*).
- [ ] Email come ripiego per chi non attiva la push (*io*).
- [ ] Push nell'app nativa Tauri (plugin di notifica, *io*).

**Account**
- [ ] Cambiare email, collegare più accessi, uscire da tutti i dispositivi (*io*).
- [ ] Pulizia automatica con un lavoro pianificato di Cloudflare (*io*): ospiti anonimi vecchi, sessioni scadute, link di accesso scaduti, contatori del rate limit. Oggi si accumulano.
- [ ] Limiti anti-spam sulle azioni (creare Cerchie, Serate, inviti, commenti, log): il rate limit oggi copre solo l'accesso (*io*).

**Scoperta**
- [ ] Filtro streaming per gli anime: AniList non ha dati di disponibilità (*io*, serve un'altra fonte).
- [ ] Raccomandazioni: gli stessi consigli individuali si potrebbero mescolare con quelli di gruppo (*io*).
- [ ] Altre importazioni (IMDb, Trakt, Serializd) (*io*, facoltativo).

**Realtime**
- [ ] La Serata usa un controllo ogni pochi secondi; se il carico cresce valutare Durable Objects o Partykit (*io*).

## 4. App nativa e PWA

- [ ] **Tauri desktop** (*insieme*): compila e produce `pausa.exe`, ma non è mai stato aperto contro il sito vero. Mancano installer firmati, aggiornamenti automatici, link profondi (aprire i link delle Serate nell'app).
- [ ] **Android** (*tu* installi Android SDK/NDK, poi *io*): `tauri android init` e build. Account Google Play (25 $ una tantum).
- [ ] **iOS** (*tu*: serve un Mac con Xcode e account Apple Developer, 99 $/anno; poi *io*).
- [ ] **Schede degli store** (*insieme*): screenshot, descrizione, informativa privacy, età.
- [ ] **PWA**: manca una pagina offline e uno splash per iPhone; il service worker oggi serve solo alle push (*io*).
- [ ] **Download diretto** dell'installer sulla landing: da aggiungere quando esistono i file (*io*).

## 5. Qualità, sicurezza, operatività

- [ ] **Audit di accessibilità con uno strumento vero** (axe o Lighthouse) e prova con uno screen reader (*io*, *tu* per la prova su telefono): ho controllato con uno script mio, non con strumenti standard.
- [ ] **Test end-to-end** (Playwright) e integrazione continua su GitHub (*io*): oggi ci sono solo i test della logica (153), nessun test automatico dell'interfaccia.
- [ ] **Monitoraggio degli errori** (Sentry o simile) e avvisi (*insieme*).
- [ ] **Backup di D1**: attivare Time Travel e decidere ogni quanto esportare (*tu*).
- [ ] **Limiti del piano**: D1 ha un massimo di circa 50 query per richiesta e 100 valori per istruzione; il codice li rispetta e c'è un test, ma va ricontrollato dopo ogni pagina nuova (*io*).
- [ ] **Immagini**: le locandine vengono da TMDB senza ottimizzazione; valutare Cloudflare Images o una cache (*io*).
- [ ] **Pagina metriche** solo in italiano (*io*, facoltativo).
- [ ] **Cartella `pausa/` non tracciata** nella radice del progetto (*tu*): non è mia; controlla se va eliminata o ignorata.
- [ ] **Sei commit non ancora su GitHub** (ultimo `4196a40`) (*tu* decidi).
- [ ] **Branch `giuseppe_branch`**: le idee sono state portate in `main`, il branch resta com'è (*tu* decidi se archiviarlo).

## 6. Crescita

- [ ] **SEO** (*io* per i contenuti, *tu* per gli account): registrare il dominio su Search Console e Bing e inviare la sitemap; misurare i Core Web Vitals sul dominio vero; altre guide (oggi 4 per lingua); immagine social per ogni guida.
- [ ] **Misurare la conversione della landing** (*insieme*): oggi le metriche partono dopo l'iscrizione. Per sapere quanti visitatori diventano utenti serve un contatore rispettoso della privacy (per esempio Cloudflare Web Analytics, senza cookie).
- [ ] **Virale**: codice QR e invito diretto sulla Card pubblica, ricompensa per chi porta una nuova Cerchia, versione più forte della card dell'anno a dicembre (*io*).
- [ ] **Lancio** (*tu*): Product Hunt, comunità di cinema e anime, elenchi di directory; il tutto dopo il test su telefono vero.
- [ ] **Motore di raccomandazioni in Rust**: non serve ora. Si riapre se arrivano decine di migliaia di utenti (*io*).
