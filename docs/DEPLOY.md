# Mettere Pausa online

Per chi riceve il progetto. Si parte dal repository e da un account Cloudflare. Tutto il resto è qui. Dopo ogni passo c'è un controllo: se non passa, fermati e correggi prima di andare avanti.

Per capire come è fatto il progetto: `docs/ARCHITETTURA.md`.

## 0. Prima di cominciare

- **Node 22** (`node -v`) e **npm**.
- Un account **Cloudflare** e un dominio gestito lì (il progetto prevede `pausa.gnagno.org`).
- Il piano **Workers a pagamento** (circa 5 $/mese): il piano gratuito dà 10 ms di CPU per richiesta e Next.js su Workers spesso ne richiede di più. Provalo prima sul gratuito; se vedi errori "exceeded CPU", passa al piano a pagamento.
- Non serve installare Rust: il motore delle raccomandazioni è già compilato (`src/lib/engine/engine.wasm`).

```bash
npm ci
npx wrangler login
```

Controllo: `npx wrangler whoami` mostra il tuo account.

## 1. Database

```bash
npx wrangler d1 create pausa
```

Copia il `database_id` stampato in `wrangler.jsonc` (al posto di `00000000-…`). Se Wrangler aggiunge automaticamente una seconda voce al file, conserva una sola voce per `pausa`, con `"binding": "DB"`, l'identificativo vero e `"migrations_dir": "drizzle"`.

Poi crea le tabelle sul database vero:

```bash
npm run db:migrate:remote
```

Controllo: `npx wrangler d1 execute pausa --remote --command "select name from sqlite_master where type='table' order by name"` elenca le tabelle (`user`, `circle`, `log`, `serata`, `rate_limit`, `report`…).

> **Mai** eseguire `db:seed:*` sul database vero: sono dati di prova per lo sviluppo.
> Ogni nuova migrazione (cartella `drizzle/`) si applica con lo stesso comando.

## 2. Variabili e segreti

Due tipi. I **segreti** non finiscono mai nel repository: si impostano con `npx wrangler secret put NOME` (chiede il valore). Le **variabili** non segrete vanno in `wrangler.jsonc` sotto `"vars"` oppure nel pannello Cloudflare (Workers → pausa → Settings → Variables). `wrangler.jsonc` ha `"keep_vars": true`, quindi le variabili scritte nel pannello non vengono cancellate dai deploy successivi (senza, ogni deploy le azzera: il segno tipico è il pulsante Google che sparisce, perché `GOOGLE_CLIENT_ID` è una variabile e `GOOGLE_CLIENT_SECRET` un segreto). Se il pulsante manca, controlla che **entrambi** esistano nel Worker; in alternativa imposta anche l'id come segreto con `npx wrangler secret put GOOGLE_CLIENT_ID`.

Anche i valori non segreti possono essere salvati con `wrangler secret put`: per `ADMIN_EMAILS`, `CONTACT_EMAIL` e `LEGAL_ENTITY` permette di non versionare gli indirizzi email e i dati del titolare. Non definire lo stesso nome anche in `"vars"`.

| Nome | Tipo | A cosa serve | Dove si ottiene |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | segreto | firma le sessioni | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | variabile | indirizzo pubblico, es. `https://pausa.gnagno.org` | — |
| `RESEND_API_KEY` | segreto | invio dei link di accesso | resend.com → API Keys. **Senza, nessuno può accedere.** |
| `EMAIL_FROM` | variabile | mittente, es. `Pausa <accesso@pausa.gnagno.org>` | deve essere un dominio verificato su Resend (SPF e DKIM) |
| `TMDB_API_TOKEN` | segreto | ricerca titoli, locandine, dove si guarda | themoviedb.org → Impostazioni → API → "API Read Access Token" (v4). Uso non commerciale. |
| `GOOGLE_CLIENT_ID` | variabile | accesso con Google (facoltativo) | vedi sezione 5 |
| `GOOGLE_CLIENT_SECRET` | segreto | idem | idem |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | **variabile di build** | notifiche push (chiave pubblica) | `node scripts/vapid.cjs` |
| `VAPID_PRIVATE_KEY` | segreto | notifiche push (chiave privata) | stessa coppia di sopra |
| `VAPID_SUBJECT` | variabile | contatto per i servizi push, es. `https://pausa.gnagno.org` | — |
| `ADMIN_EMAILS` | variabile | chi può aprire `/it/admin/metrics` e `/it/admin/reports` (email separate da virgola) | — |
| `CONTACT_EMAIL` | variabile | contatto mostrato in privacy e termini | — |
| `LEGAL_ENTITY` | variabile | titolare del trattamento mostrato in privacy e termini | — |
| `SENTRY_DSN` | segreto, facoltativo | segnalazione degli errori a Sentry | sentry.io → progetto → DSN |
| `NEXT_PUBLIC_CF_ANALYTICS_TOKEN` | **variabile di build**, facoltativa | contatore visite senza cookie (Cloudflare Web Analytics) | Cloudflare → Web Analytics → aggiungi il sito → token del beacon. Serve per sapere quanti visitatori della landing si iscrivono. |
| `NEXT_PUBLIC_SITE_URL` | variabile, facoltativo | se diverso da `BETTER_AUTH_URL` | — |

Note: `RESEND_API_KEY` serve anche al riepilogo email giornaliero (opzionale per chi lo attiva dall'account). AniList e Jikan (MyAnimeList) sono API pubbliche e non vogliono chiavi. `wrangler.jsonc` ha **due cron**: `17 3 * * *` (pulizia) e `0 17 * * *` (riepilogo email); vengono creati dal deploy, non servono altri passaggi.

**Importante:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` entra nel codice **durante la build**, quindi deve esistere quando lanci `npm run deploy` (vedi sotto), non solo nel pannello Cloudflare. Le chiavi VAPID vanno **generate di nuovo** per la produzione (`node scripts/vapid.cjs`): quelle del computer di sviluppo non si riutilizzano.

Esempio:

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put TMDB_API_TOKEN
npx wrangler secret put VAPID_PRIVATE_KEY
```

## 2b. Resend: cosa fare, passo per passo

Resend è il servizio che spedisce le email di accesso (e il riepilogo giornaliero). Senza, in produzione nessuno entra.

1. Crea l'account su resend.com (il piano gratuito basta per cominciare).
2. **Domains → Add Domain**: aggiungi `pausa.gnagno.org` (o `gnagno.org`). Resend mostra 3-4 record DNS (SPF, DKIM, e uno MX per i rimbalzi). Aggiungili dove è gestito il DNS (Cloudflare → DNS → Records, con la nuvola **grigia**, "solo DNS") e premi **Verify**. Di solito servono pochi minuti.
3. **API Keys → Create API Key**, permesso "Sending access", dominio quello verificato. Copia la chiave (si vede una volta sola).
4. `npx wrangler secret put RESEND_API_KEY` e incolla la chiave.
5. `EMAIL_FROM` (variabile in `wrangler.jsonc`): un indirizzo del dominio verificato, es. `Pausa <accesso@pausa.gnagno.org>`.
6. Prova: registrati dal sito con la tua email, il link deve arrivare entro un minuto (guarda anche in spam la prima volta).

## 2c. Segreti di GitHub (solo se il deploy parte da GitHub Actions)

Il file `.github/workflows/deploy.yml` si avvia a mano (Actions → Deploy → Run workflow). Settings → Secrets and variables → Actions, meglio dentro l'*environment* **production** (Settings → Environments), perché il workflow lo usa:

| Nome | Tipo | Valore | Quando |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | token Cloudflare con i permessi *Workers Scripts: Edit*, *D1: Edit*, *Workers Routes: Edit* (dash.cloudflare.com → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" + D1) | dopo aver creato l'account Cloudflare |
| `CLOUDFLARE_ACCOUNT_ID` | secret | l'id dell'account (barra laterale destra della dashboard) | idem |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | **variable** (non secret) | la chiave pubblica di `node scripts/vapid.cjs` | si può già mettere: generala una volta e tieni la privata per il passo successivo |

Gli altri segreti (`BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `TMDB_API_TOKEN`, `VAPID_PRIVATE_KEY`, `GOOGLE_CLIENT_SECRET`) **non vanno su GitHub**: vivono dentro Cloudflare, impostati con `wrangler secret put`, e il deploy non li tocca.

## 3. Primo deploy

```bash
export NEXT_PUBLIC_VAPID_PUBLIC_KEY='la_chiave_pubblica'
npm run deploy
```

(su PowerShell: `$env:NEXT_PUBLIC_VAPID_PUBLIC_KEY="..."; npm run deploy`). Ripeti l'impostazione della chiave pubblica se apri un nuovo terminale, prima di ogni build o deploy. La build impiega alcuni minuti. Alla fine wrangler stampa un indirizzo `https://pausa.<tuo-account>.workers.dev`.

Controlli, in quest'ordine:

1. `https://…workers.dev/it` mostra la landing.
2. `https://…workers.dev/api/health/engine` risponde `{"engine":"wasm", …}`. Se risponde `"typescript"` il sito funziona ma usa il ripiego più lento: controlla che `src/lib/engine/engine.wasm` sia nel repository e che `wrangler.jsonc` abbia `"main": "worker.ts"`.

Se `BETTER_AUTH_URL` è già `https://pausa.gnagno.org`, aspetta di collegare quel dominio prima di provare l'accesso: i link email puntano all'indirizzo configurato.

## 4. Dominio

Cloudflare → Workers & Pages → `pausa` → Settings → **Domains & routes** → Add → Custom domain → `pausa.gnagno.org`. Il DNS si configura da solo se il dominio è su Cloudflare. Il dominio collegato è anche dichiarato in `wrangler.jsonc` con `"routes": [{ "pattern": "pausa.gnagno.org", "custom_domain": true }]`: mantieni coerenti dashboard e configurazione se lo cambi. Poi:

- se `BETTER_AUTH_URL` non è già `https://pausa.gnagno.org`, aggiornalo e rilancia `npm run deploy` con la chiave pubblica VAPID impostata;
- sul dominio definitivo, registrati con la tua email: deve arrivare il link e portarti dentro. Crea una Cerchia, registra una visione;
- apri una Serata e il suo link da un'altra finestra in incognito (ospite): deve entrare con un nome;
- controlla `https://pausa.gnagno.org/sitemap.xml`, `/robots.txt`, `/llms.txt`;
- Search Console e Bing Webmaster Tools: aggiungi il dominio e invia `https://pausa.gnagno.org/sitemap.xml`.

## 5. Google (facoltativo)

1. console.cloud.google.com → nuovo progetto.
2. **Google Auth Platform → Branding**: nome Pausa; email di assistenza e contatto sviluppatore; home page `https://pausa.gnagno.org/it`; privacy `https://pausa.gnagno.org/it/privacy`; termini `https://pausa.gnagno.org/it/terms`; dominio autorizzato `gnagno.org`. In **Pubblico / Audience**, scegli "Esterno".
3. **Accesso ai dati / Data Access**: seleziona solo `openid`, `https://www.googleapis.com/auth/userinfo.email` e `https://www.googleapis.com/auth/userinfo.profile`. Devono risultare ambiti non sensibili; non servono API o permessi Gmail, Drive o Calendar.
4. Per la prima prova lascia lo stato **Testing** e aggiungi il tuo account Google in **Pubblico / Audience → Utenti di prova**.
5. **Client / Clients → Crea client → Applicazione web**, nome "Pausa Web". URI di reindirizzamento autorizzato: `https://pausa.gnagno.org/api/auth/callback/google`, senza prefisso della lingua. Le origini JavaScript possono restare vuote per questo flusso server. Conserva Client ID e Client secret nel gestore di password: il segreto viene mostrato solo alla creazione, non salvarlo nel repository.
6. Salva i valori sul Worker, uno alla volta: `npx wrangler secret put GOOGLE_CLIENT_ID`, poi `npx wrangler secret put GOOGLE_CLIENT_SECRET`. Anche l'id può essere salvato come segreto; in alternativa può essere una variabile, preservata da `"keep_vars": true`. Sul sito già pubblicato, `secret put` aggiorna il Worker senza rifare la build. Il pulsante "Continua con Google" compare quando entrambi i valori sono presenti.
7. Prova l'accesso in una finestra in incognito su `https://pausa.gnagno.org/it/sign-in`. Per il lancio vai in **Pubblico / Audience → Pubblica app** e controlla che lo stato diventi **In produzione**; completa eventuali verifiche richieste da Google. Ripeti l'accesso anche con un account non incluso negli utenti di prova.

Nota: Google non funziona dentro i browser di WhatsApp e Instagram; il codice nasconde il pulsante lì e offre il link via email. Chi entra con Google e poi con email (stessa casella) finisce sullo stesso account.

## 6. Dopo il lancio

- **Pulizia automatica**: un lavoro pianificato (ogni giorno alle 03:17 UTC, in `wrangler.jsonc`) elimina ospiti vecchi senza Cerchia, sessioni e link scaduti. Controllo: Cloudflare → pausa → Logs, cerca `[pausa] cleanup`.
- **Backup**: D1 ha *Time Travel* (ripristino a un istante passato). Per una copia a mano: `npx wrangler d1 export pausa --remote --output=backup.sql`.
- **Errori**: se imposti `SENTRY_DSN` ogni errore del server arriva a Sentry; altrimenti guarda i log in Cloudflare.
- **Metriche**: `https://pausa.gnagno.org/it/admin/metrics` (solo `ADMIN_EMAILS`). "n.d." significa "non ci sono ancora dati".
- **Segnalazioni dei contenuti**: `/it/admin/reports` (solo `ADMIN_EMAILS`).
- **Notifiche push**: dall'account, "Attiva le notifiche". Su iPhone funzionano solo dall'app aggiunta alla schermata Home. Richiedono HTTPS.

## 7. Cose che restano a chi mette online

Non sono nel codice e non le posso fare per te:

- **Revisione legale** di `/it/privacy` e `/it/terms` (testi in `src/lib/legal.ts`): sono una bozza scritta da quello che fa il codice.
- Accordi sul trattamento dei dati con Cloudflare, Resend (e Google se lo attivi); registro dei trattamenti.
- **TMDB**: la chiave gratuita è solo per uso non commerciale. Se il prodotto genera ricavi serve una licenza.
- **Prove su telefono vero** (`docs/PHONE_TEST.md`): browser dentro WhatsApp e Instagram, notifiche push, installazione.
- **App nativa** (`src-tauri/`): installer firmati, Android, iOS, store. Il guscio apre il sito, quindi va provato solo dopo il deploy.
- **Contatore senza cookie** per misurare la landing (per esempio Cloudflare Web Analytics, si attiva dal pannello senza toccare il codice).

## 8. Se qualcosa non va

| Sintomo | Causa probabile |
|---|---|
| Nessuno riceve il link di accesso | `RESEND_API_KEY` mancante o dominio non verificato su Resend. In produzione il codice non scrive mai i link nei log: fallisce apposta. |
| La ricerca di film noti non trova titoli | Controllare `TMDB_API_TOKEN`: serve un **API Read Access Token** valido, non la chiave v3. Un `401` da TMDB indica una credenziale rifiutata; aggiornare il segreto con `npx wrangler secret put TMDB_API_TOKEN`, senza rifare la build. |
| "Error 1102 / exceeded CPU" | piano gratuito: passare al piano a pagamento |
| Il dominio rimanda a `cloudflareaccess.com` | Cloudflare Access protegge il sito prima dell'app: controllare in Zero Trust se la protezione è voluta o appartiene a una vecchia applicazione. Non rimuoverla senza verificare. |
| `/api/health/engine` dice `typescript` | `engine.wasm` non incluso nel bundle (vedi controllo 2 del primo deploy) |
| Le notifiche non si attivano | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` non era impostata durante la build |
| Errori su `database_id` | `wrangler.jsonc` ha ancora l'id segnaposto |
| 404 su ogni pagina | `BETTER_AUTH_URL` sbagliato o rotta del dominio non attiva |
