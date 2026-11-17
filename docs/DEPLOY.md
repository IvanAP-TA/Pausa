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

Copia il `database_id` stampato in `wrangler.jsonc` (al posto di `00000000-…`). Poi crea le tabelle sul database vero:

```bash
npm run db:migrate:remote
```

Controllo: `npx wrangler d1 execute pausa --remote --command "select name from sqlite_master where type='table' order by name"` elenca le tabelle (`user`, `circle`, `log`, `serata`, `rate_limit`, `report`…).

> **Mai** eseguire `db:seed:*` sul database vero: sono dati di prova per lo sviluppo.
> Ogni nuova migrazione (cartella `drizzle/`) si applica con lo stesso comando.

## 2. Variabili e segreti

Due tipi. I **segreti** non finiscono mai nel repository: si impostano con `npx wrangler secret put NOME` (chiede il valore). Le **variabili** non segrete vanno in `wrangler.jsonc` sotto `"vars"` oppure nel pannello Cloudflare (Workers → pausa → Settings → Variables).

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

## 3. Primo deploy

```bash
NEXT_PUBLIC_VAPID_PUBLIC_KEY=la_chiave_pubblica npm run deploy
```

(su PowerShell: `$env:NEXT_PUBLIC_VAPID_PUBLIC_KEY="..."; npm run deploy`). La build impiega alcuni minuti. Alla fine wrangler stampa un indirizzo `https://pausa.<tuo-account>.workers.dev`.

Controlli, in quest'ordine:

1. `https://…workers.dev/it` mostra la landing.
2. `https://…workers.dev/api/health/engine` risponde `{"engine":"wasm", …}`. Se risponde `"typescript"` il sito funziona ma usa il ripiego più lento: controlla che `src/lib/engine/engine.wasm` sia nel repository e che `wrangler.jsonc` abbia `"main": "worker.ts"`.
3. Registrati con la tua email: deve arrivare il link e portarti dentro. Crea una Cerchia, registra una visione.
4. Apri una Serata e il suo link da un'altra finestra in incognito (ospite): deve entrare con un nome.

## 4. Dominio

Cloudflare → Workers & Pages → `pausa` → Settings → **Domains & routes** → Add → Custom domain → `pausa.gnagno.org`. Il DNS si configura da solo se il dominio è su Cloudflare. Poi:

- imposta `BETTER_AUTH_URL=https://pausa.gnagno.org` e rilancia `npm run deploy`;
- controlla `https://pausa.gnagno.org/sitemap.xml`, `/robots.txt`, `/llms.txt`;
- Search Console e Bing Webmaster Tools: aggiungi il dominio e invia `https://pausa.gnagno.org/sitemap.xml`.

## 5. Google (facoltativo)

1. console.cloud.google.com → nuovo progetto.
2. **Schermata di consenso OAuth**: tipo "Esterno"; nome Pausa; link a `https://pausa.gnagno.org/it/privacy` e `/it/terms`; dominio autorizzato `gnagno.org`; ambiti: email e profilo.
3. **Credenziali → ID client OAuth → Applicazione web**. URI di reindirizzamento autorizzato: `https://pausa.gnagno.org/api/auth/callback/google`.
4. Imposta `GOOGLE_CLIENT_ID` (variabile) e `GOOGLE_CLIENT_SECRET` (segreto); rilancia il deploy. Il pulsante "Continua con Google" compare da solo.
5. Pubblica l'app ("In produzione"), altrimenti entrano solo gli utenti di prova.

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
| "Error 1102 / exceeded CPU" | piano gratuito: passare al piano a pagamento |
| `/api/health/engine` dice `typescript` | `engine.wasm` non incluso nel bundle (vedi controllo 2 del primo deploy) |
| Le notifiche non si attivano | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` non era impostata durante la build |
| Errori su `database_id` | `wrangler.jsonc` ha ancora l'id segnaposto |
| 404 su ogni pagina | `BETTER_AUTH_URL` sbagliato o rotta del dominio non attiva |
