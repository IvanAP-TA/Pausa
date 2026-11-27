# Confronto vecchia app (legacy) / app nuova

Risposta a `PROMPT-CORREZIONE-2.md` (27 novembre 2026). Ramo di lavoro: `fix/correzione-2`, partito da `main` 0002ec2.
Una riga per pagina o funzione: **c'era** (ramo `legacy`), **c'è** (questo ramo), **provata come**, **cosa manca**.
"Provata" vuol dire vista davvero: screenshot, curl o test end-to-end sullo stack locale (Worker vero con `wrangler dev`, asset
della build statica). Quello che non ho visto è scritto come **non provato**.

Screenshot: per ora solo l'app nuova (cartella dello scratchpad di sessione, non nel repository). Gli screenshot della vecchia
app affiancati **mancano**: servono la vecchia app in esecuzione in locale, non ancora fatto.

## Dati veri della vecchia app

| Domanda | Risposta |
|---|---|
| I dati veri sono stati migrati? | **Non risulta.** Lo script `tools/migrate-v1-to-v2/` è stato provato solo su dati finti (33 test). Nessun documento del repository registra un'esecuzione su dati veri. |
| Conteggi | **Non li ho.** Wrangler su questo PC non è autenticato e tu hai chiesto di non toccare la produzione. |
| Dove stanno | La vecchia app usava il database D1 `pausa`; la nuova usa un database **separato**, `pausa-v2` (`crates/api/wrangler.jsonc`). Quindi `pausa` dovrebbe essere ancora intatto, ma non l'ho verificato. |
| Come si torna indietro | Il codice vecchio è sul ramo `legacy`. Si ripubblica quello (che punta a `pausa`) sul dominio `pausa.gnagno.org` al posto del Worker `pausa-v2`. Piano mai provato. |

## 1. Urgente

| Voce | C'era | C'è ora | Provata come | Cosa manca |
|---|---|---|---|---|
| Titolare e contatto in Privacy/Termini | Variabili di ambiente | La pagina legge `LEGAL_ENTITY` e `CONTACT_EMAIL` al momento della build. Il workflow ora **rifiuta** un `CONTACT_EMAIL` che non sia un solo indirizzo (niente più `mailto:` con tre indirizzi). | Build locale con `Ivan Pace` / `ivanantoninopace@gmail.com`: pagina giusta (test e2e legali, screenshot). Controllo del formato provato con 4 casi. | **Tu**: impostare su GitHub → Settings → Secrets and variables → Actions → Variables: `LEGAL_ENTITY` = `Ivan Pace`, `CONTACT_EMAIL` = `ivanantoninopace@gmail.com` (qui non c'è `gh`). Testi dei Termini riletti: nessun nome dentro. |
| Vecchi indirizzi in 404 | — | Redirect **301** nel Worker per 13 indirizzi, in it/en/es, con la query conservata: `/me/edit`→`/me/profile`, `/me/diary`→`/diary`, `/me/lists`→`/lists`, `/me/import`→`/import`, `/me/imports`→`/imports`, `/c/{id}/serata`→`/c/{id}/serate`, `/c/{id}/log`→`/log?circle={id}`, `/c/{id}/notifications`→`/notifications`, `/c/{id}/lists`→`/lists?circle={id}`, `/c/{id}/import`→`/import`, `/c/{id}/l/{log}`(`/edit`)→`/c/{id}/log/{log}`(`/edit`), `/c/{id}/p/{user}`→`/c/{id}/people/{user}`. Gli ultimi tre e `/me/imports` non erano nella tua lista ma erano anche loro in 404. | `cargo test` (3 test nuovi in `crates/core/src/shell.rs`); curl su stack locale: 11 indirizzi → 301 giusto; `/it/me`, `/it/me/circles` restano 200. | Provare online dopo il merge. |
| Pagina 404 in tre lingue | Una lingua | Un `404.html` per lingua (`/it/404.html`...): Cloudflare serve quello più vicino all'indirizzo. Senza lingua nell'indirizzo: italiano, come la vecchia app. Anche la 404 dentro l'app (dopo il JavaScript) mostra una lingua sola. | curl: `/en/nope` inglese, `/es/c/x/nope` spagnolo, `/it/...` e `/nope` italiano, stato 404; screenshot 375 e 1280; test e2e SEO aggiornato. | — |

## 2. Difetti visti nell'app

| Voce | C'era | C'è ora | Provata come | Cosa manca |
|---|---|---|---|---|
| Serata, pulsante "Scegli almeno 2 titoli" (telefono) | Fermo sopra la barra | **Causa**: tutta l'app web stava in un riquadro alto quanto lo schermo e ogni pagina scorreva *dentro* un contenitore; il pulsante si fermava al bordo di quel contenitore più 76px. Ora su web scorre la pagina (come legacy): barra in basso fissa, testata in alto ferma, il pulsante si appoggia sopra la barra (`--pausa-bar`). Stesso fix per il pulsante Salva di Registra. | Screenshot 375 it/en, misura della posizione dopo lo scroll. | — |
| Classifica (telefono) | "Classifica", ritorno al Diario | Titolo "Classifica", ritorno "Diario" alla Cerchia (solo telefono). Tipo, ordinamento, filtri e anni in due righe compatte: il primo titolo si vede senza scorrere. | Screenshot 375 chiaro/scuro; e2e a11y (pulsanti 44px). | — |
| Diario Cerchia, colonna con barra propria (desktop) | Scorre la pagina | Risolto dalla stessa causa della Serata: nessun elemento scorre da solo (misurato: zero contenitori con scroll interno a 1280). | Screenshot 1280, misura. | — |
| Striscia "sta guardando", pulsanti stretti al bordo | — | Sulla propria scheda i pulsanti hanno tutta la larghezza della scheda e vanno a capo con margine. | Screenshot 1280 chiaro/scuro. | — |
| Diario personale (telefono), troppo prima della prima visione | Introduzione + 3 pulsanti, nessun "Continua a guardare" | Introduzione in testo piccolo (stesso testo di legacy), Importa e Gestisci piccoli, "Continua a guardare" su una riga che scorre di lato, 3 pulsanti per scheda invece di 4 (il titolo porta a Registra). | Screenshot 375/412. | A 375px la prima visione è ancora appena sotto il bordo: dimmi se vuoi togliere "Continua a guardare" da questa pagina. |
| Importa non cita Cinemaniac | — | Aggiunto in Registra, Profilo, Cerchia e stati vuoti, nelle tre lingue. | Testi controllati. | — |
| (trovato) Tema chiaro sulle pagine pubbliche | La vecchia app leggeva il cookie del tema lato server | Le pagine pubbliche (404, Privacy, landing) sono sempre scure finché non si preme il pulsante tema della pagina. | Screenshot. | Da sistemare con la sezione 3 (landing con JavaScript). |
| (trovato) Conferma "Elimina la lista" | — | La riga "Elimina per sempre / Annulla" ora va a capo: con lo scroll di pagina "Annulla" usciva dallo schermo a 412px. Aggiunto anche `scroll-padding`, così un elemento focalizzato non finisce sotto la barra fissa o la testata. | e2e liste (10/10). | — |
| (trovato) Poster senza immagine nella Serata | — | Le iniziali e i servizi streaming non rompono più il nome accessibile del pulsante (axe). | e2e axe. | — |

## 3. Lasciato a metà

Ramo `fix/correzione-2-s3`, partito da `main` 5f3731a.

| Voce | C'era | C'è ora | Provata come | Cosa manca |
|---|---|---|---|---|
| Immagine Open Graph per `/s/:code` | `next/og`: invito (host, modo, poster) mentre è aperta, Card a Serata decisa | Il Worker mette i tag `og:`/`twitter:` nella pagina `/s/:code` (e `/s/:code/card`) e disegna un PNG 1200x630 in Rust (`crates/og`: i due font dell'app, colori Darkroom, marchio pausa). Aperta: "Giulia ti invita a una Serata", modo e numero di titoli. Decisa: "La Serata ha scelto", titolo vincitore, anno. L'indirizzo dell'immagine cambia quando la Serata decide, così le app di chat non tengono l'invito. Cache all'edge: 5 minuti aperta, un giorno decisa. | `cargo test` (4 test immagine + 2 test tag); immagini guardate a occhio (invito, risultato, titolo lungo su 3 righe); curl sullo stack locale; e2e: tag nell'HTML senza JavaScript, PNG 1200x630, stanza sconosciuta senza immagine e 404. Costo misurato: 2 ms per immagine (nativo, dopo il primo caricamento dei font). Worker: +350 KB non compresso, 974 KB compresso (limite gratuito 3 MB). | **Niente poster** nell'immagine: decodificare JPEG nel Worker costa più CPU dei 10 ms del piano gratuito. Mai provata con WhatsApp vero (serve il dominio pubblico). |
| Safelight nella stanza della Serata | `.projector` | C'era già: la stanza usa `Screen`, che disegna la Safelight. | Screenshot porta d'ingresso (scuro) e stanza (chiaro) a 375. | — |
| Avviso "TMDB spento" nella creazione | `tmdbOff` sotto la ricerca, in Serata e in Registra | Stesso testo sotto la ricerca della Serata e di Registra/Liste/Profilo (`TitleSearch`), letto da `GET /api/imports/config` una volta per sessione. | e2e con la risposta del server simulata `tmdb: false`. | — |
| "Registra" con `with=` | Pulsante "Registra nel diario" sul risultato → form con vincitore e partecipanti | Pulsante "Registra nel diario" sul risultato: apre Registra con il vincitore, la Cerchia e gli altri partecipanti con account già spuntati (non gli ospiti, non te). "L'abbiamo visto" resta sotto, come pulsante secondario. Prima il form di una visione nuova non aveva proprio la sezione "Con chi": ora compare quando si arriva con persone indicate. | e2e: URL con `media`, `circle`, un solo `with` (il membro, non l'ospite), chip spuntato. | — |
| Landing: rimando a `/home` | `SignedInRedirect` | `/public.js` chiede `/api/me`: chi ha un account (non un ospite della Serata) va su `/{lingua}/home`. | e2e con un utente vero e senza sessione. | — |
| Landing: pulsante Google in apertura | `GoogleButton` nell'hero | Link "Continua con Google" nell'hero, nascosto finché `/public.js` non vede Google attivo; resta nascosto nei browser interni delle app (WhatsApp, Instagram...) e nell'app Tauri. | e2e (spento: nascosto; acceso: visibile, ritorno a `/en/home`); screenshot 375 scuro e 1280 chiaro. | Google qui in locale è spento: provato con la risposta simulata. |
| Landing: parallasse e scorrimento morbido | Lenis + `data-speed`, `data-scrub` | Stessi effetti di legacy: tavola dell'hero più lenta, testo dell'hero che sfuma, titolo finale che cresce, scritta Pausa che scivola di lato. Scorrimento morbido con **Lenis 1.3.27** (la versione di legacy, fissata nel `package.json`): rotellina e link del menu scorrono gradualmente e si fermano dove si fermerebbe il browser, sotto la testata. Lenis si scarica solo sulla landing (`/lenis.js`) e solo per chi non chiede meno movimento: per loro tutto resta fermo e nativo. | e2e: Lenis attivo, trasformazioni che cambiano scorrendo; con "riduci movimento" nessun download di Lenis e niente movimento. Link "Come funziona" provato: arriva nello stesso punto dello scroll nativo. | — |
| Tema chiaro sulle pagine pubbliche | Cookie letto dal server | `/public.js` (bloccante in testa alla pagina, quindi prima del primo disegno) applica la scelta salvata dall'app su landing, guide, legali, 404, "rallenta". Il pulsante tema della landing ora la salva. | e2e su 4 pagine; screenshot 375/412/1280 chiaro/scuro in it/en/es. | — |
| Peso del JavaScript delle pagine pubbliche | — | `/public.js` su tutte: 6,6 KB, 2,5 KB gzip, 2,1 KB brotli. In più solo sulla landing `/lenis.js`: 18,3 KB, 5,3 KB gzip, 4,7 KB brotli. Il budget della build fallisce sopra 4 KB (public.js) e 6 KB (Lenis) brotli; nessun altro script è ammesso. Senza JavaScript le pagine funzionano come prima. | `npm run budget`; e2e: ogni pagina pubblica scarica solo `/public.js`. | — |
| Suite e2e intera e test del timer | Timer fallito | Il test del timer passa (round chiuso dal server alla scadenza). | Suite intera sullo stack locale, in tre parti (in un colpo solo il PC finiva la memoria): **336 passati, 2 saltati, 0 falliti** su 338. Unitari 410/410, Rust tutti, fmt e clippy puliti. | I 2 saltati sono condizionali (screenshot opzionali e un test che dipende da una variabile d'ambiente), come prima. |
| Android nativo (sipario e grana) | — | Sipario, luce ambrata e grana si vedono in nativo (accesso, Diario, Serata, Registra, Profilo). **Trovato e corretto un crash**: dopo l'accesso ogni schermata andava in errore ("undefined cannot be used as a constructor"), perché Hermes, il motore JavaScript di Android, non ha `Intl.PluralRules`, `RelativeTimeFormat`, `ListFormat` e `DisplayNames`. Ora `src/i18n/intl.native.ts` usa regole it/en/es scritte a mano, confrontate valore per valore con l'`Intl` vero (`tests/intl-fallback.test.ts`). Il web non le carica (`intl.ts`). | Emulatore Pixel 8a (Android, Expo Go), app collegata allo stack locale; screenshot. | Non è un telefono vero né l'app firmata: in Expo Go il ritorno dal link email (`pausa://`) non si apre da solo, l'ho passato a mano con l'indirizzo di Expo Go. Senza `DisplayNames` i paesi compaiono come sigla (IT, ES). |

Strada facendo: `cargo fmt --check` falliva già su `main` (lo controlla la CI `rebuild-ci.yml`); ora è pulito, e `cargo clippy --workspace -D warnings` non dà avvisi.

## 4. Funzioni richieste e assenti

Le sezioni 4 e 5 sono state fatte dopo il push di `e361d45`, nella cartella di lavoro: **non ancora committate né pubblicate** (il commit è stato bloccato dal controllo dei permessi; serve il tuo ok).

| Voce | C'era | C'è ora | Provata come | Cosa manca |
|---|---|---|---|---|
| Traguardi | — (nessun traguardo in v1) | Profilo → "Traguardi e classifica". Sei scale: visioni, recensioni, Serate fatte, Serate aperte, generi esplorati, rivisti. Contano tutte le visioni, importazioni comprese, e le vedi solo tu. Regole in `crates/core/src/achievements.rs`, testate. | e2e (11 visioni = 7 a mano + 4 importate → "11 su 50"); screenshot 375/1280 scuro/chiaro; controllo di accessibilità automatico (axe) su 4 combinazioni. | — |
| Classifica globale | — | Si entra **solo scegliendo**, con un nome pubblico apposta (2–32 caratteri, niente email o link), e si esce quando si vuole: uscendo, nome, link pubblico e punteggi si cancellano subito. Contano **solo le visioni registrate a mano** (le importate mai), **al massimo 5 al giorno**, contando il giorno in cui la visione viene scritta e non la data dichiarata (retrodatare non serve). Il punteggio si **calcola ogni ora** con un cron, mai alla lettura. Tabelle "Sempre" e "Questo mese", pari merito con la stessa posizione. Migrazione `0004_leaderboard.sql`, cron `0 * * * *` (4 trigger sui 5 del piano gratuito). | e2e: nome con email rifiutato; entrata; calcolo → 5 punti con 7 visioni in un giorno; importate escluse; "tu" in tabella; uscita → pagina pubblica 404 e assente dalla tabella anche dopo un nuovo calcolo. | Nessun filtro per i nomi offensivi (oltre a email e link): oggi andrebbe gestito a mano da un operatore. |
| Privacy e landing | "Non esistono profili pubblici né classifiche globali" | Testi aggiornati nelle tre lingue: privacy ("Quali dati": nome pubblico e punteggio, solo se entri; "Chi vede": le due eccezioni facoltative), punto privacy della landing, FAQ. Data della privacy: 2026-11-27. | Testi riletti; test SEO e legali verdi. | Rileggili tu: sono testi legali. |
| Pagina pubblica del profilo | — | `/u/:handle`, solo se la persona la accende: nome pubblico, traguardi raggiunti, punteggio e posizione. Niente Cerchie, niente visioni. L'indirizzo è casuale (12 caratteri), non deriva dal nome. Nessun accesso richiesto; `noindex`. | e2e da un browser senza sessione; dopo l'uscita → 404. | — |
| Statistiche personali | Solo anno in rassegna e insight di Cerchia | Profilo → "Statistiche": ore viste (film: durata del film; episodio: durata dell'episodio; una serie registrata tutta insieme non ha durata, e la pagina dice che le ore sono "almeno"), film/serie/episodi, voto medio, generi, anno per anno, distribuzione dei voti. | e2e; screenshot. | — |
| QR dell'invito alla Cerchia | Solo sulla Card della Serata | "Mostra il QR" su ogni invito della pagina Cerchia: nero su bianco (si legge meglio), con un nome per i lettori di schermo. | e2e (comparsa, dimensione, scomparsa). | Non l'ho inquadrato con un telefono vero. |
| Immagine OG dinamica della Serata | Statica | Fatta nella sezione 3. | — | — |
| Sentry | Reporter senza SDK, attivo con `SENTRY_DSN` | Stesso approccio nel Worker (`crates/core/src/sentry.rs`, testato): ogni risposta 500 manda a Sentry il motivo (mai al client), metodo e percorso **senza query string** (può contenere codici d'invito). Spento finché non c'è il segreto. | Test del formato (busta di 3 righe JSON, query tolta, messaggio troncato). | **Tu**: crea un progetto Sentry (piano gratuito) e dai `npx wrangler secret put SENTRY_DSN` in `crates/api`. Non provato con Sentry vero. |
| Metriche di prodotto della v1 | `/admin/metrics` | Il pannello c'era già con le metriche della v1, ma "Card condivisa" e "invito condiviso" erano **sempre a zero**: la v2 non registrava mai quegli eventi. Ora condividere la Card o l'invito li registra (`POST /api/serate/:code/events`, uno per persona per Serata, come v1). | Compilazione e test esistenti. | Nessun e2e dedicato agli eventi. |
| Guide SEO aggiuntive | 1 guida | Invariato. | — | **Mi servono i contenuti da te.** |
| Anime solo-AniList: "dove guardarlo" | API senza schermata | Nuova sezione "Dove guardarlo" nella pagina del titolo: i servizi in abbonamento del tuo paese (TMDB/JustWatch, i tuoi in evidenza) oppure, per un anime che TMDB non conosce, i siti di streaming indicati da AniList, come link. "Non sappiamo" resta diverso da "da nessuna parte". | e2e con Death Note (solo AniList nel catalogo finto): Crunchyroll e Netflix; siti non di streaming e link non https scartati (test Rust). | AniList non dice in quali paesi vale ogni sito: la pagina lo scrive. |
| Anime solo-AniList come semi di "Per te" | Solo semi TMDB | Gli anime solo-AniList votati alti diventano semi e portano i consigli di AniList. "Per te" funziona anche con TMDB spento, se ci sono semi AniList. | e2e: compaiono i consigli di Death Note (One Piece, Naruto), non Death Note stesso. | — |

### Già presenti, provati nell'interfaccia (stack locale, 412px)

| Voce | Esito |
|---|---|
| "Un anno fa" | Funziona: una visione di esattamente un anno fa compare sotto "Un anno fa… e oltre" nel diario della Cerchia. |
| "Per cominciare" | Funziona: compare in una Cerchia nuova con i passi mancanti. |
| Browser dentro un'altra app | Funziona: con lo user agent di Instagram il pulsante Google sparisce e compare il suggerimento; con un browser normale c'è (Google simulato acceso). |
| "Per te" | Funziona: per Giulia (dati di prova) 2 titoli da 1 seme. |
| Notifiche push | **Non provate**: in locale manca la chiave VAPID privata e la pagina dice correttamente "non configurate su questo server". Servono la produzione e un telefono vero. |

## 5. Verifiche

| Voce | Esito |
|---|---|
| Serata dal vivo, due persone più un ospite senza account | Provata con browser veri (end-to-end): un membro che apre, un membro, un ospite con solo il nome; sala, torneo con i voti di ognuno, tavolo con 3 punti e un veto, stesso risultato su tutti gli schermi, Card 1080x1920 e 1200x630, socket che cade e torna, timer del server. **Non** provata con persone e telefoni veri. |
| Link email vero (arriva?) | **Non provato**: richiede la produzione e la tua casella di posta. |
| Link scaduto o già usato | **Trovato e corretto un difetto**: portava alla scelta della lingua senza spiegare niente e perdeva la pagina di destinazione. Ora va su `/{lingua}/sign-in` con il messaggio ("è scaduto, dura 15 minuti, o è già stato usato") e conserva `next`. e2e aggiunto. |
| Google | **Non provato**: serve un account Google vero sul dominio di produzione. |
| Ritorno alla pagina di partenza | Coperto da e2e: una pagina privata senza sessione porta all'accesso e poi alla pagina richiesta; un `next` esterno viene ignorato. |
| App v1 installata (guscio Tauri) | **Non provato**: non ho il guscio. |
| Guide nelle tre lingue | Viste: titolo e testo giusti in it/en/es, a 375 e 1280. |
| Telefono Android vero, web app su iPhone | **Non provato**: solo emulatore Android (sezione 3). |
| AAB firmato per Google Play | **Non fatto**: la chiave non si tocca. Nel repository non c'è un progetto Android da firmare: va generato (Expo) e firmato da te. |
| Costi nel piano gratuito, CPU misurata in produzione | **Non misurato**: serve il pannello Cloudflare (qui wrangler non è autenticato). Peso del Worker: 974 KB compresso su 3 MB; immagine OG 2 ms in locale. |

### Test dopo le sezioni 4–5

Suite end-to-end intera (in tre parti, per la memoria del PC): **345 passati, 2 saltati, 0 falliti**. Unitari 424/424. Rust tutti verdi, `cargo fmt` e `clippy -D warnings` puliti. Budget JavaScript: pagina più pesante 347,7 KB su 350 (i testi delle schermate nuove sono divisi per schermata, così non pesano sulle altre).
