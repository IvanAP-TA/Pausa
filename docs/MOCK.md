# Mock — cosa è finto e come passare al reale

Tutto gira **senza nessuna chiave esterna**. L'interruttore è `MOCK_MODE` in `pausa/.dev.vars`.

## Cosa è mockato

| Area | Mock | File | Reale (Fase futura) |
|---|---|---|---|
| **TMDB** (dati film/serie/anime) | Catalogo locale di ~15 titoli reali (poster veri via image.tmdb.org) | `src/modules/tmdb/mock.ts` | API TMDB con `TMDB_API_KEY` |
| **Auth** | Login demo: solo nome, nessuna password | `src/app/api/auth/dev/route.ts` (attivo solo con `MOCK_MODE=1`) | Google OAuth + magic-link (Resend) |
| **Realtime Serata** | Polling: refresh ogni 2,5s | `src/ui/components/LivePoll.tsx` | WebSocket / Durable Objects |
| **Raccomandazioni** | Funzione TypeScript | `src/modules/recs/index.ts` | Servizio Rust separato |
| **Import storico** | Dataset campione Letterboxd/AniList | `importAction` in `src/app/_actions.ts` | Parser file reali / API AniList |
| **Filtri streaming** | Lista dimostrativa | `app/circles/[id]/insights/page.tsx` | API disponibilità (JustWatch/TMDB) |

Come funziona lo switch TMDB: `searchMedia`/`getOrCacheMovie` controllano se `apiKey` è vuota o `"mock"` → usano il catalogo locale, altrimenti chiamano TMDB vero.

## Passare al reale

1. In `pausa/.dev.vars` metti `MOCK_MODE=0` e compila i valori:
   ```
   MOCK_MODE=0
   TMDB_API_KEY=<la tua>
   GOOGLE_CLIENT_ID=<...>
   GOOGLE_CLIENT_SECRET=<...>
   RESEND_API_KEY=<...>
   AUTH_SECRET=<stringa random lunga>
   APP_URL=http://localhost:3000
   ```
2. Con `MOCK_MODE=0` il login demo (`/api/auth/dev`) è disattivato (404); valgono Google + magic-link.
3. Cookie di sessione: `secure` diventa `true` (richiede https; in locale usa `MOCK_MODE=1` oppure tunnel https).

## Dove prendere le chiavi (reale)

- **TMDB**: account gratuito → API key (uso non commerciale, attribuzione obbligatoria già presente nel footer).
- **Google OAuth**: Google Cloud Console → OAuth client; redirect `=<APP_URL>/api/auth/google/callback`.
- **Resend**: account → API key (per le email magic-link).
- **AUTH_SECRET**: una stringa casuale lunga (firma i token magic-link).
