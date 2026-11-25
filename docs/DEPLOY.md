# Mettere Pausa online (v2: Rust Worker + Expo)

Scritto il 25 novembre 2026, dopo la rimozione del vecchio codice Next.js. Tre parti:

- **A. Cloudflare: cose nuove** (database, segreti, Worker, dominio)
- **B. Cloudflare e dintorni: cosa togliere** del vecchio sito
- **C. Google Play: rilascio in test** (AAB firmato, test interno/chiuso)

Dopo ogni passo c'è un **Controllo**: se non passa, fermati e correggi prima di andare avanti.

> Glossario minimo
> - **Worker**: il programma che gira sui server Cloudflare e risponde alle richieste (qui: Rust compilato in WebAssembly, `crates/api`).
> - **D1**: il database SQLite gestito da Cloudflare. **Migrazione** = file SQL che crea/modifica le tabelle (`migrations/`).
> - **Segreto** (`wrangler secret put`): valore cifrato salvato sul Worker, mai nel repository. **Variabile** (`vars`): valore in chiaro in `wrangler.jsonc`.
> - **Custom domain**: collegare `pausa.gnagno.org` direttamente a un Worker; Cloudflare crea da solo il record DNS e il certificato.
> - **AAB** (Android App Bundle): il pacchetto che si carica su Google Play al posto dell'APK.

---

## Com'è fatto adesso

| Pezzo | Dove | Cosa diventa su Cloudflare |
|---|---|---|
| API (Rust, `workers-rs`) | `crates/api` (+ `crates/core`, `crates/engine`) | Worker `pausa-v2` |
| Client web (Expo, export statico) | `apps/mobile` → `apps/mobile/dist` | asset statici dello **stesso** Worker (binding `ASSETS`) |
| Sala della Serata in tempo reale | `crates/api/src/serata_room.rs` | Durable Object `SerataRoom` (SQLite, gratis sul piano Free) |
| Schema database | `migrations/0001_init.sql` | D1 `pausa-v2` |
| Migrazione dati v1 → v2 | `tools/migrate-v1-to-v2/` | si usa una volta, in locale |
| App Android | `apps/mobile` (Expo) | Google Play, parte C |

Tutto sta nel **piano Free** di Cloudflare: non serve più il piano Workers a pagamento del vecchio sito.

---

# A. Cloudflare: cose nuove

## A0. Strumenti sul PC

- **Node 22 o 24** (`node -v`).
- **Rust stable** con il target WebAssembly e `worker-build` (lo strumento che compila il Worker):

```bash
rustup target add wasm32-unknown-unknown
cargo install worker-build --version 0.9.0 --locked
```

- Dipendenze (dalla radice del repository):

```bash
npm ci                      # installa solo wrangler (radice)
cd apps/mobile && npm ci    # il client ha il suo package.json
cd ../..
npx wrangler login
```

**Controllo:** `npx wrangler whoami` mostra il tuo account; `cargo --version` e `worker-build --version` rispondono.

## A1. Database D1 nuovo

```bash
npx wrangler d1 create pausa-v2
```

Copia il `database_id` stampato in `crates/api/wrangler.jsonc`, al posto di `00000000-0000-0000-0000-000000000000`. Se wrangler aggiunge da solo una seconda voce `d1_databases`, tienine **una sola**: `"binding": "DB"`, `"database_name": "pausa-v2"`, l'id vero e `"migrations_dir": "../../migrations"`.

Ora hai due strade. Scegline **una sola**:

### A1-a. Partire vuoti (nessun utente da portare)

```bash
cd crates/api
npx wrangler d1 migrations apply pausa-v2 --remote
cd ../..
```

### A1-b. Portare i dati del vecchio sito (consigliato se ci sono utenti veri)

Il vecchio database si chiama `pausa`. Lo script lavora **su una copia locale**, il database vecchio non viene mai modificato.

1. Esporta il vecchio D1 (contiene email e commenti veri: tieni i file **fuori dal repository**, per esempio in `C:\pausa-dati\`):

   ```bash
   npx wrangler d1 export pausa --remote --output C:/pausa-dati/pausa-v1.sql
   sqlite3 C:/pausa-dati/pausa-v1.sqlite < C:/pausa-dati/pausa-v1.sql
   ```
   (`sqlite3` è il programma a riga di comando di SQLite: `winget install SQLite.SQLite`.)

2. Prova a secco (non scrive nulla, stampa il rapporto con i conteggi prima/dopo):

   ```bash
   node tools/migrate-v1-to-v2/migrate.mjs --from C:/pausa-dati/pausa-v1.sqlite --to C:/pausa-dati/pausa-v2.sqlite --dry-run
   ```
   Leggi soprattutto `droppedRows`, `notMigrated`, eventuali email duplicate (uscita 2: vanno sistemate a mano nella copia). Dettagli e regole: `tools/migrate-v1-to-v2/README.md`.

3. Migrazione vera, con rapporto salvato:

   ```bash
   node tools/migrate-v1-to-v2/migrate.mjs --from C:/pausa-dati/pausa-v1.sqlite --to C:/pausa-dati/pausa-v2.sqlite --report C:/pausa-dati/report.json
   ```
   **Controllo:** uscita `0` e nel rapporto ogni tabella torna con `v1 - scartate + aggiunte = v2`.

4. Trasforma il file v2 in SQL caricabile su D1. D1 rifiuta le righe di transazione e i `PRAGMA`, quindi vanno tolte:

   ```bash
   sqlite3 C:/pausa-dati/pausa-v2.sqlite .dump | grep -v -E "^(BEGIN TRANSACTION|COMMIT|PRAGMA)" > C:/pausa-dati/pausa-v2.sql
   ```

5. Carica tutto (schema + dati) nel D1 nuovo **vuoto** (non lanciare prima `migrations apply`: le tabelle esistono già nel dump):

   ```bash
   cd crates/api
   npx wrangler d1 execute pausa-v2 --remote --file C:/pausa-dati/pausa-v2.sql
   ```

6. Segna la migrazione come applicata, così i futuri `migrations apply` non provano a ricreare le tabelle:

   ```bash
   npx wrangler d1 execute pausa-v2 --remote --command "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP); INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0001_init.sql');"
   npx wrangler d1 migrations list pausa-v2 --remote
   cd ../..
   ```
   **Controllo:** `migrations list` dice che non c'è nulla da applicare.

7. A prova finita **cancella** `C:\pausa-dati\` (dati personali veri).

> Le **sessioni non vengono migrate**: tutti rientrano una volta con il link magico. Le iscrizioni alle notifiche push del vecchio sito non valgono più (chiavi VAPID nuove): gli utenti riattivano le notifiche dall'app.

**Controllo (entrambe le strade):**

```bash
cd crates/api
npx wrangler d1 execute pausa-v2 --remote --command "select name from sqlite_master where type='table' order by name"
cd ../..
```

> **Mai** usare `tools/seed-dev.mjs` o le suite `tools/api-smoke*` contro il database remoto: sono dati di prova e girano solo con `--local`.

## A2. Variabili (in `crates/api/wrangler.jsonc`)

`crates/api/wrangler.jsonc` oggi non ha una sezione `vars`. Aggiungila (dopo `"compatibility_date"`):

```jsonc
"vars": {
  "APP_URL": "https://pausa.gnagno.org",
  "EMAIL_FROM": "Pausa <accesso@pausa.gnagno.org>",
  "VAPID_SUBJECT": "https://pausa.gnagno.org",
  "VAPID_PUBLIC_KEY": "<dal passo A3>"
},
```

| Nome | Tipo | A cosa serve |
|---|---|---|
| `APP_URL` | variabile | indirizzo pubblico, usato nelle email di riepilogo |
| `EMAIL_FROM` | variabile | mittente delle email; dominio verificato su Resend (SPF e DKIM) |
| `VAPID_SUBJECT` | variabile | contatto per i servizi push (`https:` o `mailto:`) |
| `VAPID_PUBLIC_KEY` | variabile | chiave pubblica Web Push |
| `RESEND_API_KEY` | **segreto** | invio dei link di accesso. **Senza, nessuno può entrare** (in produzione la richiesta fallisce) |
| `TMDB_API_TOKEN` | **segreto** | ricerca titoli, locandine, "dove guardarlo" (themoviedb.org → API → *API Read Access Token* v4) |
| `VAPID_PRIVATE_JWK` | **segreto** | chiave privata Web Push (formato JWK) |
| `OPERATOR_EMAILS` | segreto (consigliato) | email separate da virgola che vedono le metriche e le segnalazioni operatore |

Da **non** impostare in produzione (servono solo ai test locali): `CORS_ORIGINS`, `VAPID_DEV_LOOPBACK`, `TMDB_BASE_URL`, `ANILIST_URL`, `EXPO_PUSH_URL`, `SERATA_MATCH_MS`, `SERATA_TABLE_MS`, `SERATA_LOBBY_TTL_MS`.

> A differenza del vecchio `wrangler.jsonc`, qui **non** c'è `keep_vars`: ogni deploy riscrive le variabili con quelle del file. Quindi le variabili si scrivono **solo** in `wrangler.jsonc`, mai nel pannello (verrebbero cancellate al deploy successivo). I segreti invece restano.

## A3. Segreti

Genera una coppia VAPID **nuova** (non riusare quella del vecchio sito, ha un altro formato):

```bash
npm run vapid
```

Stampa `VAPID_PUBLIC_KEY=...` (va in `vars`, passo A2) e `VAPID_PRIVATE_JWK={...}` (segreto). Poi:

```bash
cd crates/api
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put TMDB_API_TOKEN
npx wrangler secret put VAPID_PRIVATE_JWK     # incolla tutto il JSON, graffe comprese
npx wrangler secret put OPERATOR_EMAILS
cd ../..
```

> Se il Worker `pausa-v2` non esiste ancora, `secret put` chiede di crearlo: rispondi sì. Va bene anche fare prima il deploy (A4) e poi i segreti.

**Resend:** crea una chiave **nuova** dedicata a v2 (resend.com → API Keys, permesso *Sending access*, solo il dominio `pausa.gnagno.org`). La vecchia la elimini nella parte B. Il dominio verificato resta quello: niente da rifare su SPF/DKIM. Piano gratuito: 100 email al giorno, 3.000 al mese.

## A4. Costruire e pubblicare (prima senza dominio)

Il Worker serve anche il client web, quindi **prima** si costruisce il client, **poi** il Worker.

```bash
cd apps/mobile
# Titolare e contatto mostrati in privacy e termini: letti al momento della build.
# PowerShell:  $env:LEGAL_ENTITY="..."; $env:CONTACT_EMAIL="..."
LEGAL_ENTITY="Nome Cognome" CONTACT_EMAIL="contatto@esempio.it" npm run build:web
npm run budget
cd ../../crates/api
npx wrangler deploy
cd ../..
```

`wrangler deploy` lancia da solo `worker-build --release` (Rust → WebAssembly), carica `apps/mobile/dist` come asset, crea il Durable Object `SerataRoom` e i tre cron (`* * * * *` push, `0 17 * * *` riepilogo email, `17 3 * * *` pulizia).

**Controllo:** il comando stampa un indirizzo `https://pausa-v2.<tuo-sottodominio>.workers.dev`. Aprilo:
- `/it` mostra la landing; `/it/privacy` mostra titolare e contatto (non il segnaposto);
- `/api/push/key` risponde con la chiave pubblica (se 404: manca `VAPID_PUBLIC_KEY` o `VAPID_PRIVATE_JWK`);
- accedi con il link magico (deve arrivare l'email), registra una visione cercando un film (TMDB), apri una Serata da due dispositivi;
- `npx wrangler tail pausa-v2` mentre navighi: guarda la **CPU per richiesta** (limite Free: 10 ms). È l'unico numero mai misurato davvero: se vedi errori `exceeded CPU` / 1102, fermati prima del passaggio di dominio.

## A5. Passaggio del dominio `pausa.gnagno.org` al Worker nuovo

Il dominio oggi è collegato al vecchio Worker `pausa`. Un custom domain può stare su un solo Worker, quindi:

1. **Stacca il dominio dal vecchio Worker.** Dashboard Cloudflare → *Workers & Pages* → `pausa` → *Settings* → *Domains & Routes* → `pausa.gnagno.org` → *Remove*. Da qui il sito è offline finché non finisci il punto 2 (pochi minuti).
2. **Attaccalo al nuovo.** In `crates/api/wrangler.jsonc` aggiungi:

   ```jsonc
   "routes": [{ "pattern": "pausa.gnagno.org", "custom_domain": true }],
   ```
   e ripubblica:
   ```bash
   cd crates/api && npx wrangler deploy && cd ../..
   ```
3. **Svuota la cache.** Dashboard → zona `gnagno.org` → *Caching* → *Configuration* → *Purge Everything* (toglie i vecchi file `/_next/...` del sito Next).
4. Togli dal commento in testa a `crates/api/wrangler.jsonc` la frase "NO custom domain and NO routes", che non è più vera.

> Il nome del Worker resta `pausa-v2`: non rinominarlo in `pausa`, altrimenti il deploy finirebbe sopra il vecchio Worker ereditandone segreti e impostazioni (Better Auth, Google, binding ai servizi) che v2 non usa.

**Controllo:**
- `https://pausa.gnagno.org/it` è la landing nuova (nessun file `/_next/` nella scheda Rete del browser);
- `https://pausa.gnagno.org/robots.txt` e `/sitemap.xml` rispondono;
- `https://pausa.gnagno.org/api/push/key` risponde 200;
- un link magico arriva e porta dentro l'app su `pausa.gnagno.org`;
- dopo un'ora, in *Workers & Pages* → `pausa-v2` → *Metrics*: nessun errore, CPU mediana sotto i 10 ms.

## A6. Aggiornamenti successivi

Ogni volta:

```bash
cd apps/mobile && npm run build:web && cd ../../crates/api
npx wrangler d1 migrations apply pausa-v2 --remote   # solo se hai aggiunto file in migrations/
npx wrangler deploy
cd ../..
```

Il CI (`.github/workflows/rebuild-ci.yml`) controlla Rust, schema e API, ma **non** pubblica: il deploy resta manuale.

---

# B. Cosa togliere del vecchio sito

Fallo **dopo** che A5 è passato. Nessun ritorno indietro è previsto: quello che cancelli qui non torna.

## B1. Cloudflare

1. **Worker `pausa` (vecchio, Next.js/OpenNext).** *Workers & Pages* → `pausa` → *Settings* → in fondo *Delete*. Cancellandolo spariscono anche, in un colpo:
   - i suoi segreti: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY` (vecchio), `TMDB_API_TOKEN` (copia vecchia), `VAPID_PRIVATE_KEY`, `REVIEW_PASSWORD`, `SENTRY_DSN`, ed eventualmente `ADMIN_EMAILS`, `CONTACT_EMAIL`, `LEGAL_ENTITY`, `GOOGLE_CLIENT_ID` se li avevi messi come segreti;
   - le variabili del pannello (`BETTER_AUTH_URL`, `EMAIL_FROM`, `VAPID_SUBJECT`, `GOOGLE_CLIENT_ID`, `REVIEW_EMAIL`, `NEXT_PUBLIC_SITE_URL`…);
   - i due cron (`17 3 * * *`, `0 17 * * *`) e il binding `WORKER_SELF_REFERENCE`.

   Da riga di comando, in alternativa: `npx wrangler delete --name pausa`.
   **Controllo:** in *Workers & Pages* resta solo `pausa-v2`.

2. **Database D1 `pausa` (vecchio).** Prima tieni un'ultima copia **fuori dal repository e fuori dal cloud pubblico** (contiene dati personali):

   ```bash
   npx wrangler d1 export pausa --remote --output C:/pausa-archivio/pausa-v1-finale.sql
   npx wrangler d1 delete pausa
   ```
   Decidi tu quanto tenere quell'archivio; poi cancellalo (GDPR: non conservare dati più del necessario).
   **Controllo:** `npx wrangler d1 list` mostra solo `pausa-v2`.

3. **DNS.** Zona `gnagno.org` → *DNS*: il record di `pausa` deve essere quello creato dal custom domain (tipo *Worker*, gestito da Cloudflare). Se trovi un vecchio `CNAME`/`A`/`AAAA` per `pausa` creato a mano, cancellalo.

4. **Regole della zona** (se le avevi create per il vecchio sito): *Rules* → *Cache Rules*, *Page Rules*, *Transform Rules* che citano `/_next/`, `/api/auth/` (Better Auth) o `/en/review`: eliminale. Gli header di sicurezza ora li dà `apps/mobile/public/_headers`.

5. **Web Analytics.** Il client nuovo non carica il beacon di Cloudflare Web Analytics (era `NEXT_PUBLIC_CF_ANALYTICS_TOKEN` nella build Next). Se non lo rimetti, *Analytics & Logs* → *Web Analytics* → sito `pausa.gnagno.org` → elimina.

6. **Token API usato dal vecchio deploy automatico.** *My Profile* → *API Tokens*: revoca il token creato per GitHub Actions (quello di `CLOUDFLARE_API_TOKEN`).

## B2. GitHub

Il workflow di deploy del vecchio sito (`deploy.yml`) e il CI Next (`ci.yml`) sono stati cancellati dal repository. Nel repository su GitHub → *Settings* → *Secrets and variables* → *Actions*:
- elimina i segreti `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`;
- elimina la variabile `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.

## B3. Servizi esterni

- **Resend:** elimina la **vecchia** chiave API (quella del Worker `pausa`), tieni il dominio verificato e la chiave nuova di A3.
- **Google Cloud Console** (accesso con Google del vecchio sito): v2 per ora **non** ha l'accesso con Google. In *APIs & Services* → *Credentials* elimina il client OAuth di Pausa, oppure almeno togli l'URI di reindirizzamento `https://pausa.gnagno.org/api/auth/callback/google`. Se lo eliminerai, la schermata di consenso OAuth può restare o essere cancellata con il progetto.
- **Sentry** (se l'avevi attivato con `SENTRY_DSN`): elimina il progetto, v2 non lo usa.
- **TMDB:** nessuna azione; il token è lo stesso, ora vive come segreto di `pausa-v2`.

## B4. Sul tuo PC

- File `.env.local` / `.dev.vars` del vecchio progetto in altre copie della cartella: cancellali (contenevano chiavi).
- Le vecchie chiavi VAPID non servono più.
- La vecchia app Android (guscio Tauri, stesso pacchetto `org.gnagno.pausa`) viene sostituita dall'app Expo: vedi C0 sul numero di versione.

---

# C. Google Play: rilascio in modalità test

## C0. Prima di tutto: due cose da sapere

1. **Stesso pacchetto della vecchia app.** L'app Expo usa `org.gnagno.pausa` (`apps/mobile/app.json`), come il vecchio guscio Tauri. Se la vecchia app era già stata caricata su Play Console:
   - l'AAB nuovo va firmato con la **stessa chiave di caricamento** (upload key) di allora. Era in `C:\Users\triof\.pausa-signing` su un altro PC: recuperala da lì. Se è persa, in Play Console → *Test e rilascio* → *Configurazione* → *Integrità dell'app* → *Firma dell'app* puoi chiedere il **ripristino della chiave di caricamento** (serve qualche giorno);
   - il `versionCode` deve essere **più alto** dell'ultimo caricato. Tauri lo calcolava da `0.1.3` come `1003`. Metti in `apps/mobile/app.json`, dentro `"android"`, per esempio `"versionCode": 2000` e porta `"version"` a `"0.2.0"`. Ad ogni nuovo caricamento, `versionCode` +1.

   Se invece non hai mai caricato nulla, crei tu una chiave nuova (C2) e parti da `versionCode` 1.

2. **Accesso dei revisori.** Google esamina anche le versioni di test chiuso, e il revisore non può ricevere il link magico via email. v2 **non ha** l'account di revisione che aveva il vecchio sito (`/en/review`, segnato come escluso in `docs/rebuild/MANCA.md`). Finché non c'è, le alternative sono:
   - **Test interno** (C5): fino a 100 tester scelti da te, disponibile in pochi minuti, di norma senza revisione. È la strada per provare subito;
   - per il **test chiuso**: crea una casella email dedicata solo alla revisione (per esempio un Gmail nuovo senza dati tuoi) e nelle istruzioni di *Accesso all'app* scrivi indirizzo e password di quella casella, così il revisore apre l'email e tocca il link. Oppure implementa prima l'account di revisione in `crates/api`.

## C1. Strumenti

- **JDK 17** (`winget install Microsoft.OpenJDK.17`) e **Android Studio** (per l'Android SDK; `ANDROID_HOME` impostato, di solito `%LOCALAPPDATA%\Android\Sdk`).
- **Controllo:** `java -version` dice 17; `adb version` risponde.

Il prompt di progetto vuole l'AAB compilato **in locale** (costo zero). EAS Build di Expo ha un piano gratuito, ma qui non serve.

## C2. Chiave di caricamento (solo se non ne hai già una, vedi C0)

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore C:/Users/Giuseppe/.pausa-signing/pausa-upload.jks -alias pausa-upload -keyalg RSA -keysize 2048 -validity 10000
```

- Tieni la cartella `.pausa-signing` **fuori dal repository**, con una copia di backup altrove (senza questa chiave non puoi più aggiornare l'app, salvo la procedura di ripristino).
- Le password non vanno in nessun file del progetto. `.gitignore` già esclude `*.jks` e `*.keystore`.

Metti i riferimenti nel file **utente** di Gradle, `C:\Users\Giuseppe\.gradle\gradle.properties` (non nel progetto):

```properties
PAUSA_UPLOAD_STORE_FILE=C:/Users/Giuseppe/.pausa-signing/pausa-upload.jks
PAUSA_UPLOAD_KEY_ALIAS=pausa-upload
PAUSA_UPLOAD_STORE_PASSWORD=...
PAUSA_UPLOAD_KEY_PASSWORD=...
```

## C3. Generare il progetto Android e firmarlo

L'app Expo non contiene la cartella `android/`: si genera (si chiama *prebuild*) ed è esclusa da git.

```bash
cd apps/mobile
npx expo prebuild --platform android --clean
```

Apri `apps/mobile/android/app/build.gradle` e:

1. dentro `android { signingConfigs { ... } }` aggiungi:
   ```groovy
   release {
       storeFile file(PAUSA_UPLOAD_STORE_FILE)
       storePassword PAUSA_UPLOAD_STORE_PASSWORD
       keyAlias PAUSA_UPLOAD_KEY_ALIAS
       keyPassword PAUSA_UPLOAD_KEY_PASSWORD
   }
   ```
2. in `buildTypes { release { ... } }` sostituisci `signingConfig signingConfigs.debug` con `signingConfig signingConfigs.release`.

> `--clean` rigenera la cartella da zero e cancella queste due modifiche: rifalle dopo ogni `prebuild --clean`. (Per non doverle rifare, in futuro si può scrivere un piccolo *config plugin* Expo che le applica da solo.)

## C4. Compilare l'AAB

L'app nativa parla con `https://pausa.gnagno.org` (vedi `apps/mobile/src/api/index.ts`), quindi **compila dopo il passaggio di dominio A5**. Per provare prima, compila puntando all'indirizzo workers.dev: `EXPO_PUBLIC_API_URL=https://pausa-v2.<sottodominio>.workers.dev`.

```bash
cd apps/mobile/android
./gradlew bundleRelease          # PowerShell: .\gradlew.bat bundleRelease
```

Risultato: `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`.

**Controllo prima di caricare** (facoltativo ma utile): con `bundletool` (`winget install Google.Bundletool` o il jar da GitHub) installa l'AAB su un telefono collegato:

```bash
bundletool build-apks --bundle=app/build/outputs/bundle/release/app-release.aab --output=pausa.apks --mode=universal --ks=C:/Users/Giuseppe/.pausa-signing/pausa-upload.jks --ks-key-alias=pausa-upload
bundletool install-apks --apks=pausa.apks
```

Prova sul telefono: accesso con link magico (il link dall'email deve riaprire l'app tramite `pausa://auth`), registrare una visione, Serata, cambio lingua, tasto Indietro.

## C5. Play Console: test interno (il più veloce)

1. Play Console → **Crea app** (se non esiste): nome *Pausa*, lingua predefinita italiano, *App*, *Gratuita*, accetta le dichiarazioni.
   Se l'app esiste già (vecchio guscio Tauri), usa quella.
2. **Test e rilascio** → **Test** → **Test interno** → scheda *Tester*: crea un elenco email (fino a 100 account Google) e salva. Copia il **link di partecipazione**.
3. **Crea nuova release** → la prima volta conferma la **Firma dell'app di Google Play** (Google tiene la chiave di firma finale, tu solo quella di caricamento) → carica `app-release.aab` → note di rilascio (es. "Prima versione v2") → *Avanti* → *Salva e pubblica*.
4. I tester aprono il link di partecipazione dal telefono, accettano e installano da Play Store.

**Controllo:** la release risulta *Disponibile per i tester interni*; un tester la installa e accede.

## C6. Play Console: test chiuso

Serve prima completare **Contenuti dell'app** (*Monitora e migliora* → *Norme e programmi* → *Contenuti dell'app*):

| Voce | Cosa mettere |
|---|---|
| Norme sulla privacy | `https://pausa.gnagno.org/it/privacy` (con titolare e contatto veri, vedi A4) |
| Accesso all'app | *Alcune funzionalità sono limitate* + istruzioni in inglese per il revisore (vedi C0, punto 2) |
| Annunci | No |
| Classificazione dei contenuti | questionario IARC; contenuti generati dagli utenti: sì (recensioni, commenti), con segnalazione |
| Pubblico di destinazione | 18+ (o 13+ se lo decidi tu: cambia gli obblighi) |
| Sicurezza dei dati | raccolti: email, nome utente, contenuti dell'utente (visioni, voti, commenti), identificativi push; nessuna vendita, nessuna pubblicità; cifratura in transito sì; cancellazione account dall'app sì (*Account* → elimina) + URL per la cancellazione |
| App governative / finanziarie / salute | No |

Poi:

1. **Test** → **Test chiuso** → *Gestisci canale* (o crea un canale, es. "Amici") → *Tester*: elenco email o Google Group.
2. **Crea nuova release** → carica l'AAB (stesso o con `versionCode` più alto) → *Salva* → *Invia per la revisione*.
3. La revisione richiede da qualche ora ad alcuni giorni. Poi i tester entrano con il link di partecipazione.

> **Account sviluppatore personale creato dopo il 13 novembre 2023:** per passare alla **produzione** Google chiede un test chiuso con almeno **12 tester** iscritti per **14 giorni consecutivi**. Per restare in test non serve.

## C7. Ogni nuova versione di test

1. In `apps/mobile/app.json`: `android.versionCode` +1 (e `version` se vuoi).
2. `npx expo prebuild --platform android --clean` → rifai le due modifiche di firma (C3) → `./gradlew bundleRelease`.
3. Play Console → canale di test → *Crea nuova release* → carica → pubblica.

## Cosa resta noto e non fatto (lato app)

Da `docs/rebuild/MANCA.md`, rilevante per il test su Play:
- l'app non registra ancora il dispositivo per le notifiche push native (`expo-notifications` presente ma non collegato; servirà anche `google-services.json` di Firebase, gratuito);
- niente accesso con Google, niente account di revisione;
- mai provata su emulatore o telefono vero: il test interno è la prima prova reale.
