# Avvio e deploy

## Avvio DEMO (mock, senza chiavi) — consigliato

`.dev.vars` è già configurato con `MOCK_MODE=1`.

```bash
cd pausa
npx wrangler d1 migrations apply pausa --local   # una tantum: crea il DB locale
npm run dev
```

Apri http://localhost:3000 → **"Entra in demo"** (metti un nome).

Giro completo da provare:
1. Crea una Cerchia.
2. `Letterboxd` / `AniList` per importare uno storico mock.
3. **Logga un film** (cerca `matrix`, `breaking`, `attack`…): film, serie e anime.
4. Vota, commenta (con spoiler), reagisci, "sto guardando".
5. **Insight**: Year in Review + confronto gusti + consigli.
6. **Organizza una Serata** (Bracket o Tavolo) → vota → Chiudi → Card 9:16.

Più persone: finestra in incognito, altro nome, entra col codice invito.

## Reset dati locali

```bash
cd pausa
rm -rf .wrangler/state/v3/d1
npx wrangler d1 migrations apply pausa --local
```

## Comandi utili

```bash
npm run dev          # dev server
npm run build        # build produzione (valida tutto)
npm run typecheck    # solo tipi
npm run test         # Vitest
npm run db:generate  # genera migrazione dopo modifica a schema.ts
```

## Deploy Cloudflare (reale)

Richiede account Cloudflare e le chiavi (vedi [MOCK.md](MOCK.md)).

```bash
cd pausa
npx wrangler login
npx wrangler d1 create pausa          # incolla il database_id in wrangler.toml
npx wrangler d1 migrations apply pausa --remote
npx wrangler pages secret put TMDB_API_KEY
npx wrangler pages secret put GOOGLE_CLIENT_ID
npx wrangler pages secret put GOOGLE_CLIENT_SECRET
npx wrangler pages secret put RESEND_API_KEY
npx wrangler pages secret put AUTH_SECRET
npx opennextjs-cloudflare build
npx opennextjs-cloudflare deploy
```

Nota: imposta `MOCK_MODE=0` in produzione (il login demo resta disattivo).

## Prerequisiti ambiente

- Node 24 (presente). npm (presente). pnpm NON installabile (corepack EPERM) → si usa npm.
- Per gli screenshot di verifica si è usato Chrome headless + CDP (vedi [TEST.md](TEST.md)).
