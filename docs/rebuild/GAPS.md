# GAPS — cosa manca rispetto a ciò che un utente si aspetta

Priorità: **blocca l'uso** / **fastidioso** / **rifinitura**. Ogni voce ha la prova (cosa è stato cercato e dove) nel testo. Letto dal codice, non provato a runtime.

# Parte 1 — Cerchie, accesso, account
## 5. Lacune osservate

Priorità: **blocca l'uso** / **fastidioso** / **rifinitura**. Ogni assenza è stata cercata con grep in `src/` e `worker.ts` (termini indicati).

### 5.1 Nessun trasferimento di proprietà, nessun ruolo "proprietario" — fastidioso
Cercato: `transfer`, `ownership`, `owner` in `circles.ts`/azioni → solo `list.ownerId` e testi legali. `circle.createdBy` non dà alcun potere. Qualunque admin può retrocedere o rimuovere il creatore (`setMemberRole`, `removeMember` non guardano il ruolo del bersaglio) ed eliminare la Cerchia. Il passaggio di consegne esiste solo implicito ("promuovi un altro, poi esci").

### 5.2 Una Cerchia può restare senza admin dopo l'eliminazione di un account — blocca l'uso (per quella Cerchia)
Dedotto dal codice, non eseguito: `deleteAccount` (`src/lib/core/account.ts:53`) sistema solo le Cerchie con `createdBy = utente`. Se l'unico admin non è il creatore (il creatore l'ha promosso e poi è uscito o è stato retrocesso), eliminando l'account la sua membership sparisce per cascata e restano solo `member`: nessuno può più invitare, rinominare, promuovere, rimuovere o eliminare, e non c'è un percorso di recupero (né operatore). Il test `content.test.ts:132` copre solo "un membro semplice se ne va".

### 5.3 Rimozione senza esclusione, senza avviso, senza traccia — fastidioso
Cercato: `ban`, `kick`, `block` → niente. `removeMember` cancella solo la riga di membership: la persona rientra con qualsiasi invito attivo (che ogni membro vede e può copiare). Nessuna notifica a chi viene rimosso o retrocesso/promosso (i 6 tipi di notifica non lo prevedono). Nessun registro di chi ha fatto cosa. Le sue righe `log_share` per quella Cerchia non vengono tolte (cercato `logShare` in `circles.ts`: assente), quindi al rientro tornano visibili (dedotto).

### 5.4 Nessun blocco fra utenti, nessun silenziamento di una persona — fastidioso
Cercato: `blockUser`, `user_block`, `blocked`, `mute` → esiste solo `circle_member.muted`, che silenzia **le notifiche di una Cerchia intera**, non una persona. Non c'è modo di non vedere i contenuti di un membro né di impedirgli di commentare o reagire. Un admin non può togliere un commento o un log altrui (solo l'operatore tramite segnalazione).

### 5.5 Moderazione: coda minima, niente per gli admin della Cerchia — fastidioso
- Le segnalazioni arrivano solo agli operatori globali; gli admin della Cerchia non le vedono e non ne sanno nulla.
- Nessun avviso all'operatore quando arriva una segnalazione (nessuna email/push; bisogna aprire `/admin/reports`, a cui nessun link porta).
- La coda non mostra autore, data, link al contenuto, numero di segnalatori; non si possono segnalare **persone**, Cerchie, liste, nomi o bio (`kind` solo `comment | log`).
- Esiti possibili solo `dismissed | removed`; nessuna azione sull'utente (sospensione, avviso), nessun riscontro a chi ha segnalato né all'autore.
- `reportAction` risponde "segnalato" anche quando `createReport` rifiuta (`own`, `not_found`).
- `resolveReportAction` per un non operatore lancia un'eccezione invece del 404 promesso dal commento.

### 5.6 Email dell'account non modificabile — fastidioso
Cercato: `changeEmail`, `change-email`, `updateUser` → niente. La pagina Account mostra l'email in sola lettura. Con accesso solo via link email, chi perde la casella perde l'account (se non ha Google collegato alla stessa email).

### 5.7 Metodi di accesso collegati non visibili né gestibili — rifinitura
Cercato: `listAccounts`, `linkSocial`, `unlinkAccount` → niente. Il collegamento Google avviene da solo a parità di email (`accountLinking`), ma l'utente non vede quali metodi ha, non può collegare un Google con email diversa né scollegarlo.

### 5.8 Sessioni attive non visibili, nessun "esci da tutti i dispositivi" — fastidioso
Cercato: `listSessions`, `revokeSession`, `revokeOtherSessions` → niente. Logout chiude solo la sessione corrente. Le sessioni durano 60 giorni e si rinnovano; shell nativa e browser hanno sessioni separate. `docs/SICUREZZA.md` lo elenca fra i "non fatto" (2FA e controllo dei dispositivi). Una sessione revocata resta valida fino a 5 minuti per la cache nel cookie.

### 5.9 Il logout non scollega le push del dispositivo — fastidioso
`unsubscribePush` è chiamata solo da `push-toggle.tsx:60` (cercato tutte le occorrenze); `LogoutButton` non la chiama. Dopo il logout il dispositivo continua a ricevere le notifiche di quell'account (nomi, titoli, nome della Cerchia) finché un altro account non attiva le push sullo stesso browser (riassegnazione per `endpoint`) o il servizio push risponde 404/410.

### 5.10 Preferenze di notifica: per tipo sì, ma globali — rifinitura
Esistono (contrariamente all'ipotesi): 6 tipi accesi/spenti in `notification_off`, validi insieme per casella e push. Mancano: scelta separata push vs casella; scelta per tipo **per Cerchia** (solo silenzia-tutto); orari di silenzio; frequenza del digest (solo giornaliero alle 17:00 UTC, senza fuso). Silenziare una Cerchia non ferma le reazioni (nessun `circleId`, vedi 3.6).

### 5.11 Casella notifiche grezza — fastidioso
- È sotto l'URL di una Cerchia ma mostra tutte le Cerchie; aprirla segna lette tutte le notifiche di ovunque (`markNotificationsRead` senza filtro).
- Solo le ultime 50, senza paginazione; nessuna cancellazione; le righe non vengono mai potate (nessun `delete(notification)` nel codice).
- Una notifica senza `circleId` (reazione) porta a `/c/<Cerchia corrente>/l/<logId>`: se quel log non è visibile nella Cerchia corrente il link non trova nulla (dedotto).
- Chi non ha Cerchie non ha campanella (`space-switch.tsx:29`).

### 5.12 Messaggio di conferma mai mostrato dopo "togli le mie visioni" — rifinitura (bug)
`members/page.tsx:61`: regex `/^d+$/` invece di `/^\d+$/` → `removedCount` sempre `null`; il blocco di conferma (`removeMineDone`) e l'apertura automatica del `<details>` non scattano mai.

### 5.13 Inviti: gestione parziale — rifinitura
- Gli inviti scaduti/revocati/esauriti non sono visibili a nessuno (nessuno storico); non si vede chi ha creato un invito né chi è entrato con esso (i dati `invite.createdBy` e `invite_use` esistono ma non sono mostrati, salvo il conteggio personale).
- Ogni membro può copiare gli inviti attivi: non esiste "solo gli admin invitano".
- Niente invito diretto a una persona (per email o nome), niente approvazione delle richieste d'ingresso, niente tetto ai membri.
- Nella pagina `/home` il campo codice ha `maxLength=16`: lì il link intero non si può incollare, mentre in `/me/circles` (300) sì; l'azione li accetterebbe entrambi.
- La pagina `/join/<code>` rivela lo stato di un codice a chi non è loggato e senza limite di richieste.

### 5.14 Eliminazioni senza rete — rifinitura
`deleteAccountAction` esce dalla sessione prima di cancellare e non è transazionale: se la cancellazione fallisce a metà l'utente è fuori con dati parziali. Nessuna email di conferma, nessun periodo di ripensamento, nessun avviso ai membri quando una Cerchia viene eliminata o passa di mano. `createCircleWithInvite` fa tre insert non atomici.

### 5.15 Esportazione dati incompleta — rifinitura
Mancano dall'export molti dati personali presenti nello schema (elenco in 2.7): reazioni, dettagli dei log (stagione, episodio, visibilità, spoiler, "visto con"), preferenze, dispositivi push, Serate, segnalazioni fatte, immagine, paese, servizi. Nessuna importazione dello stesso formato.

### 5.16 Lingua e preferenze non legate all'account — rifinitura
La lingua è solo nell'URL; `user.locale` viene scritta soltanto accendendo il digest (`setEmailDigest`) e resta quella anche se poi si cambia lingua (il digest continua nella vecchia). Tema e ultima Cerchia sono cookie del dispositivo. Le push usano la lingua del dispositivo al momento dell'attivazione. I link nelle pagine tecniche cadono su `/it` (`/api/native/*` → `/it/sign-in`; revisione → `/en/...`).

### 5.17 Strumenti operatore minimi — rifinitura
Solo due pagine in sola lettura più "rimuovi/ignora"; nessuna ricerca utenti o Cerchie, nessuna possibilità di nominare un admin in una Cerchia rimasta orfana (5.2), di eliminare un account su richiesta, di vedere il registro del cron. Testi solo in italiano. Elenco operatori solo da variabile d'ambiente.

### 5.18 Accesso — rifinitura
- Dopo "link inviato" non c'è modo di rimandarlo o correggere l'email senza ricaricare la pagina.
- Nessun messaggio distinto quando scatta il limite (5 link / 10 minuti per IP): la form mostra l'errore generico `auth.error`.
- `/api/native/done` rilascia un token anche a una sessione ospite (controlla solo che una sessione esista): dedotto, effetto pratico = la shell entrerebbe come ospite.
- Su iPhone non installato le push non sono attivabili (solo un testo): limite di piattaforma, ma il digest email è l'unico ripiego e va acceso a mano.

# Parte 2 — Diario, liste, profilo
## 5. Lacune osservate

Legenda: **blocca l'uso** / **fastidioso** / **rifinitura**. "Assente" = né schema né UI. "A metà" = esiste un pezzo (schema, server o UI) ma non il resto.

### 5.1 Diario e registrazione

| # | Cosa manca | Stato | Evidenza | Gravità |
|---|---|---|---|---|
| 1 | **Modificare un log privato non condiviso** (voto, recensione, data) | A metà | L'unica pagina di modifica è `/c/[id]/l/[logId]/edit`, che richiede il log visibile in quella Cerchia (`edit/page.tsx:14-16`); `/me/diary` non ha link di modifica (grep `edit` nel file: 0). Per correggerlo bisogna condividerlo, modificarlo, ritirarlo | blocca l'uso |
| 2 | **Leggere la propria recensione nel proprio diario** | A metà | `getMyDiary` seleziona `review` (`data.ts:330`) ma la pagina non la disegna (grep `review`: 0). Per un log privato la recensione scritta non è più visibile da nessuna parte | blocca l'uso |
| 3 | **Registrare senza appartenere a una Cerchia** | Assente | `createLog` esige `circleId` e l'appartenenza (`actions.ts:168-169`); il bottone "Aggiungi" di `/me/diary` appare solo `{home && …}`; senza Cerchie non c'è nemmeno la barra dei tab (`shell.tsx:26`). Resta solo l'import | blocca l'uso |
| 4 | Ricerca e filtri nel **mio** diario (titolo, anno, voto, tipo, genere) | Assente | `me/diary/page.tsx`: solo `only=private` e `before` | fastidioso |
| 5 | Filtri del feed per **genere** e **piattaforma** | Assente | `FeedFilters` (`data.ts:87`) non li ha; grep `genre` in `filter-bar.tsx`: 0. I generi stanno in `media_detail.genres` come JSON, solo per i titoli già aperti | fastidioso |
| 6 | Filtro anno limitato agli ultimi 10; voto minimo solo 3/4/5★; nessun "voto massimo", nessun ordinamento | A metà | `filter-bar.tsx:37,43` | rifinitura |
| 7 | **Data di visione non mostrata** nel feed e nel thread | A metà | `log-card.tsx` non usa `watchedOn`; un log retrodatato appare come "oggi" | fastidioso |
| 8 | Modificare **rewatch** e **privato/Cerchie** dalla pagina di modifica | A metà | `updateLog` non tocca `isRewatch` né `scope`; `isRewatch` scritto solo alla creazione | fastidioso |
| 9 | Rewatch dedotto in automatico ("l'hai già visto il …") | Assente | nessun controllo dei log precedenti in `createLog` | rifinitura |
| 10 | Data futura rifiutata dal server; "oggi" nel fuso dell'utente | A metà | solo `max=oggi` in HTML, calcolato in UTC (`log/page.tsx:28`): tra mezzanotte e l'offset locale la data di oggi non è selezionabile o è ieri | rifinitura |
| 11 | Paginazione dei log sulla **pagina del titolo** | Assente | limite fisso 30 (`m/[mediaId]/page.tsx:35`), nessun "altri" | rifinitura |
| 12 | Scroll infinito | Assente | grep `IntersectionObserver\|infinite`: 0 fuori dalla landing. Feed e diario usano un link "Più vecchi" (pagine da 20 e 40), la classifica Precedente/Successiva (40) | rifinitura |
| 13 | Like/voto senza log, "voglio vederlo" con un tocco dal feed | Assente | l'unico percorso è "Aggiungi a lista" dal thread o dalla pagina del titolo | rifinitura |

### 5.2 Serie, stagioni, episodi

| # | Cosa manca | Stato | Evidenza | Gravità |
|---|---|---|---|---|
| 14 | **Tracciamento episodi** (elenco, spunta, storico) | A metà | ci sono `media_season`, `log.season/episode`, `now_watching`; non c'è alcun elenco episodi né storico: "+1" aggiorna solo un contatore (`progress.ts:41-49`) | fastidioso |
| 15 | **"Continua a guardare"** con più serie | A metà | `now_watching` ha PK `user_id`: una sola serie alla volta; iniziarne un'altra sovrascrive | fastidioso |
| 16 | Prossimo episodio in uscita, date, titoli degli episodi | Assente | AniList `nextAiringEpisode` è letto solo per stimare il totale (`episodes.ts:27-33`) | rifinitura |
| 17 | Registrare un episodio **non** deve spegnere "sto guardando" | Difetto | `actions.ts:192` cancella lo stato a ogni log di quel titolo | fastidioso |
| 18 | Voto di episodio/stagione separato dal voto della serie | Difetto | `latestRatings` indicizza per `media_id` (3.4): un 2★ a un episodio diventa il voto della serie in classifica e nei consigli | fastidioso |
| 19 | Ore viste per serie/anime | Assente | `movieHours` conta solo i film perché `runtime_min` delle serie è per episodio | rifinitura |

### 5.3 Dove guardarlo

| # | Cosa manca | Stato | Evidenza | Gravità |
|---|---|---|---|---|
| 20 | **"Dove guardarlo" sulla pagina del titolo** | A metà | tabelle `media_provider`/`user_provider` e `ensureAvailability` esistono, ma sono usate solo in `discover.ts` (grep degli usi: nessuna pagina del titolo, card o lista) | fastidioso |
| 21 | Noleggio/acquisto/gratis, link al servizio, loghi | A metà | solo `flatrate`; `logo_path` salvato e mai mostrato | rifinitura |
| 22 | Piattaforma del log scelta dai servizi reali | A metà | `log.platform` è testo libero; filtro per piattaforma assente | rifinitura |

### 5.4 Liste e watchlist

| # | Cosa manca | Stato | Evidenza | Gravità |
|---|---|---|---|---|
| 23 | **Note per titolo** | A metà | colonna `list_item.note` (`schema.ts:307`), mai scritta né letta (grep) | rifinitura |
| 24 | **Descrizione della lista** | A metà | `list.description` mostrata (`list-card.tsx:45`) ma scrivibile solo dall'import Letterboxd (`core/import.ts:296`); nessun campo nei form | rifinitura |
| 25 | Riordino di liste non "classifica"; trascinamento | A metà | il server sposta qualunque lista; la UI mostra le frecce solo per `ranking` e solo un passo alla volta | fastidioso |
| 26 | Aprire un titolo da una lista / registrarlo / vedere chi l'ha aggiunto | A metà | poster non cliccabili in `ListCard`; `added_by`, `added_at` salvati e mai mostrati | fastidioso |
| 27 | Pagina di dettaglio lista, ricerca dentro la lista, oltre 8 poster | Assente | solo striscia dei primi 8 + elenco di testo in "Gestisci" | fastidioso |
| 28 | Condividere, duplicare, copertina, lista collaborativa a inviti | Assente | grep `duplicate\|collaborat\|share` nelle azioni liste: 0. Le liste di gruppo sono modificabili da ogni membro; le personali non si possono mostrare a nessuno né spostare in una Cerchia | rifinitura |
| 29 | **Priorità** in watchlist | Assente | nessun campo; una watchlist è una lista con un'etichetta diversa | rifinitura |
| 30 | Togliere dalla watchlist quando registro il titolo; segno "già visto" | Assente | `createLog` non tocca `list_item` | fastidioso |
| 31 | Watchlist predefinita e "aggiungi alla watchlist" con un tocco | Assente | va creata a mano; l'aggiunta passa sempre da un menu a tendina | fastidioso |
| 32 | Limiti anti-abuso sulle liste | Assente | nessuna voce in `LIMITS` per liste | rifinitura |

### 5.5 Commenti e sociale

| # | Cosa manca | Stato | Evidenza | Gravità |
|---|---|---|---|---|
| 33 | **Risposte ai commenti** (thread annidati) | Assente | `comment` non ha `parent_id`; grep `parentId\|replyTo`: 0 | rifinitura |
| 34 | **Menzioni** | Assente | grep `mention`: 0 | rifinitura |
| 35 | Reazioni ai commenti; "modificato"; conferma prima di eliminare un commento | Assente | `reaction` è solo per log; `comment` senza `updated_at`; bottone di eliminazione diretto | rifinitura |
| 36 | Conferma dopo una segnalazione | A metà | l'azione aggiunge `?reported=1` ma nessuna pagina lo legge; segnalare il proprio contenuto fallisce in silenzio; nessun avviso agli operatori | fastidioso |
| 37 | **"Chi l'ha visto / chi no"** sulla pagina del titolo | A metà | il dato c'è in classifica (tag per persona) e nei consigli (`unseenBy`), non sulla pagina del titolo, che elenca solo i log | rifinitura |
| 38 | **Attività recente** (chi ha commentato/reagito/aggiunto a una lista) | A metà | il feed contiene solo log; il resto arriva come notifiche personali; aggiunte alle liste e condivisioni non generano nulla | rifinitura |
| 39 | Notifica nelle altre mie Cerchie quando registro | Difetto | `createLog` avvisa solo la Cerchia di partenza (2.1) | fastidioso |
| 40 | Thread separati per Cerchia | Difetto | commenti/reazioni/"visto con" condivisi tra Cerchie (3.1) | fastidioso (riservatezza) |

### 5.6 Classifica, profilo, statistiche

| # | Cosa manca | Stato | Evidenza | Gravità |
|---|---|---|---|---|
| 41 | Filtri classifica per **genere**, **piattaforma**, **anno di visione**, intervallo di voto | Assente | `RankFilters` (`ranking.ts:11-24`) | rifinitura |
| 42 | Titoli cliccabili in classifica | A metà | nessun `Link` nelle righe di `ranking/page.tsx` (ci sono nella colonna laterale) | fastidioso |
| 43 | Media coerente tra pagina del titolo e classifica | Difetto | due formule diverse (1.5) | rifinitura |
| 44 | **Profilo pubblico** o profilo fuori dalla Cerchia | Assente | nessuna route di profilo oltre `/c/[id]/p/[userId]` e `/me` | rifinitura (scelta di prodotto: l'app è privata) |
| 45 | **Statistiche personali** (ore, generi, voti, anno in rassegna personale) | Assente | `/me` mostra solo il numero di visioni; tutto il resto è per Cerchia e limitato ai log visibili lì | fastidioso |
| 46 | Statistiche per generi, distribuzione dei voti, registi/attori | Assente | i generi sono solo testo in `media_detail`; nessun aggregato | rifinitura |
| 47 | **Traguardi / badge / serie di giorni** | Assente | grep `achievement\|badge\|streak`: solo "Fondatore" per gli inviti (`core/circles.ts:194`, altra area) | rifinitura |
| 48 | Riordinare i preferiti; preferiti cliccabili in `/me`; più di 5; upload foto | A metà | `favorite.position` esiste ma si aggiunge solo in coda; in `/me` i poster non sono link | rifinitura |
| 49 | Card dell'anno personale; anteprima della card prima di condividere | Assente | solo card di Cerchia, generata al tocco | rifinitura |

### 5.7 Raccomandazioni

| # | Cosa manca | Stato | Evidenza | Gravità |
|---|---|---|---|---|
| 50 | "Non mi interessa" / "già visto" / "in watchlist" su un consiglio | Assente | `ForYou` offre solo "Registra"; i consigli di gruppo solo il link al titolo | rifinitura |
| 51 | Consigli per chi usa solo anime AniList, o senza token TMDB | A metà | i semi richiedono `tmdb_id`; senza token la sezione è spenta | rifinitura |
| 52 | Consigli di gruppo che pescano fuori da ciò che la Cerchia ha già visto | Per scelta | il motore usa solo i log della Cerchia: con pochi dati la sezione resta vuota | rifinitura |

### 5.8 Stati vuoto / errore / caricamento

| Schermata | Vuoto | Caricamento | Errore |
|---|---|---|---|
| Feed | sì (3 varianti) | skeleton `loading.tsx` | pagina d'errore generica |
| Registra | "nessun risultato", "ricerca…", TMDB spento | skeleton della sinossi | errore di validazione = **eccezione** → pagina d'errore generica; nessun messaggio sul campo |
| Thread | "nessun commento" | skeleton del feed (forma sbagliata) | generica; log non visibile → 404 |
| Modifica log | — | skeleton del feed | generica |
| Titolo | "nessuna sinossi", "nessuno l'ha ancora visto" | skeleton del feed | generica |
| Liste (Cerchia) | sì | skeleton del feed | generica |
| Classifica | sì (2 varianti) | skeleton del feed | generica |
| Insights | anno vuoto, consigli vuoti; "Per te" con testo di attesa | skeleton del feed | card dell'anno: messaggio "non riuscito" |
| Profilo membro | "nessuna visione" | skeleton del feed | generica |
| Colonna laterale | sì | skeleton | **errore ingoiato**: resta lo skeleton per sempre |
| `/me`, `/me/diary`, `/me/lists`, `/me/edit` | sì (diario, liste, preferiti) | **nessun `loading.tsx`**; solo "Per te" ha uno skeleton | generica |

Osservazioni trasversali:
- **Un solo `loading.tsx`** (a forma di diario) per tutte le pagine della Cerchia e **nessuno** per `/me/*`: fastidioso.
- **Un solo `error.tsx`** per tutta l'app: ogni azione che lancia (`throw new Error("Not allowed")`, parse Zod fallito, FK violata) finisce lì, senza dire cosa correggere: fastidioso.
- Superare un limite orario porta a `/slow-down`; per la ricerca restituisce un elenco vuoto, indistinguibile da "nessun risultato": rifinitura.
- Azioni che chiamano TMDB/AniList senza limite: `getEpisodeLimits`, `getTitleDetail`, apertura della pagina del titolo: rifinitura (costo).

### 5.9 Riepilogo "a metà" (schema o server presenti, UI mancante)

`list_item.note`; `list.description`; `list_item.added_by/added_at`; `favorite.position` (riordino); `media_provider`/`user_provider` sulla pagina del titolo; `*.logo_path`; `media_entity.imdb_id`; `log.is_rewatch` e `log.scope` in modifica; `log.review` nel diario personale; riordino delle liste non-classifica; `?reported=1`.

# Parte 3a — Serata
## A.5 Lacune osservate

| # | Lacuna | Evidenza | Priorità |
|---|---|---|---|
| A1 | Host che se ne va in `lobby`: nessuno può avviare, nessun passaggio di ruolo, nessun annullamento. | `startSerata` richiede `hostId === user.id` (`actions.ts:95`); grep `leave\|kick\|transfer` in `src/lib/serata` e `src/app/[locale]/s`: nessun risultato. | blocca l'uso |
| A2 | Nessun timer server: se tutti chiudono/nascondono la pagina la votazione non scade mai. | Scadenza applicata solo da `tick`/voti (`room.tsx:80`, `server.ts:88`); nessun cron sulle Serate. | fastidioso |
| A3 | Voto accettato dopo la scadenza. | `voteBracket`/`submitBallot` non confrontano `deadline` prima di scrivere. | rifinitura |
| A4 | Ripetere una Serata (stessi candidati / "rivincita"): assente. | grep `rematch\|again\|repeat` nelle cartelle Serata: nessun risultato (solo `again` nella demo landing). | fastidioso |
| A5 | Storico: solo ultime 10, senza paginazione né dettaglio; Serate abbandonate restano "In attesa"/"Si sta votando" per sempre. | `getRecentSerate` `limit = 10`; nessuna pulizia su `serata`. | fastidioso |
| A6 | Pareggi: estrazione casuale silenziosa, non riproducibile, non dichiarata in UI; tabellone e conteggi delle sfide non mostrati. | `Math.random()` in `server.ts:97,102`; `RoomView` non espone `state`. | rifinitura |
| A7 | Tempo limite fisso (30 s / 60 s), non configurabile; il timer mostra "0:60". | Costanti `MATCH_MS`, `TABLE_MS`; `Timer` formatta `0:${s}`. | rifinitura |
| A8 | Notifica all'apertura: esiste (riga `notification` + push), ma la voce in-app porta alla home della Cerchia, non alla stanza: `notification` non ha né `serata_id` né codice. | `src/app/[locale]/c/[circleId]/notifications/page.tsx:46` (`href` solo da `logId`/`circleId`); schema `notification`. | fastidioso |
| A9 | "L'abbiamo visto": solo link precompilato al form diario, visibile a chi è partecipante; nessun legame `log`↔`serata`, nessun promemoria. | `room.tsx:394-398`; nessuna FK nello schema. | fastidioso |
| A10 | Riconnessione: errori di rete e 401/403/404 del poll ignorati in silenzio; nessun indicatore offline; un ospite che perde il cookie diventa un'altra persona e il vecchio posto blocca il quorum. | `room.tsx:28-35` (`if (res.status !== 200) return`). | fastidioso |
| A11 | Nessun "esci" / "rimuovi": chi abbandona tiene in ostaggio il quorum fino a scadenza o "Avanti". | Nessuna azione di uscita; quorum su `participants.length`. | fastidioso |
| A12 | Ingresso a votazione in corso ammesso e senza limiti di numero; chiunque abbia il codice entra e vota, anche estraneo alla Cerchia. | `joinSerata` blocca solo `done`. | rifinitura (decisione di prodotto da confermare) |
| A13 | Membro non loggato trattato come ospite, senza link "accedi". | `join-gate.tsx` (nessun ramo sign-in). | rifinitura |
| A14 | Endpoint PNG pubblici senza rate limit; codice senza retry su collisione; argomenti delle action non validati con zod (`dots = null` → eccezione). | `card/route.tsx`, `invite/route.tsx`, `actions.ts:24,126`. | rifinitura |
| A15 | "N persone" sulla Card cambia nel tempo (conteggio live dei partecipanti, ospiti cancellati dopo 30 giorni) e conta anche chi non ha votato. | `server.ts:224`, `cleanup.ts`. | rifinitura |

---

# AREA B — IMPORTAZIONE


# Parte 3b — Importazione
## B.5 Lacune osservate

| # | Lacuna | Evidenza | Priorità |
|---|---|---|---|
| B1 | Import AniList e MAL-per-username probabilmente bloccati in produzione dalla CSP: `connect-src 'self' https://cloudflareinsights.com` non include `graphql.anilist.co` né `api.jikan.moe`, chiamati dal browser. L'errore mostrato sarebbe il generico "Non riesco a leggere questo file". Da verificare a runtime (analisi solo statica). | `next.config.ts:30` vs `import-client.tsx:106,124`; nessun middleware/proxy che cambi l'header. | blocca l'uso (se confermato) |
| B2 | Import non riprendibile: nessuno stato sul server, si riparte dalla riga 0 e ogni chunk già fatto consuma comunque un colpo del limite. Oltre ~12 000 righe (film) l'import non può mai finire: ogni rilancio brucia le 600 chiamate sulle righe già importate. | `import_batch` senza colonne di stato; `allow("importRows")` a ogni chunk; `LIMITS.importRows`. | fastidioso (blocca l'uso per storici molto grandi) |
| B3 | Nessun modo di fermare un import in corso. | `stop.current` mai impostato a `true` (`import-client.tsx:153,209,224,248,250`). | fastidioso |
| B4 | Report dei fallimenti parziali: solo un conteggio "N righe non importate", senza elenco di quali; i titoli non trovati su TMDB entrano comunque (senza copertina) senza segnalazione. | `Totals.failed`; `enrichMovies` restituisce la riga invariata. | fastidioso |
| B5 | Una riga non valida per zod fa fallire l'intero chunk (20–30 righe), con retry inutile; tre chunk così di fila fermano tutto con il messaggio "controlla la connessione". Casi plausibili: recensione > 20 000 caratteri, titolo > 300 (Letterboxd/MAL/AniList non tagliano), URI Letterboxd non `boxd.it`, anno < 1870. | `payload.safeParse` → `invalid` (`actions.ts:89-90`); parser senza `slice`. | fastidioso |
| B6 | Duplicati al reimport delle righe senza data: con "importa comunque con la data di oggi" la chiave è (titolo, oggi), quindi rilanciare in un giorno diverso crea una seconda visione. | `import.ts:205-207` + chiave `mediaId|watchedOn`. | fastidioso |
| B7 | Reimport non aggiorna: voto o recensione cambiati alla sorgente non vengono propagati (la visione è "già presente"). Trakt: una nuova visione dello stesso titolo sposta la data → nuova riga, la vecchia resta. | `alreadyHad` senza update. | rifinitura |
| B8 | Export in formati standard assente: solo `GET /api/account/export` (JSON proprietario GDPR, senza id TMDB/IMDb, niente CSV compatibile Letterboxd/IMDb). | `src/app/api/account/export/route.ts`, `src/lib/core/account.ts:15-44`. | fastidioso |
| B9 | Watchlist IMDb e Trakt non diventano watchlist: quella IMDb entra come visioni senza data (o "viste oggi"), quella Trakt è ignorata. | `imdbRows` (nessun ramo lista), `traktJsonRows:398`. | fastidioso |
| B10 | Solo "completati" per gli anime; rewatch AniList (`repeat`) e MAL (`my_times_watched`) persi; nessun progresso episodi; Trakt/Cinemaniac schiacciano una serie in una sola visione. | `import-parsers.ts:207,275,196`. | rifinitura |
| B11 | Endpoint Jikan `users/{u}/animelist`: da verificare che esista ancora nella v4 (dipendenza esterna non testata; 400/404 vengono mostrati come "utente non trovato"). | `import-client.tsx:106,110`. | fastidioso (da verificare) |
| B12 | Titoli localizzati salvati in una sola lingua (quella dell'utente al momento dell'import) per film/serie; per gli anime il titolo inglese è copiato in tutte e tre. | `enrich.ts:69`, `import-parsers.ts:254`. | rifinitura |
| B13 | Batch vuoti mai puliti; `removeImportFromCircle` non transazionale; i titoli creati da un import eliminato restano orfani. | `import-batches.ts`. | rifinitura |
| B14 | Diario Letterboxd senza colonna `Rewatch`, o watchlist sciolta rinominata: errore generico / import come visioni. | `import-parsers.ts:117,130`; `classify` in `import-client.tsx:25-37`. | rifinitura |

---

# 6. Costo computazionale (budget 10 ms CPU per richiesta)

Premessa: il tempo di attesa su D1 e sulle fetch esterne non è CPU, ma ogni round trip costa serializzazione, e il piano free ha anche un tetto di sotto-richieste/query per invocazione (il codice assume ~50, vedi commenti in `src/db/index.ts:24` e `import.test.ts:192`). I conteggi sotto vengono dalla lettura del codice, non da misure.


# Parte 4 — Pubblico, PWA, nativo, CI
## 8. Stato e mancanze

### 8.1 Dichiarate nei documenti

`docs/COSA_MANCA.md` (stato al 17 nov 2026; "sviluppo concluso"):
- Chi mette online: account e piano Cloudflare, D1, dominio, segreti, prime verifiche, **prove su telefono vero**, Search Console e Bing, backup D1, Web Analytics. Spuntato solo Google OAuth.
- Proprietario: **revisione legale** di privacy e termini (bozza mai vista da un legale), titolare del trattamento e contatto, accordi sul trattamento dati, licenza TMDB se ci sono ricavi, `LICENSE` segnaposto, età minima (i termini dicono 14 anni, nessun controllo), cartella `pausa/` e branch `giuseppe_branch` da sistemare, lancio.
- App nativa: firma del codice desktop; Android: release firmata, prova su telefono, account Play; iOS; schede store, **link profondi per aprire le Serate nell'app**, aggiornamenti automatici, **notifiche native**; pulsante di download diretto sulla landing (oggi "Scarica l'app" installa la PWA).
- Poi: Durable Objects per la Serata (oggi polling a 1,5s), CSP con nonce, medie calcolate in SQL per gruppi grandi, altre guide SEO, verifica dal vivo dell'import MyAnimeList (Jikan).

`docs/PIANO_CONSEGNA.md`: "Stato: eseguito", resta come storia delle decisioni.

`README.md`: "First deploy (not done yet)" (ma `wrangler.jsonc` ha un id di database vero e la rotta del dominio); nativo "compiled but not yet tried on a real phone or PC"; non fatti: push native, firma, AAB/APK di release, store, iOS; import: non fatti MAL "plan to watch" e profili AniList privati; l'audit SEO del 21 nov 2026 e il suo piano d'azione sono **fuori dal repository** (`Desktop\Pausa-seo`).

`docs/DEPLOY.md` (dall'audit SEO): Bot Fight Mode da spegnere (PageSpeed/Lighthouse ricevono 403), "Always Use HTTPS" da accendere (`http://pausa.gnagno.org` risponde 200), decisione sui crawler di addestramento, Search Console e Bing.

`docs/PHONE_TEST.md`: tutte le caselle sono vuote (11 prove fra rete di casa e sito vero).

`docs/SICUREZZA.md`: non fatti CSP con nonce, test di intrusione e scansione dipendenze, 2FA, rate limit per IP sulle azioni.

### 8.2 Notate leggendo il codice (lato pubblico, PWA, accessibilità, consegna)

Dalla sola lettura del codice non ho trovato nulla, su questo lato, che da solo impedisca l'uso: nessuna voce è classificata `blocca l'uso`. Le verifiche su sito vero restano da fare.

| # | Mancanza | Evidenza | Priorità |
|---|---|---|---|
| M1 | **Titolare e contatto probabilmente assenti da privacy e termini in produzione.** Le due pagine sono prerenderizzate in build, e `LegalPage` legge `process.env.CONTACT_EMAIL` / `LEGAL_ENTITY` in quel momento; il workflow di deploy passa alla build solo token Cloudflare, account id, chiave VAPID pubblica e `NEXT_PUBLIC_SITE_URL`. I due valori vivono come variabili/segreti del Worker, che la build non vede. **[da verificare sull'HTML del sito]** | `src/components/legal-page.tsx`, `src/lib/legal.ts` r.12-13, `.github/workflows/deploy.yml` | `fastidioso` (per il lancio è un obbligo legale) |
| M2 | Stesso meccanismo per il contatore visite: `NEXT_PUBLIC_CF_ANALYTICS_TOKEN` è di build ma il workflow non lo passa, quindi il beacon non viene emesso dai deploy automatici | `src/app/[locale]/layout.tsx`, `deploy.yml` | `rifinitura` |
| M3 | **Guide e pagine legali senza selettore di lingua, senza footer, senza link a privacy/termini.** Solo la landing ha il selettore. L'e2e "the language switch keeps you on the page" fa due `goto` e non prova nessun controllo | `guide/page.tsx`, `guide/[slug]/page.tsx`, `legal-page.tsx`, `e2e/journeys.spec.ts` | `fastidioso` |
| M4 | **Il guscio nativo apre sempre `https://pausa.gnagno.org/it`**: lingua forzata all'italiano e atterraggio sulla landing, poi `SignedInRedirect` chiama `/api/auth/get-session` e sposta su `/it/home`. Non usa `/?app=1` | `src-tauri/tauri.conf.json`, `signed-in-redirect.tsx` | `fastidioso` |
| M5 | **Blocco di firma Android assente** nella copia attuale di `build.gradle.kts` (il README dice che va riaggiunto dopo `tauri android init`); esiste solo un APK debug arm64 | `src-tauri/gen/android/app/build.gradle.kts`, `…/outputs/apk/arm64/debug/` | `fastidioso` (blocca solo la pubblicazione) |
| M6 | **Anteprime su X delle Serate**: `robots.ts` vieta `/api/` (tranne `/api/og/`) e `/*/s/`; le immagini d'invito e della card stanno in `/api/serata/…`. Il commento nello stesso file dice che il crawler di X segue `robots.txt` | `src/app/robots.ts`, `s/[code]/page.tsx` | `rifinitura` |
| M7 | `public/offline.html` ha **colori vecchi** (ambra `oklch(73% 0.15 58)` su `oklch(12.5% 0.008 55)`, chiaro con accento `oklch(50% 0.2 30)`), non la colorway attuale; segue il tema di sistema e non il cookie | `public/offline.html` contro `tokens.css` | `rifinitura` |
| M8 | `src-tauri/shell/index.html` ha una palette estranea (`#f2eee5`, `#0d1220`, pulsante `#c9361f` con `border-radius: 999px`), contro le regole di `DESIGN.md`, e non risulta mai caricata | `src-tauri/shell/index.html` | `rifinitura` |
| M9 | `/{l}/sign-in` e `/{l}/join/{code}` senza titolo né descrizione propri (titolo "Pausa") e senza meta `noindex` (solo `robots.txt`) | assenza di `metadata` nei due `page.tsx` | `rifinitura` |
| M10 | Open Graph incompleto: nessun `og:url` su nessuna pagina; `og:locale` solo sulla landing; privacy e termini senza `og:title`/`og:description`; indice guide senza blocco `twitter`; nessun `twitter-image` | i `generateMetadata` delle pagine pubbliche | `rifinitura` |
| M11 | `isoDateTime()` scrive sempre `+01:00`: sbagliato per date in ora legale | `src/lib/jsonld.ts` | `rifinitura` |
| M12 | `theme-color` fisso a `#001113` anche con tema chiaro (la barra del browser resta scura su pagina crema) | `layout.tsx` (`viewport`), `THEME_COLOR.light` definito ma non usato lì | `rifinitura` |
| M13 | Manifest: `description` solo italiana, mancano `id`, `lang`, `screenshots`, `shortcuts`; `orientation: portrait` anche su tablet e desktop | `src/app/manifest.ts` | `rifinitura` |
| M14 | Splash iOS solo verticali e solo 10 misure; la tabella attribuisce 393×852 anche ai "16 Pro" e 430×932 ai "16 Pro Max", che hanno schermi diversi, quindi quei modelli restano senza splash **[da verificare con le misure Apple]** | `src/lib/splash.ts` | `rifinitura` |
| M15 | Nessuna capacità offline oltre la pagina di cortesia (scelta dichiarata) | `public/sw.js` | `rifinitura` |
| M16 | Accessibilità: axe gira solo a viewport desktop e solo su `/it/…` per guide, legali e sign-in; il progetto `phone` ha 1 test e non gira in CI; la stanza della Serata e la card pubblica non sono controllate | `e2e/accessibility.spec.ts`, `playwright.config.ts`, `ci.yml` | `fastidioso` |
| M17 | `/api/native/done` risponde sempre con `<html lang="en">` anche quando il testo è italiano o spagnolo | `src/app/api/native/done/route.ts` | `rifinitura` |
| M18 | Icona adattiva Android con sfondo `#FFFFFF` (marchio scuro su bianco) | `src-tauri/icons/android/values/ic_launcher_background.xml` | `rifinitura` |
| M19 | Nessun `not-found.tsx` alla radice: il layout radice restituisce solo `children`, e un prefisso di lingua non valido chiama `notFound()` prima che esista un `<html>`; pagina 404 risultante non determinabile dal codice **[da verificare]** | `src/app/layout.tsx`, `src/app/[locale]/layout.tsx` | `rifinitura` |
| M20 | Possibile fallimento dell'e2e n.10 in CI: `.env.example` contiene `ADMIN_EMAILS=` (stringa vuota) e `isOperator` usa `??`, che non scatta su stringa vuota; in quel caso Giulia non sarebbe operatore **[da verificare con un run]** | `src/lib/operator.ts`, `.env.example`, `ci.yml` | `rifinitura` |
| M21 | Il deploy parte a ogni push su `main` senza aspettare lint ed e2e, e applica le migrazioni al database vero prima di sapere se la build riesce | `deploy.yml` | `fastidioso` |
| M22 | Versioni non allineate: `tauri.conf.json` 0.1.3, `Cargo.toml` 0.1.0, `package.json` 0.1.0 | i tre file | `rifinitura` |

### 8.2b Stato del lato client dopo la ricostruzione (2026-11-25, `apps/mobile`, dettagli in `A11Y.md`)

Chiuse nel client Expo, con test: **M3** (selettore lingua e footer su guide e legali: già presenti, ora coperti da `seo.spec.ts`), **M7** (`offline.html` rigenerata con i token attuali), **M9** (titolo di ogni schermata privata dall'`<h1>`; `noindex` già presente), **M10** (`og:url`/`og:locale` già presenti; aggiunti `og:locale:alternate`, `og:image` e `twitter:image` assoluti; il build fallisce se mancano), **M12** (`theme-color` segue il tema nella shell; le pagine pubbliche sono sempre scure), **M13** (manifest per lingua con `id`, `lang`, descrizione, scorciatoie, `orientation: any`), **M15** (service worker con shell offline e coda del diario), **M16** (axe su tutte le schermate, due larghezze, due temi, stati; tastiera; albero), **B1** (la CSP del client ammette `graphql.anilist.co` e `api.jikan.moe` per l'import dal browser).
Non chiuse: **M1/M2** (titolare, contatto, token: servono valori reali al build), **M13 `screenshots`** (servono catture vere), **M14** (splash iOS: misure Apple), **M4/M5/M8/M18/M22** (guscio Tauri, vecchio), **M6**, **M11**, **M17**, **M19**, **M20**, **M21** (non sono del client Expo o non cambiati). Resta da provare in deploy: che `_headers` valga anche per le rotte private servite dal Worker.

### 8.3 Documenti che non corrispondono più al codice

- `COSA_MANCA.md`: "235 test sulla logica, 43 test end-to-end, audit axe 32 controlli". Oggi: 286 dichiarazioni unitarie, 57 test Playwright, 44 controlli axe.
- `docs/DEPLOY.md` §2c: il deploy "si avvia a mano" e "usa l'environment production". Il file parte anche a ogni push su `main` e non dichiara `environment`.
- `README.md`: seed "4 friends, 6 logs, 2 lists" (sono 40 log e 3 liste); "Five sources" di importazione (i messaggi e l'ultimo commit includono una sesta, Cinemaniac); "Gruppone: 11 people, 700 titles, 3300 logs" (lo script dice 10 utenti + Giulia, 300 log a testa).
- `DESIGN.md`: il blocco "Tokens" ha i valori ambra vecchi; `design/tokens.css` nel commento parla ancora di "amber colourway".
- `docs/ARCHITETTURA.md` punto 9: "token in `src/app/globals.css`" (stanno in `tokens.css`).
- `src/lib/theme.ts`: il commento dice che il cookie fa renderizzare il tema dal server; il layout dice il contrario (lo applica lo script inline, per restare statico).

---

