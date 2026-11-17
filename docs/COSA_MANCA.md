# Cosa manca a Pausa

Stato al 17 novembre 2026, a lavoro di sviluppo concluso. Il codice è pronto per essere consegnato: quello che resta richiede account, chiavi, decisioni o persone vere.

**Chi**: *proprietario* = decisione o responsabilità del titolare del progetto; *chi mette online* = la persona che riceve il repository; *poi* = lavoro di codice possibile in futuro.

## 1. Chi mette online (guida passo per passo: `docs/DEPLOY.md`)

- [ ] Account **Cloudflare**, piano **Workers a pagamento** (il gratuito ha 10 ms di CPU per richiesta), **database D1**, migrazioni (`npm run db:migrate:remote`), **dominio** `pausa.gnagno.org`.
- [ ] **Segreti e variabili** della tabella di `DEPLOY.md`: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY` + dominio verificato (SPF/DKIM), `EMAIL_FROM`, `TMDB_API_TOKEN`, chiavi VAPID **rigenerate** per la produzione, `ADMIN_EMAILS`, `CONTACT_EMAIL`, `LEGAL_ENTITY`; facoltativi `SENTRY_DSN`, `NEXT_PUBLIC_CF_ANALYTICS_TOKEN`.
- [ ] **Google OAuth** (facoltativo): progetto, schermata di consenso con link a privacy e termini, URI di ritorno del dominio vero, pubblicazione.
- [ ] **Prime verifiche dopo il deploy**: `/api/health/engine` risponde `"wasm"`, accesso via email, Serata con un ospite, `/sitemap.xml`.
- [ ] **Prove su telefono vero** (`docs/PHONE_TEST.md`): browser dentro WhatsApp e Instagram, notifiche push (Chrome/Android; iPhone solo da app installata), installazione, velocità su rete mobile.
- [ ] **Search Console** e **Bing Webmaster Tools**: aggiungere il dominio e inviare la sitemap.
- [ ] **Backup** del database: attivare Time Travel di D1 e decidere ogni quanto esportare.
- [ ] **Cloudflare Web Analytics** (facoltativo): il token entra come `NEXT_PUBLIC_CF_ANALYTICS_TOKEN` e permette di misurare quanti visitatori della landing si iscrivono.

## 2. Proprietario

- [ ] **Revisione legale** di `/it/privacy` e `/it/terms` (testi in `src/lib/legal.ts`): sono una bozza scritta da quello che fa il codice, mai vista da un legale.
- [ ] **Titolare del trattamento**: nome o ragione sociale e contatto (`LEGAL_ENTITY`, `CONTACT_EMAIL`).
- [ ] **Accordi sul trattamento dei dati** con Cloudflare, Resend (e Google se attivo); registro dei trattamenti.
- [ ] **TMDB**: la chiave gratuita è solo per uso non commerciale. Se Pausa genera ricavi serve una licenza.
- [ ] **Licenza**: `LICENSE` è un segnaposto ("tutti i diritti riservati"); mettere il titolare vero o scegliere una licenza.
- [ ] **Età minima**: i termini dicono 14 anni; decidere se serve un controllo.
- [ ] **Cartella `pausa/`** non tracciata nella radice (contiene solo `node_modules` e `next-env.d.ts`, residui di un'installazione accidentale): eliminarla.
- [ ] **Branch `giuseppe_branch`**: le idee sono in `main`; decidere se archiviarlo.
- [ ] **Lancio**: Product Hunt, comunità di cinema e anime, directory; dopo le prove su telefono vero.

## 3. App nativa (Tauri), quando il sito è online

- [ ] Provare `npm run tauri dev` e costruire gli installer desktop (`npm run tauri build`); firma del codice.
- [ ] **Android**: Android SDK/NDK, `tauri android init`, account Google Play (25 $ una tantum).
- [ ] **iOS**: Mac con Xcode, account Apple Developer (99 $/anno).
- [ ] Schede degli store (screenshot, descrizione, informativa), link profondi per aprire le Serate nell'app, aggiornamenti automatici, notifiche native.
- [ ] Pulsante di download diretto sulla landing, quando esistono i file (oggi "Scarica l'app" installa la PWA dal browser).

## 4. Poi (solo se serve)

- Durable Objects per il realtime della Serata: oggi la Serata si aggiorna con il polling, che regge un gruppo di amici. Da fare solo se il carico cresce.
- Content-Security-Policy con nonce: oggi la policy è statica (vedi `SICUREZZA.md`). Il nonce obbliga ogni pagina al rendering dinamico e non è verificato su OpenNext/Cloudflare.
- Altre guide SEO oltre alle 8 per lingua, altre fonti di importazione.
- Verificare con un utente vero l'importazione MyAnimeList (Jikan): il formato della risposta è letto in modo prudente ma non è stato provato dal vivo.

## 5. Fatto

Diario, Cerchie, Serata (torneo e tavolo con veto), liste e classifiche, "sto guardando" con stagione ed episodio, raccomandazioni di gruppo e individuali, streaming in comune, importazione da Letterboxd/IMDb/Trakt/AniList/MyAnimeList, diario per singolo episodio con conteggi da TMDB e AniList, impostazioni della Cerchia (descrizione e immagine, "sta guardando" acceso/spento, silenzio), preferenze di notifica per tipo e riepilogo email giornaliero, pagina di ogni persona, ricerca e filtri nel feed, filtro streaming per gli anime, pagina offline e splash iPhone, Content-Security-Policy, riepilogo dell'anno con card, memorie, notifiche push, metriche, tre lingue, accessibilità (audit axe WCAG 2.1 AA: 32 controlli, zero rilievi), landing con animazioni, 8 guide SEO per lingua con immagini social, anteprime d'invito, QR sulle card, account (modifica, esportazione dati, eliminazione), moderazione (segnalazioni e pagina operatore), eliminazione della Cerchia, limiti anti-spam, pulizia automatica quotidiana, motore di raccomandazioni in Rust/WebAssembly con test di parità, 190 test sulla logica, 43 test end-to-end, CI su GitHub, documentazione di deploy e architettura.
