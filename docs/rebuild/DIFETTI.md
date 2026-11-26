# Difetti di rebuild-v2 e lavori da aggiungere

Confronto del 26 novembre 2026 tra la vecchia app (`legacy`, 513519f) e `rebuild-v2` (62429c6), in locale, nel browser a larghezza telefono e desktop, con i rispettivi dati di prova. Sono state **guardate le schermate**, non provate tutte le azioni. Non è stato provato nulla su un telefono vero.

Regola per chi corregge: tenere aperte le due app, una schermata alla volta, screenshot affiancati (telefono e desktop), e passare alla successiva solo dopo che una persona l'ha approvata.

## 1. Difetti visti

### Tutta l'app
- [ ] **Icone sparite** dalla barra in basso e dalla barra laterale: solo testo. Anche l'avatar nella voce Profilo. (`apps/mobile/src/ui/Icons.tsx` esiste.)
- [ ] **Marchio**: in alto non c'è più il logo, solo la scritta "PAUSA" a sinistra su desktop e niente logo su telefono.
- [ ] **Selettore dello spazio**: il nome della Cerchia in alto non ha più icona né freccia; non si capisce che si può cambiare.
- [ ] **Navigazione cambiata** senza motivo: era Diario (del gruppo), Serata, Registra, Cerchia, Profilo; ora Cerchie, Diario (personale), Registra, Serata, Profilo. Classifica e Liste non sono più a un tocco.
- [ ] **Gerarchia piatta**: quasi tutto è testo piccolo e riquadri sottili dello stesso peso; mancano le superfici, la grana e gli stati attivi evidenti di prima.

### Cerchia
- [ ] La pagina si apre sulla scheda **Persone**, ma in cima mostra "Ultime visioni". Il diario del gruppo non è più la schermata principale.
- [ ] Su telefono la fila di 7 schede **esce dallo schermo** (la scheda selezionata è tagliata).
- [ ] Manca la **fila di avatar** con il numero di visioni dell'anno.
- [ ] La striscia **"sta guardando"** non compare, con i dati di prova.
- [ ] Manca il riquadro **"Per cominciare"**.
- [ ] Le visioni non sono più **raggruppate per giorno** con la data grande.
- [ ] Su desktop manca la **seconda colonna** ("Da vedere insieme" e "In cima alla Classifica").

### Classifica
- [ ] I 5 pulsanti di ordinamento occupano tre righe: su telefono il primo titolo finisce in fondo allo schermo.
- [ ] Locandine e righe molto più piccole di prima.

### Il mio diario
- [ ] "Continua a guardare" ha **quattro pulsanti grandi** per un solo titolo.
- [ ] Ogni visione ha tre pulsanti sempre visibili (Modifica, Cambia chi lo vede, Elimina): prima era un cestino e un pulsante.
- [ ] Mancano le schede "Tutto / Solo miei" nella parte alta e la spiegazione della visibilità.
- [ ] Le stelle del voto sono molto più piccole.

### Registra
- [ ] Il campo di ricerca non ha l'icona.
- [ ] Manca la scorciatoia **"Importa la tua cronologia"**.

### Profilo
- [ ] "Film preferiti" invita a sceglierli ma non si vede un pulsante o un riquadro toccabile.
- [ ] La descrizione di "Importa" non cita Cinemaniac (la scheda nella pagina Importa c'è).
- [ ] Le voci del menu hanno perso le icone.

### Mancanze dichiarate nei documenti del rifacimento (`MANCA.md`)
- [ ] **Accesso con Google** non ricostruito (segnato come escluso da chi ha dato le istruzioni: confermare se è vero). Chi si è registrato con Google va considerato nella migrazione.
- [ ] **AAB Android firmato** per il test chiuso di Google Play.
- [ ] **Account di revisione** per Google Play.
- [ ] Prove su telefono, emulatore, Cloudflare e con screen reader.

### Ambiente
- [ ] `npm run build:web` fallisce con Node 22.11 (`postexport` importa file `.ts`): dichiarare la versione minima di Node o non importare `.ts` dagli script.

## 2. Funzioni da aggiungere dopo i difetti

- [ ] Pagina pubblica del profilo (solo se la persona la sceglie) e **traguardi**.
- [ ] Statistiche personali complete (ore viste, generi): oggi esistono l'anno in rassegna e gli insight di Cerchia.
- [ ] Anime solo-AniList: nessuna disponibilità "dove guardarlo" e non possono fare da "semi" per "Per te".
- [ ] Cronologia "un anno fa" e checklist di avvio (c'erano nella v1).
- [ ] Sentry e metriche di prodotto della v1 (oggi le metriche operatore sono solo conteggi).
- [ ] Immagine Open Graph dinamica per la Serata (oggi è statica, una per lingua: scelta documentata).
- [ ] QR dell'invito alla Cerchia (esiste solo quello della carta della Serata).
- [ ] Rilevamento del browser in-app per l'accesso Google (dipende da Google).
- [ ] Guide SEO aggiuntive (servono contenuti scritti dal proprietario).
- [ ] **Achievement con classifica globale.**

### Da decidere prima di fare la classifica globale
- **Privacy:** Pausa è un diario privato. In classifica si entra solo scegliendolo, con un nome pubblico, e si può uscire.
- **Trucchi:** con le importazioni si caricano migliaia di titoli in un colpo. I traguardi competitivi devono contare solo le visioni registrate a mano, con un tetto giornaliero.
- **Costo zero:** la classifica va calcolata a intervalli (cron) e salvata, non a ogni richiesta.
- Va aggiornata l'informativa privacy.

## 3. Vincoli che restano
Solo piani gratuiti (vedi `docs/REBUILD-PROMPT.md`), testi in it/en/es, accessibilità AA, nessun deploy in produzione senza conferma.

## 4. Secondo giro: landing, produzione, indirizzi, testi, animazioni

### Urgente: la versione nuova è già online
`https://pausa.gnagno.org` serve la build nuova (nessun `/_next/`, `manifest-it.webmanifest`, `/api/health/db` risponde). Gli utenti veri vedono questi difetti. Non è stato verificato se i dati della vecchia app sono stati migrati.

### Landing (vecchia: `git show origin/legacy:src/components/landing/…`)
- [ ] **Titolo principale con le righe sovrapposte** su desktop (1280 px), anche online.
- [ ] **Zero animazioni e zero grafica**: nessuna immagine, nessun SVG, nessun pulsante interattivo. È una colonna di testo e linee.
- [ ] Sparita la **demo "Prova la Serata"** (`try-serata.tsx`).
- [ ] Sparite le **finte schermate** del prodotto (`mock-ui.tsx`: invito, scheda visione, sfida, Card risultato).
- [ ] Sparito **"Come funziona"** illustrato (`how-it-works.tsx`).
- [ ] Sparite **comparsa allo scorrimento, scorrimento morbido, barra di avanzamento, pulsante fisso** (`reveal.tsx`, `smooth-scroll.tsx`, `sticky-cta.tsx`).
- [ ] Sparito il fondale "sipario e luce di proiettore".
- [ ] Sparito il menu (Come funziona, Prova, Privacy, FAQ), il **selettore tema**, il marchio e **"Scarica l'app"** (`install-app.tsx`).

### Animazioni nell'app
- [ ] La vecchia app aveva 9 animazioni con nome (`rise`, `arrive`, `draw`, `stand`, `unfold`, `mark-x`, `mark-y`, `pop`, `pulse`) e molte transizioni in `src/app/globals.css`. Nella nuova il movimento è quasi assente: riportarle tutte, rispettando "riduci movimento".

### Indirizzi rotti (404, anche online)
- [ ] `/it/me/edit`, `/it/me/diary`, `/it/me/lists`, `/it/me/import`, `/it/me/circles`
- [ ] `/it/c/{id}/members`, `/serata`, `/log`, `/notifications`, `/lists`

Segnalibri, link condivisi e app installate puntano lì: servono redirect 301.

### Testi e moduli
- [ ] Nella pagina 404 compaiono tre lingue una sotto l'altra: mostrare solo quella della persona.
- [ ] "Registra": la data si presenta come `2026-11-26`; le stelle hanno due pulsanti separati "−½ / +½".
- [ ] "Account": i dispositivi mostrano la stringa tecnica del browser.
- [ ] Scheda del titolo: "Continua a guardare" con quattro pulsanti sta sopra la trama.

### Piste da verificare (testi presenti nel catalogo ma che il client forse non usa)
Ricerca automatica per ultimo segmento della chiave, quindi può sbagliare: `feed.onAir`, `feed.older`, `log.modeWatching`, `log.setWatching`, `serata.suggest`, `profile.forYou`, `retention.firstStepsTitle`, `retention.memoriesTitle`, `pushSettings.*`, `services.*`, `imports.older*`, `space.*`, `aside.*`. Controllare una per una se la funzione esiste.
