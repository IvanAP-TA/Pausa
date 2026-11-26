# Allineamento a legacy (grafica + funzioni)

Obiettivo (25 nov 2026): l'app nuova (`apps/mobile`) deve essere **identica** al ramo `legacy` (Next.js, design Darkroom, colourway Pellicola) nell'aspetto e nelle funzioni. Qui c'è l'inventario delle differenze, schermata per schermata, e l'ordine di lavoro.

Metodo: audit del codice dei due rami e screenshot affiancati a misura di telefono (Pixel 7), con gli stessi dati di prova.
- Legacy: worktree di `origin/legacy`, avviato con `npm run dev`.
- Main: `node tools/dev-stack.mjs --seed`, poi `npm run build:web` e `node scripts/serve-dist.mjs 4173`.

Radici dei percorsi: **L** = `src/` del ramo legacy; **N** = `apps/mobile/src`. Colonna **API**: "no" vuol dire solo lavoro sul client; "c'è" vuol dire che l'endpoint esiste ma il client non lo usa; "**manca**" vuol dire che serve lavoro in Rust (`crates/api`, `crates/core`).

## Stato al 26 nov 2026

### Fatto (fasi 1 e 2)

**Base grafica**
- [x] Palette identica a legacy.
- [x] Safelight e tenda su ogni schermata web (`N/ui/Safelight.tsx`).
- [x] PauseMark e Wordmark (`N/ui/Brand.tsx`).
- [x] Icone lucide: 33 icone, un file ciascuna (`N/ui/lucide.ts`). Dipendenze aggiunte: `react-native-svg`, `lucide-react-native`.

**Ingresso e rotte**
- [x] `/home` porta all'ultima Cerchia.
- [x] `/c/:id` è il diario; `/c/:id/feed` reindirizza lì.
- [x] La vecchia pagina riassuntiva della Cerchia è su `/c/:id/members` (scheda "Cerchia").
- [x] Nuova pagina `/me/circles` per creare o entrare in una Cerchia.

**Barre e colonne**
- [x] Barra in alto: marchio, menu per cambiare Cerchia (`N/features/SpaceMenu.tsx`), campanella lucide con badge "9+".
- [x] Barra in basso come legacy: Diario · Serata · + pieno · Cerchia · Profilo con avatar; segno attivo animato. Senza Cerchia la barra non c'è.
- [x] Colonna sinistra da 64rem: Wordmark, Registra pieno, Diario, Serata, Classifica, Liste, Cerchia, Profilo, Esci; layout 62rem.
- [x] Seconda colonna da 80rem (`N/features/CircleAside.tsx`): "Da vedere insieme" e top 5 della classifica; layout 82rem.

**Controlli e primitive**
- [x] Controlli come legacy: pulsanti (hover, sm/lg, icona, primario disabilitato), sottolineatura dei link accento in hover, bordo dei campi accento al focus, BackLink, Tag 24px, stelle lucide, spunta nei Choice.
- [x] Primitive pronte in `N/ui/Surfaces.tsx`: Well con grana, Reel (pellicola), DayHead, Chapter, EmptyMark, Meter, CheckBox. Animazioni di legacy nel CSS globale.
- [x] Stato vuoto con il segno pausa.

**Test**
- [x] Test e2e aggiornati alle nuove rotte.
- Noto: il test del timer della Serata fallisce anche sul codice originale, prima di queste modifiche.
- Da fare: rilanciare tutta la suite e2e. È stata interrotta; l'ultimo giro sulle spec toccate era ok, tranne il timer della Serata e il test della pagina persona, che è stato corretto ma non ancora rilanciato.

### Cosa manca

**Fase 3: diario della Cerchia (§B)**
- [x] Intestazione (`N/features/diary/CircleHead.tsx`, 26 nov):
  - [x] togliere "Le tue Cerchie" e la striscia di 7 schede;
  - [x] pila di avatar, "N membri, N visioni quest'anno" (server: `CircleDetail.logsThisYear`), pulsanti Classifica e Liste con icona (solo telefono).
- [x] Striscia "sta guardando" dentro Reel (server: `CircleDetail.watching`, ultimo titolo "watching" per membro; vuota se la Cerchia l'ha spento o io lo nascondo; esclusi i membri che lo nascondono).
- [x] "Per cominciare" in un Well con grana, con Meter (server: `GET /api/circles/:id/extras`, `CircleExtras.hasLog/hasCompany/hasSerata`; 26 nov).
- [x] Ricordi "N anni fa" (server: `CircleExtras.memories`, ±3 giorni, max 3, recensione tolta se ha spoiler; 26 nov).
- [x] "Cerca e filtra" in linea (`N/features/diary/FilterBar.tsx`, 26 nov):
  - [x] ricerca per testo e filtro "Visto con" (server: feed `q`, `with`, `watchedYear` = anno della visione come v1, `mediaId`; `year` resta l'anno di uscita);
  - [x] chip con avatar (`N/ui/PersonChip.tsx`), anno come select (`N/ui/Select.tsx`: `<select>` sul web, Choice su native), soglie 5/4/3. Tenuto il filtro piattaforma di main. Tolto il pulsante "Aggiorna" (v1 non l'ha; resta il trascina-per-aggiornare su native).
- [x] Diario diviso in giorni con DayHead (`Days` in `N/features/diary/Feed.tsx`, per giorno di arrivo nella Cerchia; 26 nov).
- [x] LogCard (`N/features/diary/shared.tsx`, 26 nov; server: `LogDto.runtimeMin/genres/overview/watchedWith/lastComment`):
  - [x] intestazione con autore e tempo relativo; poster 104/128;
  - [x] meta con durata e generi, stelle grandi;
  - [x] "Visto con", trama;
  - [x] recensione intera, spoiler sul posto;
  - [x] reazioni cliccabili (`ReactionBar`, icone lucide, anche nel thread), ultimo commento (senza testo se spoiler).
- [x] Dettaglio log: LogCard in testa, aggiungi a lista (select), tempi relativi, modifica dentro la Cerchia (`/c/:id/log/:logId/edit`; server `GET /api/logs/:id` solo per l'autore). 26 nov, agente.
- [x] Form Registra (26 nov, agente; `N/features/diary/LogForm.tsx`):
  - [x] modalità "Sto guardando" (server `POST /api/media/resolve` per titoli non ancora in Pausa);
  - [x] trama e generi del titolo;
  - [x] stelle grandi (44px);
  - [x] dettagli piegati (`log-details`);
  - [x] barra di salvataggio fissa (sticky sul web);
  - [x] date picker (`<input type="date">` sul web), select della stagione;
  - [x] trama scritta dall'utente (`media_detail.source='user'`, max 1200, mai sovrascritta);
  - [x] PersonChip;
  - [x] link "Importa".
  - Differenze tenute: "Chi lo vede" a chip per Cerchia; chip piattaforma di main; un film in "Sto guardando" non mostra campi.
- [x] Pagina titolo dentro la Cerchia (`/c/:id/m/:mediaId`, `N/features/diary/CircleTitle.tsx`; server `GET /api/circles/:id/media/:mediaId`). Media da `rating_current` (ultimo voto di ogni membro); "Aggiungi a lista" porta a `/lists?circle=&add=`. 26 nov, agente.
- [x] Pagina persona: 3 cifre, ripartizione per tipo, sta guardando, amati con stelle, ultimi 5 log (server: `PersonProfile.titles/kinds/lovedRatings/watching`). 26 nov, agente.

**Fase 4: altre schermate (§C, §D)**
- [x] Serata (26 nov, agente; `N/features/serata/*`):
  - [x] setup a griglia di poster (ordine = ordine di scelta, niente più lista trascinabile);
  - [x] stanza con anello del timer, BracketBar, "vs", griglie;
  - [x] risultato con poster hero;
  - [x] SerataCard chiara e pagina `/s/:code/card`;
  - [x] "Suggerisci" e servizi in comune (server, solo dati già in D1: niente chiamate TMDB); invito per l'ospite (server: `inviteCode` nel risultato SOLO per chi ha partecipato, come v1).
  - Non fatto: immagini OG lato server per `/s/:code`, safelight nella stanza, avviso "TMDB spento" nel setup, "Registra" con `with=`.
- [x] Classifica: posizioni grandi, Meter, tag persona+voto, "visto senza voto" (`RankedDto.watchedBy`). Resta il foglio filtri (main) e il titolo porta alla pagina del titolo.
- [x] Insights: cifre grandi in un well, titolo dell'anno con poster, "Per te" (`/me/for-you`, link al form con `pick=`), coppie con Meter, "insieme più spesso" (`YearReview.togetherMost`). Anni restano Choice (non link a pill).
- [x] Liste (26 nov):
  - [x] tipo "ranking";
  - [x] striscia di poster, nome del proprietario (**server**);
  - [x] gestione in linea;
  - [x] liste della Cerchia separate da quelle personali.
- [x] Membri: inviti per primi in un Well, codice grande, copertine a glifi (impostazioni), toggle push (solo web, nascosto senza chiave VAPID).
- [x] Notifiche: lette in automatico all'apertura (la visita le mostra ancora non lette), tempo relativo, lette in muted.
- [x] Profilo (26 nov, agente):
  - [x] avatar 88, "N visioni" (**server**: `MySettings.logs/privateLogs`). 26 nov, agente;
  - [x] "Per te" (servizi: **server**: `ForYouPick.on`; `people/ForYou.tsx`);
  - [x] righe con icone, griglia dei preferiti (3/5 colonne, `people/PosterGrid.tsx`, anche in modifica con X);
  - [x] galleria degli avatar (griglia 6/8 colonne; ordine nome, avatar, bio, generi).
- [x] Diario personale (26 nov, agente):
  - [x] schede "Tutte" e "Solo private" (server `only=private`, `/api/me/diary/counts`);
  - [x] controlli di visibilità per ogni visione;
  - [x] modale per eliminare.
- [x] Import: BackLink, zona di rilascio (web), "Import vecchi" per giorno (server `/api/imports/bulk-days`). 26 nov, agente.
- [x] Account (26 nov, agente; eliminazione: email controllata anche dal server):
  - [x] "Ha portato N persone" e Fondatore (**server**: `MySettings.brought`);
  - [x] Web Push (`people/PushToggle.tsx` + handler `push` in `scripts/sw.template.js`);
  - [x] servizi di streaming (`people/Services.tsx`);
  - [x] select per lingua e tema;
  - [x] eliminazione con conferma via email (server: `DELETE /api/account` accetta `email` e lo confronta).

**Fase 5: pagine pubbliche, admin, Android**
- [x] Landing, zero JavaScript (decisione utente: CSS/HTML nativo; `N/features/public/{Landing,LandingChrome,LandingMocks,TryDemo,landing-css}`; 26 nov, agente):
  - [x] header sticky con ThemeToggle (checkbox + `:has()`, vale solo nella pagina, niente cookie);
  - [x] hero con mock UI;
  - [x] demo TrySerata (radio + `:has()`, `id="try"`, "Ricomincia" = reset);
  - [x] FAQ (`<details>`);
  - [x] footer a mast;
  - [x] StickyCta (sticky + scroll-timeline), InstallApp (sempre le istruzioni, nascosto in standalone), reveal (`animation-timeline: view()`, fallback statico).
  - Non fatto (serve JS): redirect a /home se già loggato, pulsante Google nell'hero, parallasse Lenis. `:has()` richiede Firefox ≥ 121.
- [x] Sign-in a 2 colonne, Google per primo, attribuzione TMDB.
- [x] Invito: anteprima e motivo se il link non vale.
- [x] Guide: breadcrumb (`<nav>` + JSON-LD) e "altre guide" (vuota finché c'è una sola guida). Niente OG per guida (serve rendering lato server).
- [x] Pagine legali a 2 colonne (titolare/contatto ancora segnaposto, D7).
- [x] Pagine di errore e /slow-down.
- [x] Admin: metrics e reports. /review (**server**): `features/admin/{Metrics,Reports,Review}.tsx`, `core/src/review.rs`, `api/src/review.rs`; /review attiva solo con `REVIEW_EMAIL` + `REVIEW_PASSWORD`.
- [x] Android nativo: safelight, tenda e grana (`Safelight.native.tsx`, `Grain.native.tsx`, react-native-svg; da controllare a occhio su dispositivo).

Cose che main ha in più e che **restano**: uscita dalla stanza Serata, stato della connessione, avviso di pareggio, riordino trascinando, ripeti/visto nella cronologia Serate, filtro e paginazione delle notifiche, trasferimento di proprietà, duplica lista, note e priorità, risposte annidate, "continua a guardare", sessioni, silenzia e nascondi per Cerchia, filtro piattaforma.

## Ordine di lavoro

1. **Fase 1**: questo inventario. ✅
2. **Fase 2, struttura** (§A): routing (si entra nel diario della Cerchia, `/c/:id` = diario), barra in alto con PauseMark e SpaceMenu, tab bar e rail come legacy, icone lucide, controlli globali, primitive (grana, pellicola, giorno, capitolo, segno vuoto, meter).
3. **Fase 3, diario della Cerchia** (§B): intestazione, "sta guardando", "Per cominciare", filtri in linea, giorni, LogCard completa con reazioni e ultimo commento, dettaglio, form, pagina titolo, persona.
4. **Fase 4, altre schermate** (§C, §D): Serata, Classifica, Insights, Liste, Membri, Notifiche, Profilo, Account, Import.
5. **Fase 5**: pagine pubbliche (§A landing, guide, sign-in, legali), admin, review, Android nativo.

Lavoro sul server (Rust) che serve, raccolto in un posto:
- ~~LogDto: `watchedWith`, `lastComment`, `runtimeMin`, `genres`, `overview`.~~ Fatto.
- ~~Feed: filtri `q`, `with`, `mediaId`.~~ Fatto (+ `watchedYear`).
- ~~Endpoint per la progress "sta guardando" dei membri della Cerchia.~~ Fatto: `CircleDetail.watching`.
- ~~"Visioni quest'anno" in CircleDetail.~~ Fatto: `CircleDetail.logsThisYear`.
- ~~"Per cominciare" e ricordi "N anni fa".~~ Fatto: `GET /api/circles/:id/extras`.
- GET di un singolo log mio.
- MediaDto: titolo originale, media della Cerchia, source.
- Persona: titoli, ripartizione per tipo, sta guardando, voto sugli amati.
- `/me/diary`: `only=private` e conteggi.
- Import vecchi per giorno.
- "Ha portato N persone" e Fondatore.
- RankedDto: nomi di chi ha visto senza votare.
- YearReview: `togetherMost`.
- ListSummary: nome del proprietario.
- Serata: "suggerisci" e servizi in comune; `inviteCode` nel risultato pubblico.
- Route `/review`.
- `ForYouPick`: servizi.
- `LogIn.overview`.

---

## A. Struttura e ingressi

### Shell, barra in alto, menu Cerchie
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| Colonna centrata `max-w-md` → `lg:62rem`, `xl:82rem` | L/components/shell.tsx:20 | N/features/Shell.tsx:144-176 piena larghezza | grafica | no |
| Barra 56px sticky con PauseMark a sinistra (telefono) | space-switch.tsx:17-20 | nome in testo, senza marchio | grafica | no |
| SpaceSwitch: icona Users, nome Cerchia, ChevronDown che ruota, tendina con tutte le Cerchie, check sulla corrente e riga "+"; si chiude con Esc, tap fuori o cambio pagina | space-menu.tsx:15-67 | assente (il nome porta a /home) | funz+graf | no |
| Campanella lucide, badge "9+" | space-switch.tsx:29-41 | disegnata a mano, "99+" (Bell.tsx) | grafica | no |
| Campanella → `/c/:id/notifications` | space-switch.tsx:31 | `/notifications` globale | funzione | no |

### Tab bar e rail
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| Tab: **Diario (Cerchia)**, Serata, +Registra, **Cerchia (membri)**, Profilo | tab-bar.tsx:65-93 | Cerchie, Diario personale, Registra, Serata, Profilo | funzione | no |
| Icona sopra ogni etichetta, attiva in accento, text-xs | :46-47 | solo testo, Title 20px | grafica | no |
| Profilo = mio avatar tondo, anello accento se attivo | :86-92 | testo | grafica | no |
| Registra: quadrato accento pieno 40px con il + dentro; sul rail pulsante pieno | :69-80 | + su trasparente | grafica | no |
| Sottopagine (/m /l /p /notifications /insights /import) tengono acceso Diario | :31 | logica diversa | funzione | no |
| Segno attivo con animazione mark-x / mark-y | :42 | statico | grafica | no |
| Rail: Wordmark, righe Classifica e Liste, Esci in fondo, 14rem, riga attiva su paper-2 | :61-98 | solo nome, 240px | funz+graf | no |
| Senza Cerchia: solo la barra in alto | shell.tsx:26 | barra sempre | funzione | no |

### Seconda colonna (CircleAside, da 80rem)
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| "Da vedere insieme" + link "perché" | circle-aside.tsx:52-75 | assente | funz+graf | c'è `/circles/:id/recommendations` |
| Classifica top 5 + link | :77-95 | assente | funzione | c'è `/circles/:id/ranking` |

### Ingresso e routing
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| /home loggato → ultima Cerchia `/c/:id` (diario) | home/page.tsx:25-30 | lista Cerchie (Home.tsx:98-124) | funzione | no |
| /home senza Cerchie: Wordmark, titolo display, crea, entra su plate | :32-61 | Empty + form dentro la shell | grafica | no |
| `/c/:id` = diario | c/[circleId]/page.tsx | hub; il diario sta su `/c/:id/feed` | funzione | no |
| `/` redirect per Accept-Language; `?app=1` → /home | L/app/page.tsx:6-15 | pagina statica per la lingua | funzione | no |
| Landing → /home se già loggato | landing/signed-in-redirect.tsx | assente | funzione | no |
| Pagina /me/circles (lista con tag admin, entra, crea) | me/circles/page.tsx:97-146 | nessuna route (in Home) | funzione | no |

### Sign-in, invito
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| Foglio a 2 colonne, form in un well con grana, Wordmark, titolo text-poster | sign-in/page.tsx:20-31 | colonna unica | grafica | no |
| Google **per primo** con la G colorata, poi divisore "oppure" | sign-in-form.tsx:35-38 | secondario dopo l'email | grafica | no |
| Avviso per i browser in-app; attribuzione TMDB; il form lascia il posto al messaggio | :26,32; page:46-48 | assenti | funz+graf | no |
| Invito: anteprima "Entra in {Cerchia}" e pulsante esplicito; motivo se il link non vale (scaduto, esaurito, revocato); redirect automatico al sign-in | join/[code]/page.tsx:16-47 | entra da solo al caricamento, errore generico | funzione | c'è `GET /invites/:code`, manca il metodo nel client |

### Landing, guide, legali
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| Header sticky: marchio, ancore, lingue, ThemeToggle, Accedi + Inizia, linea di progresso | landing.tsx:78-108 | non sticky, ridotto | funz+graf | no |
| Hero a 12 colonne, `.rise`, CTA lg + Google + InstallApp, mock UI | :113-138, mock-ui.tsx | testo + 2 pulsanti | funz+graf | no |
| Sezione problema e CTA finale su well con grana; HowItWorks sticky; ospiti con numeri grandi | :141-257 | sezioni semplici | grafica | no |
| **TrySerata**, demo funzionante | try-serata.tsx | assente | funzione | no |
| FAQ `<details>` con + che ruota; privacy sticky | :215-246 | statico | funz+graf | no |
| Footer a mast, StickyCta, smooth scroll, reveal, InstallApp | :261-287 e componenti | assenti | funz+graf | no |
| Guide: righe a 3 colonne, breadcrumb, plate, CTA → `/#try`, "altre guide", immagine OG | guide/* | ridotte | funz+graf | no |
| Pagine legali senza header/footer del sito, plate a 2 colonne | legal-page.tsx | dentro PublicPage | grafica | no |
| Pagine errore e /slow-down | error.tsx, slow-down | assenti | funz+graf | no |

### Marchio, icone, controlli globali
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| PauseMark + Wordmark | brand.tsx | ✅ creati, da usare | grafica | no |
| Icone lucide ovunque | vari | Plus/Chevron a mano | grafica | no |
| ThemeToggle a un tasto; skip link anche nell'app | theme-toggle.tsx; layout.tsx:65 | assenti | funzione | no |
| BackLink: ChevronLeft 20, text-sm, senza sottolineatura | back-link.tsx | TextLink sottolineato | grafica | no |
| `.btn`: hover paper-3, `.btn-lg` 52, `.btn-sm` 36, primario disabilitato = contorno rule | globals.css:220-240 | niente hover/lg/sm, opacity .55 | grafica | no |
| `.link` hover accento; `.field` focus accento | :243,257 | niente hover; focus ink | grafica | no |
| Checkbox e radio: cella 20px, piena accento con spunta | :196-203 | "✓ " di testo, interruttore | grafica | no |
| `.tag` min-h 24; `.row-link` chevron sottile, accento in hover | :261,301 | diversi | grafica | no |
| Grana, pellicola, giorno, capitolo, segno vuoto, meter, skeleton | :95-160 | assenti (skeleton c'è) | grafica | no |

---

## B. Diario della Cerchia e dintorni

### Diario (`/c/:id`)
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| Il diario è la pagina della Cerchia | c/page.tsx:69 | hub + Feed separato | funzione | no |
| H1 con il glifo della copertina | :74 | senza glifo | grafica | no (c'è `cover`) |
| Pila di 4 avatar sovrapposti → membri | :77-80 | Tag "N persone" | grafica | no |
| "N membri, N visioni quest'anno" | :82 | assente | funzione | **manca** (campo in CircleDetail) |
| Pulsanti Classifica e Liste con icone | :86-95 | striscia CircleNav di 7 voci | grafica | no |
| Striscia "sta guardando" (poster, progresso, prossimo ep/stagione, smetti, puntino che pulsa), a forma di pellicola | :101-135 | assente | funz+graf | **manca** (progress dei membri) |
| "Per cominciare" (contatore, meter, passi mancanti), well con grana | :198-227 | assente | funzione | **manca** (o derivato sul client) |
| Ricordi "N anni fa" | :229-247 | assente | funzione | **manca** |
| "Cerca e filtra" in linea (`<details>`) con contatore | filter-bar.tsx:16-20 | pulsante + Sheet | grafica | no |
| Ricerca per testo `q`; filtro "Visto con" | :25,55 | assenti | funzione | **manca** nel feed |
| "Chi" come chip con avatar; anno come select; soglie 5/4/3 stelle | :34-48 | testo, campo libero, 4,5/4/3 | graf+funz | no |
| Diario diviso in giorni (numero grande, oggi/ieri, mese anno, regola ink animata) | :165-174 | lista piatta | grafica | no |
| Stato vuoto con PauseMark | :153 | Empty generico | grafica | no |

### LogCard
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| Intestazione: avatar, nome (link), "ha visto/ha rivisto", tempo relativo a destra | log-card.tsx:40-53 | autore sotto, data assoluta | grafica | no |
| Poster 104/128px | :39,60 | 64px | grafica | no |
| Meta "Film, 1995, 2 h 7 min, su Prime Video"; generi | :70-71 | anno + Tag tipo | funz+graf | **manca** `runtimeMin`, `genres` |
| Stelle grandi lucide | stars.tsx:4 | glifi 16px | grafica | no |
| Chip "Visto con" | :75-80 | assente | funzione | **manca** `watchedWith` |
| Trama in 2 righe se manca la recensione | :86 | assente | funzione | **manca** `overview` |
| Recensione intera a corpo grande | :91 | troncata a 4 righe | grafica | no |
| Spoiler sfocato, si rivela sul posto | spoiler.tsx:16 | link al thread | funzione | no |
| Reazioni cliccabili nel feed (lucide, conteggio, accento se mie) | reactions.tsx | sola lettura, emoji | funz+graf | no |
| "Commenta / N commenti"; anteprima dell'ultimo commento + "altri N" | :104-125 | testo; anteprima assente | funzione | **manca** `lastComment` |
| Poster segnaposto con il titolo intero | poster.tsx:38 | iniziali | grafica | no |

### Dettaglio log, modifica, form /log
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| Stessa LogCard in testa; indietro al diario | l/page.tsx:41-44 | header diverso, indietro al feed | grafica | no |
| Aggiungi a lista (select) | :63-75 | assente | funzione | no |
| Tempo relativo nei commenti; spoiler sfocato | :87-89 | data assoluta; box | grafica | no |
| Modifica dentro la Cerchia, con poster e titolo | edit/page.tsx:228 | `/log/:id` globale, cercato paginando | funzione | **manca** GET di un singolo log |
| Modalità Visto / Sto guardando | log-form.tsx:138-176 | assente | funzione | no (`PUT /media/:id/progress`) |
| Trama e generi del titolo scelto, skeleton | :112-135 | anno e tipo | funz+graf | no |
| Stelle grandi a mezze, anteprima, "3,5 / 5" | :295-334 | StarInput | grafica | no |
| Dettagli piegati sotto "Aggiungi dettagli"; barra di salvataggio fissa con etichetta parlante | :204-276 | tutto aperto, niente barra | grafica | no |
| Date picker; stagione come select "S1 (10 ep)" | :216; episode-fields | testo | grafica | no |
| Trama scritta dall'utente se manca | :231-236 | assente | funzione | **manca** `LogIn.overview` |
| "Visto con" con chip e avatar (PersonChip); "Chi lo vede" come card radio con icona | :243-262 | chip di testo | grafica | no |
| Link "Importa" | log/page.tsx:291 | assente | funzione | no |

### Pagina titolo (`/c/:id/m/:mediaId`)
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| Dentro la Cerchia | m/page.tsx | `/t/:id` globale | funzione | – |
| Titolo originale; media della Cerchia con stelle e conteggio | :57-69 | assenti | funzione | **manca** |
| "Nella Cerchia": log di tutti i membri | :117-126 | solo i miei | funzione | **manca** filtro `mediaId` |
| Cast a 2 colonne; aggiungi a lista in linea; "scritta da un membro" + TMDB | :86-128 | ridotti | funz+graf | in parte **manca** (source) |

### Persona (`/c/:id/p/:userId`)
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| Indietro ai membri; "Da" mese e anno | p/page.tsx:182-189 | all'hub; data completa | grafica | no |
| 3 cifre separate da linee (visioni, titoli, media); ripartizione per tipo | :225-231 | 2 cifre | funz+graf | **manca** |
| Sta guardando | :217-222 | assente | funzione | **manca** |
| Preferiti prima delle statistiche; amati a scorrimento orizzontale con stelle | :201,239-252 | griglia senza stelle | funz+graf | **manca** il voto |
| Ultimi 5 log come LogCard | :254-262 | solo un pulsante | funzione | no (`feed?person=`) |

---

## C. Serata, Classifica, Insights, Liste, Membri, Notifiche

### Serata: setup
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| Modalità come card radio con spunta e suggerimento | new-serata.tsx:78-95 | Choice segmentato | grafica | no |
| Candidati come griglia di poster 3-4 colonne, badge numerato o "+", bordo accento | :133-154 | righe + Sortable | grafica | no |
| Un'unica raccolta (ricerca, scelti, suggeriti, watchlist) | :55 | 3 schede | funzione | no |
| "Suggerisci" + servizi in comune + servizi per titolo | :57-66,106-149 | assente | funzione | **manca** |
| Pulsante "crea" fisso in basso; TogetherPicks; recenti con tempo relativo | :158; page:48-74 | assenti o diversi | funz+graf | no |

### Serata: stanza
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| Plate con "n/totale" grande + turno + partita | room.tsx:95-110 | testo | grafica | no |
| Timer ad anello SVG "0:SS"; BracketBar | :161-185 | testo + barra; nessuna BracketBar | grafica | no |
| Sfida: poster grandi, "vs" sulla giuntura, tipo e anno, sollevamento | :237-267 | card con bordo 3px | grafica | no |
| Lobby: codice in display dentro un well, condividi primario per l'ospite, navigator.share | :187-235 | codice in accento, Clipboard | grafica | no |
| Rosa e partecipanti a griglia (avatar + quadratino "votato") | :127-153,214-224 | righe con ✓ | grafica | no |
| Tavolo: quadratini-punti, veto barrato | :269-336 | contatore + Chip | grafica | no |

### Serata: risultato e card
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| Poster hero, titolo display, sottotitolo, righe Cerchia + data, modalità, turni, persone | room.tsx:377-388 | poster 168, una riga | grafica | no |
| Condivisione diretta del PNG (Web Share con file) | :350-367 | Sheet con formati | funzione | no |
| "Registra" → form precompilato con media + `with=` | :395-399 | WatchedSheet | funzione | no |
| Ospite: Google + magic link in linea + "unisciti alla Cerchia" | :421-446 | link al sign-in | funzione | **manca** `inviteCode` |
| Pagina `/s/:code/card` con SerataCard chiara, QR, TMDB | card/page.tsx, serata-card.tsx | nessuna route; card scura con QR | funz+graf | no |
| Anteprime OG; join gate con avatar tondi e Wordmark | s/page.tsx:8-25; join-gate.tsx | generiche, quadrati | funz+graf | immagini lato server |

### Classifica
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| Posizione 4.5rem, la n.1 in accento | ranking/page.tsx:133 | testo piccolo | grafica | no |
| Media 2.5rem + meter + numero di voti | :139-148 | Title + Stars | grafica | no |
| Tag persona + voto sempre visibili, il mio in accento | :150-162 | dietro un'espansione | grafica | no |
| Tag "visto ma non votato" | :156 | assente | funzione | **manca** |
| Filtri in linea con contatore; voti minimi da 0 a N, default 2 se ≥3 persone; titolo "Classifica" + BackLink | :39-122 | Sheet; 0/2/3 | funz+graf | no |

### Insights
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| Anni come link a pill; cifre 4-5rem in un well, separate da linee verticali | insights/page.tsx:76-107 | Choice; Title 40 | grafica | no |
| Titolo dell'anno con poster, stelle, votanti; riga per tipo | :111-130 | TitleRow; assente | funz+graf | no |
| "Insieme più spesso" | :129 | assente | funzione | **manca** |
| Coppie di gusto con meter; accordo/disaccordo con le stelle di ognuno | :51-69,144-159 | senza barra; solo media | funz+graf | no |
| "Per te" + credito TMDB; consigli con poster md e stelle previste | :182-218 | assente; poster 52 | funz+graf | c'è `/me/for-you` |

### Liste
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| Tipo "ranking" (numeri, frecce su e giù) | list-card.tsx:79-147 | solo lista e watchlist | funzione | no (core: Ranking) |
| Card in linea con striscia di 8 poster + titoli; "di {proprietario}" | :86-117 | collage da 4 | funz+graf | **manca** il nome proprietario e >4 poster |
| Gestione in linea (aggiungi, rimuovi X, rinomina, cestino con conferma) | :89-170 | pagina dettaglio | grafica | no |
| ListAdd: griglia di poster con spunta | list-add.tsx | TitleSearch | grafica | no |
| Liste della Cerchia e personali separate (`/c/:id/lists`, `/me/lists`, watchlist prima), form di creazione dentro un well | lists/page, me/lists | pagina unica con selettore | grafica | no |

### Membri e impostazioni Cerchia
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| Inviti per primi in un well; codice display grande; "Copia" primario | members/page.tsx:85-141 | dopo i membri | grafica | no |
| Conteggio membri come figura; copertine come celle-glifo | :144,239-249 | Tag; Choice di testo | grafica | no |
| Link a liste, insights, import, account; link legali + TMDB | :256-306 | in parte | funzione | no |
| Toggle notifiche push | push-toggle.tsx | assente | funzione | c'è `/push/key`, `/me/push` |

### Notifiche
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| Lette in automatico all'apertura | notifications/page.tsx:364 | bottoni manuali | funzione | no |
| Tempo relativo a destra; non lette in ink, lette muted; avatar 32; BackLink | :365-390 | data assoluta, testo uguale | grafica | no |

---

## D. Profilo, account, import, admin

### Profilo (`/me`) e modifica
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| Avatar 88px; "N visioni" sotto il nome | me/page.tsx:60-63 | 72px; email | funz+graf | **manca** il conteggio |
| "Modifica" con icona Pencil a tutta larghezza; banner "profilo salvato" | :56,72-74 | secondario senza icona | grafica | no |
| Preferiti: link "Cambia", vuoto cliccabile su well con grana, griglia a 3-5 colonne con titolo | :79-95 | testo; poster 72 senza titolo | funz+graf | no |
| Righe con icone lucide e stile title text-xl; conteggi nel diario | :41-52,99-106 | Row senza icona | funz+graf | **manca** (conteggi) |
| **"Per te"** (consigli, "perché…", "su [servizi]", Registra, skeleton) | :108-116, for-you.tsx | assente | funzione | c'è `/me/for-you`; **manca** il campo servizi |
| Modifica: ordine nome → avatar → bio → generi; galleria avatar a griglia 6/8 colonne; tinta da id | me/edit:181-232; avatar.tsx:41-55 | ordine diverso, celle 40px, paper3 | grafica | no |
| Preferiti come griglia di poster con X; ricerca in linea con TMDB | favorites-editor.tsx | righe + Rimuovi; solo locale | funz+graf | in parte |

### Diario personale (`/me/diary`)
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| Lede; pulsanti Aggiungi, Importa, **Gestisci import** con icone | me/diary:58-71 | niente lede, no Gestisci | funz+graf | no |
| Schede "Tutte (n)" / "Solo private (n)" | :76-79 | assenti | funzione | **manca** |
| Riga con poster 72 e fatti; elimina con cestino e modale (testo diverso se condiviso) | :96-116 | LogCard; ConfirmButton | funz+graf | no |
| Visibilità: icona Users/Lock, chip Cerchie con X, "Aggiungi a…", "Rendi privata", "Apri a tutte" | :119-177 | testo + editor dietro "Cambia" | funz+graf | no |

### Import, gestione import
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| BackLink a /me; avviso "senza copertine"; zona di rilascio tratteggiata | me/import/* | assenti; pulsante | funz+graf | forse un flag |
| Dopo un import privato → `/me/diary?only=private` | client:463 | → /me | funzione | **manca** il filtro |
| Gestione: data e ora, icona Users/Lock, stato "tolto da X" | me/imports:66-75 | solo data | funz+graf | da verificare |
| **"Import vecchi"** (giorni in blocco: nascondi o elimina) | :110-157 | assente | funzione | **manca** |

### Account
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| BackLink, email sotto il titolo | account/page.tsx:64-67 | nome, senza email | grafica | no |
| **"Ha portato N persone" + Fondatore** | :68-73 | assente | funzione | **manca** |
| Card "Modifica profilo" in un well; lingua e tema come select | :76-79; preferences.tsx | assente; Choice | grafica | no |
| **Toggle Web Push** (iOS da installare, bloccato, on/off, errore) | :89-91 | assente | funzione | c'è |
| **Servizi di streaming** (paese, griglia di provider con check, credito TMDB) | :113-151 | solo paese | funzione | c'è `/providers`, `/me/providers` |
| Esci in un plate (quiet); elimina con conferma via **email** dentro `<details>`; link legali in fondo | :160-182 | conferma col nome, ordine diverso | funz+graf | da verificare cosa vuole il server |

### Admin, review
| Elemento | Legacy | Main | Tipo | API |
|---|---|---|---|---|
| /admin/metrics | admin/metrics | `admin/Metrics.tsx` (8 indicatori + totali; server esteso) | funzione | fatto |
| /admin/reports (rimuovi, ignora, chiusi di recente) | admin/reports | `admin/Reports.tsx` | funzione | fatto |
| /review (accesso con password per i revisori degli store) | review/* | `admin/Review.tsx` + `POST /api/review/sign-in` | funzione | fatto |
