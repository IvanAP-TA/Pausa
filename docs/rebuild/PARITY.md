# PARITY: ogni test della v1 e dove lo copre la v2

Tabella di tracciabilità: ogni test della app vecchia (v1: Next/OpenNext/D1/KV) contro la ricostruzione (Rust Worker + Expo). Scopo: nulla si perde in silenzio.

Stati: `COVERED` (esiste un test nuovo, nominato) / `PARTIAL` (manca qualcosa, scritto) / `PENDING` (funzione già costruita ma test non scritto o schermata non ancora fatta) / `NOT-APPLICABLE` (meccanismo solo v1) / `GAP` (comportamento v1, nulla nella v2).

Verificato con grep sul repo il 2026-11-25. I "COVERED" citano file e controlli che esistono davvero; le suite smoke sono lette dalle etichette `check("...")`, **non rieseguite** qui. Questo documento non prova che i test passino.

## Fonti nuove (cosa esiste oggi)

| Fonte | Contenuto | Quantità |
|---|---|---|
| `crates/core/src/*.rs`, `crates/engine/src/*.rs` | test Rust `#[test]` (core: auth, catalog, circles, diary, dto, import, limits, lists, profile, ranking, rating, serata; engine: lib, reference). `crates/api/src` non ha `#[test]` | 94 |
| `tools/api-smoke.mjs` (auth, Cerchie, inviti, account, cron) | controlli end-to-end su D1 locale | 124 |
| `tools/api-smoke-diary.mjs` (catalogo, log, thread, commenti, reazioni, segnalazioni, avanzamento) | idem | 122 |
| `tools/api-smoke-people.mjs` (profilo, preferenze, notifiche, liste, anteprima invito, CORS, token nativo) | idem | 95 |
| `tools/api-smoke-serata.mjs` (Serata, WebSocket) | idem | 82 |
| `tools/api-smoke-import.mjs` | idem | 67 |
| `tools/api-smoke-stats.mjs` (classifica, insight, raccomandazioni) | idem | 44 |
| `tools/check-schema.mjs` | schema SQLite v2 + vincoli (un solo owner, indici parziali ...) | script |
| `apps/mobile/tests/*.test.ts` | api, i18n, import-formats, import-lists, import-parsers, import-sources, next, postexport, tokens | 122 |
| `apps/mobile/e2e/*.spec.ts` | app (sign-in, Cerchia, account, a11y/motion), seo, zero-js | ~40 |

Schermate client già presenti in `apps/mobile/src/features`: SignIn, Home, Join, CirclePage, CircleSettings, Account, public (Landing, Guides, Legal). **Vuote o solo README**: `lists/`, `serata/`, `areas/`; non esistono ancora diario/log, thread, classifica, insight, profilo membro, notifiche. Se altri agenti aggiungono test client, aggiornare i PENDING qui sotto.

---

# Parte A. Playwright v1 (`e2e/`, 57 test)

`journeys.spec.ts` = 13 test; `accessibility.spec.ts` = 44 test (8 pagine pubbliche + 14 private, ciascuna in tema chiaro e scuro).

## A1. journeys.spec.ts

| # | Titolo v1 | Cosa asserisce | Stato | Dove / cosa manca |
|---|---|---|---|---|
| 1 | the landing explains the product and offers the app | h1 e CTA della landing | COVERED | `apps/mobile/e2e/seo.spec.ts` "23 the Italian h1 says what the old e2e said..." e "20 og:type website, 21 JSON-LD..." |
| 2 | the group ranking lists every title with each person's rating and the average | schermata classifica con voti per persona e media | PENDING | dati e ordinamenti coperti da `api-smoke-stats.mjs` ("T1: three votes, average (9+9+10)/3", "default order..."); schermata client non esiste, nessun e2e |
| 3 | the language switch keeps you on the page | cambio lingua resta sulla stessa pagina | COVERED | `seo.spec.ts` "the language switcher links to the same page in the other languages"; `app.spec.ts` "the account page: ... a language switch ..." |
| 4 | sign in, see the diary, open the profile and log out | login, diario, profilo, logout | PARTIAL | `app.spec.ts` sign-in + account "then sign out"; diario e profilo (schermate) mancano |
| 5 | a stranger cannot read a Cerchia (404, not 403) | estraneo non legge la Cerchia, 404 | COVERED | `api-smoke.mjs` "detail: a non-member gets 404", "an outsider cannot even see the Cerchia (404)"; `api-smoke-diary.mjs` "carol is not in Divano: 404, not 403". Lato UI non c'è un e2e dedicato |
| 6 | log a film, then edit and delete it | registra, modifica, elimina un film | PARTIAL | API tutta coperta in `api-smoke-diary.mjs` ("alice logs Matrix...", "author edits (204)", cancellazione); schermata di registrazione/modifica non esiste |
| 7 | comment on a log and report someone else's comment | commento e segnalazione | PARTIAL | `api-smoke-diary.mjs` ("alice comments in Divano (201)", "bob reports carol", "reporting twice..."); UI thread assente |
| 8 | Serata for two: member opens, guest joins by link, both vote, both see result | Serata in due, ospite via link, voto, risultato | PARTIAL | `api-smoke-serata.mjs` copre stanza, ospite con nome, voto, chiusura, risultato e WebSocket ("the result reaches both screens at the same moment"); schermate Serata assenti, nessun e2e |
| 9 | the invite link of an open Serata previews as an invitation (no vote revealed) | anteprima link Serata senza voti | PARTIAL | dati: `api-smoke-serata.mjs` "the share-card data needs no sign-in... and shows nobody"; anteprima invito Cerchia: `api-smoke-people.mjs` "invite preview needs no sign-in". `og:image` dinamica della Serata abolita da PLAN (anteprima statica): è un cambio di design, non un buco |
| 10 | operator pages are closed to everyone else | `/admin/*` chiuse ai non operatori | GAP | pagine operatore non ricostruite (coda segnalazioni "non fatto" in PLAN) |
| 11 | the data export downloads the person's own data @phone | export dati personali | COVERED | `app.spec.ts` "the account page: this device, the data export, ..."; `api-smoke.mjs` "export: attachment with profile and logs", "export holds no password hash or tokens", "export needs a session" |
| 12 | the space bar leads to my Cerchie, where a pasted invite link gets me in | barra, pagina Cerchie, incolla link invito | PARTIAL | `app.spec.ts` "a stranger opens the invite link signed out..." + `apps/mobile/tests/next.test.ts` ("takes the last path segment of a link..."); la pagina "le mie Cerchie" con campo incolla non è coperta |
| 13 | log a film in private, then delete it from my space | log privato, cancellazione dal proprio diario | PARTIAL | `api-smoke-diary.mjs` "a viewing shared nowhere is in my diary, readable and editable", "and in no feed"; UI diario assente |

## A2. accessibility.spec.ts (axe WCAG 2.1 A/AA, chiaro e scuro)

Aggiornato il 2026-11-25 (dettagli e numeri in `docs/rebuild/A11Y.md`): la v2 ha ora `apps/mobile/e2e/a11y-axe.spec.ts` (axe-core, tag wcag2a/wcag2aa/wcag21a/wcag21aa, **qualsiasi** violazione fa fallire), a 390x844 e 1280x800, scuro e chiaro, su tutte le schermate private, le pagine pubbliche e gli stati che contano (Registra con una serie, fogli aperti, spoiler, stanza della Serata in lobby/torneo/tavolo/risultato, import con file, vuoti, errore). In più `a11y-keyboard.spec.ts` (Tab, indicatore di fuoco, fogli, Escape) e `a11y-tree.spec.ts` (albero di accessibilità di otto flussi). Nessuna sessione con screen reader.

| Gruppo v1 | N | Stato | Cosa c'è / cosa manca |
|---|---|---|---|
| public `/it /en /es /it/sign-in /it/guide /it/guide/movie-night-guide /it/privacy /it/terms`, tema chiaro | 8 | COVERED | `a11y-axe.spec.ts` "public pages and the signed-out screens" (landing in tre lingue, guide, privacy, termini, 404, sign-in e "link inviato", invito, porta della Serata). Le pagine pubbliche sono sempre scure per costruzione (il tema chiaro è una preferenza della shell), quindi "chiaro" ripete lo scuro |
| public, stesse 8, tema scuro | 8 | COVERED | idem |
| signed in: `/c/:id`, serata, lists, members, insights, ranking (+filtri), log, notifications, `/account`, `/me`, `/me/import`, `/me/imports`, `/me/circles`, tema chiaro | 14 | COVERED | "every signed-in screen" (24 schermate, a due larghezze) + "states". `/me/circles` non esiste come rotta nella v2 (è `home`); la scheda "filtri" del ranking non è stata scansionata separatamente (il foglio filtri è provato sul feed) |
| signed in, tema scuro | 14 | COVERED | idem |

---|---|---|---|
| public `/it /en /es /it/sign-in /it/guide /it/guide/movie-night-guide /it/privacy /it/terms`, tema chiaro | 8 | PARTIAL | contrasti dei token in `apps/mobile/tests/tokens.test.ts` (ink >= 7, muted >= 4.5, focus >= 3, ...), un solo h1, lang, title in `seo.spec.ts`, `app.spec.ts` "every control ... at least 44 points and has a name". Manca axe vero (landmark, label, ordine heading ...) |
| public, stesse 8, tema scuro | 8 | PARTIAL | idem: `tokens.test.ts` ha `dark ...` e `light ...` |
| signed in: `/c/:id`, serata, lists, members, insights, ranking (+filtri), log, notifications, `/account`, `/me`, `/me/import`, `/me/imports`, `/me/circles`, tema chiaro | 14 | PENDING | quasi tutte le schermate non esistono; per Home/CirclePage/CircleSettings/Account si può già aggiungere axe in `apps/mobile/e2e` |
| signed in, tema scuro | 14 | PENDING | idem |

---

# Parte B. Vitest v1 (`src/**/*.test.ts`, 36 file, 285 `it(` rilevati con grep)

Convenzione: "smoke X" = `tools/api-smoke-X.mjs` (se vuoto: `api-smoke.mjs`); "core X" = `crates/core/src/X.rs`.

## B1. Accesso e Cerchie

| File v1 (n) | Cosa asserisce | Stato | Dove / cosa manca |
|---|---|---|---|
| `core/circles.test.ts` (17) | stati invito (attivo/scaduto/esaurito/revocato), creazione con admin+invito, entrare, rientro senza consumare, utilizzi, revoca solo admin, promozioni, ultimo admin, rimozione, ultimo membro chiude, conteggio persone entrate via invito | COVERED | core circles: `invite_state_precedence`, `typed_codes_are_normalised`, `removal_respects_rank`, `leaving`, `a_circle_never_ends_up_without_an_owner`, `only_the_owner_changes_roles...`; smoke: "an exhausted invite is refused", "an expired/revoked invite...", "joining twice changes nothing", "invite use counted once", "who joined through the invite is recorded", "a Cerchia of 30 is full", "a member cannot revoke". Nota: "mai due persone sull'ultimo uso" è provato in sequenza, non in concorrenza |
| `core/content.test.ts` (11) | modifica/cancellazione log e a cascata, commenti, rinomina solo admin, riordino liste, permessi liste, export, eliminare il creatore passa la Cerchia | COVERED | smoke diary (modifica, cancellazione "replies go with their parent", commenti "only the commenter edits (403)"), `api-smoke.mjs` ("an admin updates settings", "the longest-standing admin inherits the Cerchia", "a Cerchia with nobody left is deleted", export), smoke people ("reorder in one call", "a plain member cannot delete a group list (403)"). Sotto-test "heals duplicated positions" = NOT-APPLICABLE: il riordino v2 è un'unica permutazione (`reorder_must_be_a_permutation` in core lists) |
| `core/settings.test.ts` (9) | tutto acceso di default, admin-only, muting Cerchia, tipi spenti, "sta guardando" nascosto, set sostituito per intero, digest opt-in | COVERED | smoke people ("muting a Cerchia (204)", "a viewing shared with Casa notifies nobody who muted it or switched...", "preferences saved; notifyOff deduplicated", "an unknown notification type is refused"), `api-smoke.mjs` ("a muted owner gets no join notice"). Invio del digest: vedi `digest.test.ts` |
| `core/limits.test.ts` (7) | finestre di rate limit, conteggi separati, residuo, potatura righe, pulizia ospiti e sessioni scadute | COVERED | core limits (`allows_up_to_max_then_refuses_then_resets`, `v1_numbers_are_kept`); `api-smoke.mjs` "3 links per email per 10 minutes, then 429", "429 carries Retry-After...", "stale rate-limit counter removed", "an old guest is removed...", "expired session removed" |
| `lib/native-shell.test.ts` (4) | percorso `next` sicuro, rifiuto di URL esterni, fallback, codifica | COVERED | `apps/mobile/tests/next.test.ts` ("keeps a plain path, with its query", "refuses undefined..."), core auth `next_only_allows_same_site_paths`, `api-smoke.mjs` "//evil next falls back to /", e2e `app.spec.ts` "an off-site `next` is ignored" |
| `lib/embedded-browser.test.ts` (3) | riconosce browser in-app dove Google non funziona | GAP | accesso Google non ancora ricostruito in client; nessun rilevamento |
| `lib/qr.test.ts` (3) | QR dell'invito (matrice, determinismo, SVG) | GAP | nessun QR nel client v2 |
| `core/migrations.test.ts` (1) | migrazione "turns every existing circle" | GAP | non c'è ancora lo strumento di migrazione dati v1->v2 (PLAN: "la migrazione dati creerà i lotti"); `tools/check-schema.mjs` prova solo lo schema nuovo. Serve un test di migrazione prima del cutover |
| `core/sentry.test.ts` (5) | busta Sentry per errori, senza query string | GAP | nessun reporter di errori nel Worker Rust |
| `core/review.test.ts` (2) | account di revisione store (Cerchia demo, idempotente) | GAP | non ricostruito; serve per Apple/Google review |

## B2. Diario, thread, avanzamento

| File v1 (n) | Cosa asserisce | Stato | Dove / cosa manca |
|---|---|---|---|
| `core/sharing.test.ts` (5) | visibilità del log per Cerchia, privato, condivisione solo da autore, import privato | COVERED | smoke diary ("alice logs Matrix, shared with Divano", "carol is not in Divano: 404", "Cineforum has no viewings yet", "bob shares his viewing with both Cerchie", "only the author changes sharing", "sharing with a Cerchia I am not in is forbidden"), smoke import ("with no destination Cerchia nothing is shared"). Modello cambiato: niente `log.scope` |
| `core/progress.test.ts` (7) | avanzamento stagione/episodio, +1, stagione successiva, etichetta legacy | COVERED | core diary `plus_one_episode_rolls_over_seasons`, `positions_are_cut_to_what_exists`; smoke diary ("+1 episode rolls into the next season", "my bookmark moved to S2·E13", "a finished series leaves ..."). Sotto-test `parseLegacy` = NOT-APPLICABLE (etichetta testuale abolita) |
| `core/episodes.test.ts` (11) | stagioni TMDB senza speciali, totale AniList, clamp, +1/rollover, cache stagioni che scade dopo un mese | PARTIAL | core catalog `tmdb_series_detail_skips_specials_and_empty_seasons`, `anilist_search_and_detail`; core diary rollover/clamp; smoke diary "the seasons were stored without the specials". Manca: scadenza a un mese della cache stagioni |
| `core/details.test.ts` (4) | sinossi, generi, cast, durata da TMDB/AniList, taglio a fine frase | COVERED | core catalog `tmdb_movie_detail`, `html_is_stripped`; core diary `long_text_is_cut_at_a_sentence`; smoke diary "detail: synopsis, genres, cast and runtime" |
| `core/moderation.test.ts` (6) | segnalare, non il proprio, doppia segnalazione, ignora/rimuovi, rimozione cascata, solo operatore chiude | PARTIAL | creazione segnalazione COVERED in smoke diary ("reporting your own content is refused", "reporting twice is not an error", "the report keeps a snapshot..."). Manca tutta la coda operatore (ignora/rimuovi/chiudi): GAP, "non fatto" in PLAN |
| `core/retention.test.ts` (5) | "un anno fa" e checklist di avvio | GAP | niente nel server v2 ne nel client |

## B3. Social, notifiche, profilo, digest, push

| File v1 (n) | Cosa asserisce | Stato | Dove / cosa manca |
|---|---|---|---|
| `core/profile.test.ts` (6) | nome/bio/generi (max 5), preferiti ordinati, parola `PAUSA` per togliere le visioni, solo in quella Cerchia | COVERED | core profile (`name_bio_and_genres_are_cleaned`, `avatars_round_trip`); smoke people ("profile saved (204)", "a sixth favourite is refused", "removing makes room"); smoke diary ("the word PAUSA is case and space tolerant", "his viewings still exist (only the sharing went)") |
| `core/digest.test.ts` (6) | riepilogo email: opt-in, niente se nulla di nuovo, finestra 3 giorni, push esclude email | GAP | esiste solo la preferenza (`api-smoke-people` "preferences saved"); la costruzione e l'invio del riepilogo non sono nel cron v2 |
| `core/mailer.test.ts` (4) | rendering testo+HTML, invio Resend, provider che fallisce, senza chiave | PARTIAL | `crates/api/src/mail.rs` invia il link magico (smoke: "link requested for ..."); nessun test Rust ne smoke sul fallimento del provider o sul rendering. Digest: vedi sopra |
| `core/push.test.ts` (7) | testo push per lingua, deep link, una riga per browser, rimozione endpoint morto | GAP | push (T7) non iniziato |
| `core/push-payload.test.ts` (1) | richiesta push cifrata e firmata VAPID | GAP | idem |

## B4. Catalogo, scoperta, "dove guardarlo"

| File v1 (n) | Cosa asserisce | Stato | Dove / cosa manca |
|---|---|---|---|
| `core/discovery.test.ts` (5) | "Per te" da titoli amati (TMDB discover) | GAP | PLAN: "per te" non fatto (serve TMDB vero) |
| `core/streaming.test.ts` (10) | servizi per paese, intersezione del gruppo, disponibilità cache | GAP | solo il paese è salvato (`api-smoke-people` "an unknown country is refused"); "dove guardarlo" non fatto |
| `core/roster.test.ts` (6) | rosa per la Serata: consigli + watchlist, filtro servizi e visti | GAP | non fatto |
| `core/metrics.test.ts` (6) | metriche prodotto (attivazione, retention, tempo Serata) | GAP | nessuna metrica operatore nella v2 |

## B5. Classifica, statistiche, motore

| File v1 (n) | Cosa asserisce | Stato | Dove / cosa manca |
|---|---|---|---|
| `core/ranking.test.ts` (6) | media per persona, rewatch conta una volta, filtri, ordinamenti, minVotes 0 | COVERED | core ranking (`average_is_the_plain_mean...`, `sorts`, `filters`); smoke stats ("default order...", "minVotes=2...", "kind=anime", "everyone=1", "search ignores case and accents", "sort=year", "pages do not overlap") |
| `core/insights.test.ts` (28) | affinità di gusto, d'accordo/divisi, anno in rassegna, ore film, più attivo, titolo dell'anno, raccomandazioni, solo membri | COVERED | `crates/engine/src/lib.rs` (`similarity_needs_three_shared_titles`, `mirrors_the_taste_of_someone_with_opposite_taste`, `suggests_a_loved_title...`, `a_later_rating_replaces_an_earlier_one`); core ranking `agree_and_split_lists`; smoke stats ("taste pair p1/p2...", "year in review", "movie hours count films only", "title of the year", "recommendations...", "outsiders get 404", "a Cerchia of one person ... empty") |
| `lib/engine/engine.parity.test.ts` (5) | motore wasm = riferimento, 3000 Cerchie casuali, casi limite | PARTIAL | `crates/engine/src/reference.rs` `compact_engine_matches_the_string_reference_bit_for_bit` (1 test, parità con riferimento a stringhe). "caricato da engine.wasm, non fallback" = NOT-APPLICABLE (nessun fallback JS). Da verificare: numero di Cerchie casuali e `tastePairs` come in v1 |
| `lib/serata/engine.test.ts` (11) | tabellone 2/3/5/8 titoli, pareggio, veti, scrutinio, ballottaggi | COVERED | core serata (`eight_seeds_play_seven_matches...`, `five_seeds_give_byes...`, `three_seeds_and_two_seeds`, `level_matches_are_drawn...`, `closing_a_match_does_not_touch_the_previous_state`, `a_bracket_needs_two_to_eight_titles`, `table_most_dots_wins...`, `a_vetoed_title_cannot_win...`, `ballots_are_validated`) + altri 17 test di stanza/stato |

## B6. Import

| File v1 (n) | Cosa asserisce | Stato | Dove / cosa manca |
|---|---|---|---|
| `core/import-parsers.test.ts` (22) | CSV (Letterboxd), MAL XML, AniList: righe, date, voti, recensioni | COVERED | `apps/mobile/tests/import-parsers.test.ts` (22 test, stessi titoli) |
| `core/import-formats.test.ts` (11) | Trakt, IMDb, Cinemaniac, liste | COVERED | `apps/mobile/tests/import-formats.test.ts` (10 test; il titolo "every source" non ha corrispondente identico, verificare) |
| `core/import-lists.test.ts` (5) | lettura export liste + creazione lista idempotente a pezzi | COVERED | lettura: `apps/mobile/tests/import-lists.test.ts` (3); creazione/continuazione: smoke import ("a list goes to the Cerchia as a group list", "the next chunk continues the same list, skips the title already in it") |
| `core/import-sources.test.ts` (9) | mappe delle sorgenti, stesso TMDB id serie/film distinti, idempotenza | COVERED | `apps/mobile/tests/import-sources.test.ts` (6) + smoke import ("by TMDB id, by IMDb id (series) and by title", "the same title as another kind is a different title", "sending the same chunk again adds nothing") |
| `core/import.test.ts` (21) | righe, idempotenza, rewatch, notifiche assenti, abbinamento titolo+anno, anime, arricchimento, chunk da 30 | COVERED | core import (7 test su pulizia e date) + smoke import (67): "one bad row does not sink the chunk", "a title is matched case-insensitively, year within one...", "anime come from AniList by MAL id", "no notification goes out for imported history", "30 unknown titles are not done in one call". Il tetto cambia (12 nuovi per chiamata, con cursore) |
| `core/import-batches.test.ts` (16) | destinazione privata/Cerchia, togli dalla Cerchia, elimina run, elenco; giorni con molte visioni: nascondi, elimina | PARTIAL | run, destinazione, "taking the import out of the Cerchia", delete, list, listatura: COVERED in smoke import. **Manca** il blocco "giorni con molte visioni non tracciate" (elenca/nasconde/elimina un giorno, 4-5 test): euristica non fatta (PLAN) |

---

# Parte C. Riepilogo

## C1. Conteggi

| Stato | Vitest v1 (test) | Vitest v1 (file) | Playwright v1 (test) | Totale test |
|---|---:|---:|---:|---:|
| COVERED | 183 | 17 | 4 | 187 |
| PARTIAL | 42 | 5 | 23 | 65 |
| PENDING | 0 | 0 | 29 | 29 |
| NOT-APPLICABLE | 0 (sotto-test annotati: 3) | 0 | 0 | 0 |
| GAP | 60 | 13 | 1 | 61 |
| **Totale** | **285** | **35 + migrations** | **57** | **342** |

Note: i file vitest sono 36 (la riga `migrations` e GAP, quindi 13 file GAP in tutto: digest, discovery, metrics, migrations, push-payload, push, retention, review, roster, sentry, streaming, embedded-browser, qr). I sotto-test NOT-APPLICABLE sono dentro file contati altrove: `heals duplicated positions` (content), `parseLegacy` (progress), `loaded from engine.wasm` (parity). I 285 sono dichiarazioni `it(` rilevate: l'atteso "~294" include probabili espansioni di `it.each`. Playwright: 13 + 44 = 57 come da richiesta.

Nota 2026-11-25: i 28 axe test v1 (A2) sono ora COVERED dalla spec axe della v2; la tabella C1 non è stata ricalcolata (28 test spostati da PENDING a COVERED).

## C2. Coperture solo-v2 (nessun equivalente v1, per memoria)

- Schema: `tools/check-schema.mjs`; contratto errori e client HTTP: `apps/mobile/tests/api.test.ts`; i18n ICU 3 lingue: `apps/mobile/tests/i18n.test.ts`; SEO e budget del post-export: `apps/mobile/tests/postexport.test.ts` + `apps/mobile/e2e/seo.spec.ts`; 0 JS sulle pagine pubbliche: `apps/mobile/e2e/zero-js.spec.ts`; contrasti token: `apps/mobile/tests/tokens.test.ts`.
- Nuovi comportamenti provati in smoke: trasferimento proprietà, sessioni/dispositivi (`api-smoke.mjs` "two devices listed..."), CORS e token nativo (`api-smoke-people.mjs`), WebSocket Serata, scadenza stanze a deadline.
- **Perf**: la v1 non aveva test di performance; la v2 ha solo budget JS (`postexport.test.ts` "fails a fixture whose shell is over the limit"). Mancano test di CPU 10 ms su ranking/raccomandazioni (vedi `docs/rebuild/cpu-hotspots.md`) e Lighthouse >= 95 (richiesto in PLAN T8).

## C3. GAP e PENDING per importanza

1. **PENDING, schermate client del cuore dell'app**: diario/log (e2e 6, 13), thread commenti/segnalazioni (7), classifica (2), insight, liste, profilo membro, notifiche, Serata (8), pagina Le mie Cerchie con invito incollato (12). L'API è coperta; senza e2e client la parità non è dimostrata.
2. ~~PENDING, accessibilità del lato privato~~ **chiuso lato client il 2026-11-25** (`docs/rebuild/A11Y.md`): 216 scansioni axe per esecuzione, 0 violazioni, più tastiera e albero di accessibilità. Resta fuori ciò che non si può provare qui: TalkBack/VoiceOver, un dispositivo vero.
3. **GAP, migrazione dati v1->v2** (`migrations.test.ts`): nessun test di migrazione; rischio alto al cutover (lotti di import, `log.scope` -> condivisioni, etichette legacy).
4. **GAP, push** (`push.test.ts`, `push-payload.test.ts`; v1 non disiscriveva al logout, GAPS 5.9): T7 non iniziato.
5. **GAP, coda operatore e pagine admin** (e2e 10, `moderation.test.ts` parte operatore): senza coda le segnalazioni non hanno esito.
6. **GAP, riepilogo email e cron** (`digest.test.ts`, `mailer.test.ts` parte digest/fallimento provider).
7. **GAP, "dove guardarlo", "Per te", rosa Serata** (`streaming`, `discovery`, `roster`): 21 test v1.
8. **PARTIAL, giorni importati con molte visioni** (`import-batches.test.ts`, 4-5 test) ed euristica "importazioni precedenti".
9. **GAP, "un anno fa" e checklist di avvio** (`retention.test.ts`, 5).
10. **GAP minori**: QR invito (3), rilevamento browser in-app per Google (3), Sentry (5), metriche prodotto (6), account di revisione store (2).
11. **PARTIAL minori**: cache stagioni che scade a un mese (`episodes`), concorrenza sull'ultimo uso di un invito, numero di Cerchie casuali della parità motore, `og:image` dinamica della Serata (scelta di design).
