# Migrazione dati Pausa v1 -> v2

Script Node (ES modules, `node:sqlite`, nessuna dipendenza) che legge un database v1 (D1/SQLite, schema `src/db/schema.ts` +
`drizzle/0000..0014`) e scrive un database v2 (`migrations/0001_init.sql`), con conteggi prima/dopo e controlli di coerenza.
Richiede Node >= 22 (provato su 24).

## Cosa fa

1. Apre v1 **in sola lettura** (mai modificato) e crea v2 applicando `migrations/0001_init.sql`.
2. Copia ogni tabella v1 nella sua controparte v2 **in una sola transazione**. Rifiuta di sovrascrivere un `--to` esistente.
3. Per ogni tabella scrive `v1 - scartate + aggiunte = v2`. Se un conteggio non quadra o un controllo fallisce: ROLLBACK, file v2
   rimosso, uscita 1.
4. Controlli sul DB v2: `integrity_check`, `foreign_key_check`, un solo owner per Cerchia, nessun commento/reazione in una Cerchia
   dove chi l'ha scritto (o l'autore del log) non e' membro, ogni commento sta in una Cerchia dove il log e' condiviso, `log_share`
   coerente con `log.scope` di v1, `rating_current` uguale a un ricalcolo indipendente (window function).

Codici di uscita: `0` ok, `1` non quadra / controllo fallito, `2` precondizione non soddisfatta (es. `--to` esiste, email duplicate
ignorando le maiuscole, il file non e' uno schema v1), `3` errore imprevisto.

## Regole (PLAN §6b)

| Tema | Regola |
|---|---|
| Commenti e reazioni (D1a) | Un commento/reazione resta nella Cerchia C solo se **chi l'ha scritto e l'autore del log sono entrambi membri di C** e il log e' condiviso in C. Si copia una volta per ogni Cerchia ammessa (la prima tiene l'id v1, le altre `id~<circle>`); se nessuna e' ammessa viene **scartato, contato e elencato** (`droppedRows` nel rapporto JSON, con motivo). |
| Visibilita' | `scope='circles'` -> una riga `log_share` per ogni Cerchia di cui l'autore e' membro oggi (se l'autore non ha Cerchie il log resta privato); `scope='private'` -> solo le `log_share` che aveva. Le `log_share` verso Cerchie che l'autore ha lasciato restano com'erano (avviso nel rapporto). |
| Voti | `rating_current` ricostruita con la regola esatta di `rebuild_ratings` (`crates/api/src/diary.rs`): per (Cerchia, persona, titolo) l'ultimo log di **titolo intero** (senza stagione/episodio) con voto e condiviso in quella Cerchia, ordinato per `watched_on`, `created_at`, `id`. |
| Owner | Uno per Cerchia. Se v1 ne ha piu' di uno (`role='owner'`) resta il piu' anziano (`joined_at`), gli altri diventano `admin`. Se non ce n'e' nessuno (caso reale di v1: ruoli solo admin/member) diventa owner il creatore se ancora membro, altrimenti l'admin piu' anziano, altrimenti il membro piu' anziano. |
| Importazioni | Ogni `import_batch` v1 diventa un lotto v2 `done` con `imported`/`cursor`/`total` = log che portano quel `import_batch_id`, `lists` = liste del lotto. `skipped`, `new_titles`, `failed_rows` non esistevano in v1: 0. I log "che sembrano importati" ma senza lotto **non** vengono raggruppati (la fonte e' ignota): solo contati nel rapporto. |
| Sessioni | **Non migrate** (token, magic link, contatori): tutti rientrano con il link magico. Il rapporto dice quanti utenti avevano una sessione attiva. |
| Account | `google` e `email` migrati; `credential` (password) scartati: v2 non ha password. Token Google non copiati. |
| Serate | Le finite diventano `done` con `result` ricostruito (vincitore, modalita', giri, persone); quelle in lobby/votazione diventano `expired`. `serata_vote` non migrato (v2 tiene solo l'esito). |
| `now_watching` | -> `watch_progress` (stato `watching`). L'etichetta libera `progress` senza stagione/episodio e' persa (contata). |
| Valori fuori vincolo | voto fuori 1..10 -> NULL, locale fuori it/en/es -> NULL, enum sconosciuti -> default: tutto contato in `modified`. |

Tutto cio' che v2 non sa rappresentare e' nel rapporto (`notMigrated`, `modified`, `tables.*.dropped`), mai perso in silenzio.

## Uso

```
node tools/migrate-v1-to-v2/migrate.mjs --from <v1.sqlite> --to <v2.sqlite> [--report report.json] [--dry-run]
```

`--dry-run` fa tutto in memoria (nessun file scritto) e stampa lo stesso rapporto: usarlo prima.

### Provarlo senza dati veri

```
node tools/migrate-v1-to-v2/make-v1-fixture.mjs fixture-v1.sqlite     # database v1 sintetico (50 utenti, 6 Cerchie...)
node tools/migrate-v1-to-v2/migrate.mjs --from fixture-v1.sqlite --to fixture-v2.sqlite --report fixture-report.json
node --test tools/migrate-v1-to-v2/migrate.test.mjs
```

### Su una COPIA dei dati reali (passo che spetta a te)

1. Fai un export del D1 di produzione. E' un passo **remoto**: lo lancia l'utente, non gli agenti; contiene email e commenti di
   persone vere. Esempio: `npx wrangler d1 export <nome-db> --remote --output pausa-v1.sql` (poi
   `sqlite3 pausa-v1.sqlite < pausa-v1.sql`, o `node -e` con `DatabaseSync().exec(...)`, per ottenere un `.sqlite`).
2. Tieni la copia **fuori dal repository** e cancellala a fine prova (decisione D2).
3. `--dry-run` per leggere il rapporto; se va bene, lancia senza `--dry-run` su un `--to` nuovo.
4. Guarda in particolare: commenti/reazioni scartati da D1a (`droppedRows.comment`, restano esportabili da chi li ha scritti),
   Cerchie senza membri, email duplicate (errore 2: da sistemare a mano nella copia), `v1ForeignKeyViolations`.
5. Carica il file v2 in D1 solo con un passo deliberato dell'utente (`wrangler d1 execute ... --file` da un dump del v2).

## Piano di ritorno

v1 non viene mai toccato: il database di produzione resta quello che e', lo script lavora solo su una copia. Se v2 ha problemi si
torna a v1 cambiando il DNS / la route del dominio verso il Worker v1; nessun dato v1 va ripristinato. Le scritture fatte su v2
dopo il passaggio (nuovi log, commenti) non tornano in v1: per questo il passaggio si fa con v1 in sola lettura o in una finestra
breve, e si tiene v1 online finche' v2 non e' stato accettato.

## Non coperto

Nessun export/import automatico verso D1 remoto; nessun dato reale provato; gli id delle copie di commento (`id~circle`) sono
nuovi (una segnalazione su un commento copiato viene riagganciata alla copia della sua Cerchia); `serata.watched_log_id` e
`repeated_from` non esistevano in v1 (NULL); notifiche v1 di log/commento/reazione senza Cerchia restano senza.
