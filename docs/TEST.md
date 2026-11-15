# Test e verifica

## Suite automatica

```bash
cd pausa
npm run test        # Vitest: 39 test
npm run typecheck   # tsc --noEmit
npm run build       # build produzione (valida pagine/route/tipi)
```

Stato: **39 test verdi**, typecheck pulito, build OK.

## Cosa coprono i test

Logica pura (senza DB), dove sta il rischio:

| File | Verifica |
|---|---|
| `tests/db/schema.test.ts` | presenza di tutte le tabelle |
| `tests/tmdb/mapper.test.ts` | mapping TMDB → media_entity (anno, poster, imdb) |
| `tests/tmdb/index.test.ts` | cache: fetch quando manca, niente fetch se già in cache |
| `tests/circles/index.test.ts` | codice invito, validità invito (scadenza/usi) |
| `tests/diary/rating.test.ts` | rating valido solo a step 0.5 da 0.5 a 5 |
| `tests/diary/index.test.ts` | createLog + righe "visto con", rifiuto rating invalido |
| `tests/lists/index.test.ts` | coerenza scope lista (personale vs gruppo) |
| `tests/feed/index.test.ts` | merge + ordinamento timeline |
| `tests/notifications/index.test.ts` | build notifica + serializzazione payload |
| `tests/serata/tavolo.test.ts` | dot voting, veto, tie-break |
| `tests/serata/bracket.test.ts` | pairing, bye, advance, pickWinner |
| `tests/recs/index.test.ts` | similarità gusti, consigli (esclusione loggati), aggregate |
| `tests/integration/flow.test.ts` | **end-to-end su SQLite reale**: crea Cerchia → invito → join → log → commento → feed; lista di gruppo |

L'integration test usa `better-sqlite3` in memoria con le migrazioni reali: valida l'intero strato di dominio contro un vero motore SQLite.

## Audit design (anti-AI-slop)

```bash
node ~/.claude/skills/hallmark/scripts/sloplint.mjs pausa/src/app/globals.css
```
Stato: **clean** (0 FAIL, 0 REFLEX, 0 WARN).

## Verifica visiva (screenshot reali)

Nessun browser su PATH ma Chrome è installato. Per le schermate autenticate si è usato Chrome headless + CDP con cookie di sessione iniettato:

1. Seed dati locali via `wrangler d1 execute pausa --local --file seed.sql` (utenti, Cerchia, log, sessione `seed-sess`).
2. Script CDP: lancia Chrome `--remote-debugging-port`, `Network.setCookie(pausa_session=seed-sess)`, naviga, `Page.captureScreenshot`.

Schermate verificate: landing, diario, insights, crea-Serata. Tutte conformi alla direzione artistica (vedi [DESIGN.md](DESIGN.md)).

## Verifica manuale

Vedi il giro completo in [AVVIO-E-DEPLOY.md](AVVIO-E-DEPLOY.md).
