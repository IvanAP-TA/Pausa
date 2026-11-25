# Costo computazionale osservato (input per BUDGET.md)

## Serata — query D1 per richiesta

| Operazione | Query D1 | Note |
|---|---|---|
| Poll, nulla cambiato (204) | 1 (`getPollHead`) | + lookup sessione Better Auth solo quando la cookie cache di 5 min è scaduta. È il caso dominante: ogni partecipante, ogni 1,5 s. |
| Poll, versione cambiata, `lobby` | 4 | `getPollHead` + `getSerataByCode` + candidati + partecipanti. |
| Poll, cambiata, `voting` | 5 | + voti della sfida o tutte le schede. |
| Poll, cambiata, `done` | 6 (4 senza Cerchia) | + `circle` + tutti gli inviti della Cerchia (`listInvites`). |
| `voteBracket` | 6–7 round trip (8–9 statement) | serata, partecipante, batch (delete+insert+bump), poi `tryClose`: serata, partecipanti, voti, eventuale update. |
| `submitBallot` | 7–9 round trip | come sopra + candidati (letti due volte se chiude). |
| `tick` | 5–7 | |
| `joinSerata` | 2 round trip (2–3 statement) | |
| `createSerata` | ~9 | 2 rate limit, membership, membri, 3 di `filterRecipients`, 1 batch; poi push in `waitUntil` (3 query + 1 fetch per sottoscrizione). |
| Pagina `/s/[code]` (SSR) | 6–8 | `getSerataByCode` chiamato 3 volte (metadata, pagina, `getRoomView`). |
| Pagina `/s/[code]/card` | 8 (6 senza Cerchia) | `getCardData` due volte. |

Carico di fondo: N partecipanti × 40 richieste/minuto ciascuno. Ogni voto incrementa `version`, quindi in una sfida con N persone ogni client può rifare fino a N fetch completi (5 query) in pochi secondi.

## Serata — operazioni pesanti in CPU

- PNG Card e invito (`ImageResponse`): layout Satori + rasterizzazione resvg (WASM) di un'immagine 1080×1920 con una locandina JPEG da decodificare e ridimensionare, parsing di 2–3 font TTF, codifica PNG. È con ogni probabilità l'operazione più lontana dai 10 ms di tutta l'area (non misurata). In più 4–6 fetch a Google Fonts e 1–4 fetch di locandine per richiesta, senza cache applicativa (solo `Cache-Control` 3600 s / 300 s). L'endpoint è pubblico e senza rate limit.
- QR: generazione matrice + path SVG in JS puro; piccolo ma non nullo (story e pagina Card).
- Web Push in `createSerata`: per ogni dispositivo destinatario firma VAPID (ECDSA P-256) + ECDH + AES-GCM (`buildPushPayload`), dentro la stessa invocazione via `waitUntil`. Cresce linearmente con membri × dispositivi.
- `suggestRosterAction`: carica tutti i fatti della Cerchia, cicli O(titoli × log) per `seenBy` (`discover.ts:61`), motore di raccomandazione WASM, più chiamate TMDB.
- Motore di voto (`closeMatch`, `closeTable`, `structuredClone` dello stato): trascurabile (≤ 8 titoli).

## Import — un chunk (`importChunk`)

Conteggio per il caso tipico "20 film Letterboxd tutti nuovi, destinazione privata":

| Passo | Query D1 |
|---|---|
| `allow("importRows")` (upsert + select) | 2 |
| `getImportBatch` | 1 |
| `findExisting` n.1 (URI + titoli) | 2 |
| `findExisting` n.2 dopo arricchimento (URI + TMDB + titoli in 2 gruppi) | 4 |
| insert `media_entity` (gruppi di 7) | 3 |
| verifica presenza | 1 |
| insert `media_title` | 1 |
| log esistenti | 1 |
| insert `log` (gruppi di 8) | 3 |
| **Totale** | **18** (+1–2 se la destinazione è una Cerchia) |

Più 20 chiamate TMDB (40 nel caso IMDb con `find` vuoto + ricerca). Totale sotto-richieste: ~38–60 per invocazione, cioè a cavallo o oltre il tetto di 50 che il codice stesso assume.

- Chunk anime da 30 tutti nuovi: ~24 query D1 + 1–2 chiamate AniList.
- Caso peggiore fissato dai test (30 film nuovi con 3 titoli localizzati): ≤ 45 query, ≤ 100 parametri per statement.
- Caso non coperto dai test: chunk di titoli già noti a cui manca un id sorgente → un `UPDATE media_entity` per titolo, in sequenza (`import.ts:181-183`): fino a 30 query in più.
- CPU nel chunk: validazione zod di 30 righe (recensioni fino a 20 000 caratteri), normalizzazione Unicode NFKD dei titoli, mappe in memoria, 30–60 `crypto.randomUUID()`, parsing JSON di 20–40 risposte TMDB. Probabilmente oltre 10 ms nei chunk pieni (non misurato).
- `importListChunk`: come sopra senza i `log`, più 1–2 query per trovare/creare la lista e 1–2 insert `list_item`.

## Import — altre operazioni

- Parsing dei file: tutto nel browser (CSV carattere per carattere, regex sull'XML MAL, `JSON.parse`, unzip/gunzip sincroni in memoria). Zero CPU server oggi; se nel nuovo client Expo restasse sul dispositivo il costo server non cambia, ma file grandi bloccano il thread UI.
- `/me/imports`: 2 query; `listImportBatches` ha 3 sottoquery correlate per batch (fino a 50) e `listBulkDays` fa un `GROUP BY` su tutti i log non tracciati dell'utente con una `EXISTS` per riga: lettura pesante lato D1 più che CPU.
- `deleteImportLogs` / `deleteBulkDay`: una sola `DELETE` che può toccare migliaia di righe più le cascate (commenti, reazioni, share): poche query ma molte righe scritte.
- `GET /api/account/export`: 8 query e `JSON.stringify` con indentazione dell'intero storico (decine di migliaia di righe possibili) in un'unica risposta.

## 9. Cose pesanti (CPU per richiesta)

Contesto: il README dice che renderizzare le pagine pubbliche a ogni richiesta portava il Worker oltre il limite di CPU (errore 1102 sul 20–40% delle richieste di crawler e visitatori), da cui il prerendering. Nel repo **non c'è alcun uso della Cache API** (`caches.default`, `caches.open` compaiono solo nel service worker del browser): gli header `Cache-Control` qui sotto parlano al browser e ai crawler; che l'edge di Cloudflare conservi la risposta di un Worker dipende dalla configurazione della zona **[da verificare]**.

### 9.1 Immagini generate a richiesta con `ImageResponse` (Satori + rasterizzazione PNG)

| Rotta | Misura | Lavoro per richiesta | `Cache-Control` nel codice | Chi la chiama e quanto spesso |
|---|---|---|---|---|
| `/api/og/guide/{slug}?locale=` | 1200×630 | 3 font Google scaricati a ogni richiesta (CSS + file, quindi fino a 6 `fetch` esterni), layout, PNG | `public, max-age=86400, s-maxage=604800` | crawler social a ogni condivisione di una guida; Google per `Article.image`; 24 varianti |
| `/{l}/opengraph-image` | 1200×630 | come sopra (3 font) | nessuno esplicito | crawler social su landing, indice guide, privacy, termini, sign-in e ogni pagina senza immagine propria; 3 varianti. Se sia generata in build o a richiesta non è determinabile dal repo **[da verificare]** |
| `/api/serata/{code}/invite?locale=` | 1200×630 | lettura D1, 3 font, più le locandine `w342` scaricate da TMDB e ridisegnate in una striscia | `public, max-age=300` | ogni anteprima di link in chat (WhatsApp, Telegram, iMessage) quando si condivide una Serata aperta; è il percorso di acquisizione principale |
| `/api/serata/{code}/card?locale=&format=og` | 1200×630, oppure 1080×1920 senza `format=og` | lettura D1, 2 font, una locandina TMDB | `public, max-age=3600` | anteprime della Serata finita; download/condivisione della storia 9:16 dal telefono |
| `/api/circle/{id}/year/{year}/card` | **1080×1920** | sessione, appartenenza, lettura di **tutti i log dell'anno** della Cerchia, font, locandina | `private, no-store` | pulsante "condividi" in Insights; mai in cache |
| `/apple-splash/{W}x{H}` | fino a **2048×2732** | solo due rettangoli, ma il PNG più grande di tutti | `public, max-age=604800, immutable` | iOS quando si aggiunge alla schermata Home (una misura per dispositivo) |
| `/pwa-icon/192`, `/512`, `/maskable` | 192 / 512 | 11 rettangoli, niente font | nessuno esplicito (default di `ImageResponse`) | installazione PWA; **ogni notifica push mostrata** (`icon` e `badge` = `/pwa-icon/192`); Google per `Organization.logo` (`/pwa-icon/512`); `getInstalledRelatedApps` |
| `/icon`, `/apple-icon` | 32 / 180 | come sopra | nessuno esplicito | ogni scheda del browser (favicon). File-convention senza parametri: di norma generati in build **[da verificare]** |

Note comuni:
- `loadGoogleFont` (`src/lib/og-font.ts`) chiede a `fonts.googleapis.com` un font ridotto ai soli glifi del testo, senza alcuna cache: ogni immagine con testo costa da 2 a 6 richieste esterne più il parsing del font. Se fallisce, l'immagine esce con il font di default.
- In tutto sono **6 punti** che usano `next/og`, più `pause-mark.tsx` e `og-font.ts` come librerie.
- Tutto questo è deterministico rispetto a (slug, lingua) o a (misura): le 24 + 3 immagini OG, le 3 icone e le 10 splash si possono generare una volta in build e servire come file statici. Solo invito, card e card dell'anno dipendono dai dati.

### 9.2 Altro lavoro a richiesta sul lato pubblico

| Cosa | Dettaglio | Frequenza |
|---|---|---|
| `GET /` | legge `Accept-Language`, redirect | ogni ingresso dalla radice e **ogni avvio della PWA** (`start_url: /?app=1`) |
| `GET /api/auth/get-session` | chiamata da `SignedInRedirect` | **a ogni visita della landing**, anche di chi non ha mai avuto un account. Il commento dice che la cache nel cookie (5 minuti) evita la lettura del database |
| `GET /api/config` | `{ google: boolean }`, `cache-control: public, max-age=300, s-maxage=300` | una per caricamento della landing (pulsante Google con `enabled="check"`) |
| HTML delle pagine pubbliche | prerenderizzato; letto dagli asset statici tramite la cache incrementale di OpenNext | ogni visita; se il Worker venga comunque invocato per consegnarlo non è determinabile dal repo **[da verificare]** |
| `/{l}/sign-in`, `/{l}/join/{code}`, `/{l}/s/{code}`, `/{l}/s/{code}/card` | resi dal server a ogni richiesta (sessione e/o D1); la card calcola anche un QR come data URI | ogni apertura di un link d'invito o di Serata |
| `GET /api/serata/{code}` | polling ogni 1,5s da ogni telefono nella stanza, 204 se nulla è cambiato | 40 richieste al minuto per persona per tutta la durata della Serata |
| `GET /api/circle/{id}/aside` | raccomandazioni (motore WASM) + prime 5 della classifica | solo da 80rem in su, a ogni pagina di Cerchia |

Quindi una visita anonima alla landing oggi costa, oltre all'HTML, **due chiamate al Worker** (`get-session` e `config`); le locandine della landing (5) arrivano direttamente da `image.tmdb.org`.

### 9.3 Cose che **non** pesano a runtime

- Font delle pagine: `next/font/google` li scarica in build e li serve come file statici (`font-src 'self'`); 2 famiglie, 5 pesi, subset `latin`.
- JSON-LD, sitemap, robots, manifest: calcolati in build (README: "the sitemap and robots.txt are prerendered").
- `/sw.js`, `/offline.html`, `/llms.txt`, `/favicon.ico`: file statici in `public/`.
- Animazioni della landing (Lenis, IntersectionObserver): tutto nel browser.
- La demo "Prova la Serata" della landing: stato locale nel browser, nessuna chiamata.
