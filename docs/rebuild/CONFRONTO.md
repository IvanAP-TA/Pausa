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

## 3–5

Non ancora iniziati in questo ramo. Elenco e stato nelle sezioni successive man mano che li faccio.
