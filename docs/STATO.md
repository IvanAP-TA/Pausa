# Pausa — Stato

**Aggiornato:** 15 novembre 2026

## Riepilogo

Fase 1 + 2 + 3 **complete in codice**, **tutto mockato** (zero chiavi), gira in locale.

- 39 test verdi · typecheck pulito · build produzione OK
- `sloplint` (audit anti-slop Hallmark) = clean
- Design conforme a §3 (Midnight Screening Room) — verificato con screenshot reali

## Cosa c'è (sintesi)

- **Fase 1**: Cerchie, diario film, rating mezze stelle, commenti+spoiler, reazioni, "visto con", liste, feed, notifiche, auth custom (demo/Google/magic-link).
- **Fase 2**: Serata (Bracket + Tavolo), guest-first, Card 9:16, Now Watching, realtime via polling (mock).
- **Fase 3**: film+serie+anime, import Letterboxd/AniList (mock), raccomandazioni + confronto gusti, Year in Review, PWA installabile.

Dettaglio completo: [FASI.md](FASI.md).

## Avvio rapido (demo, senza chiavi)

```bash
cd pausa
npx wrangler d1 migrations apply pausa --local   # prima volta
npm run dev
```
http://localhost:3000 → "Entra in demo". Guida: [AVVIO-E-DEPLOY.md](AVVIO-E-DEPLOY.md).

## Per il reale

Serve mettere `MOCK_MODE=0` + le chiavi (TMDB, Cloudflare, Google, Resend, AUTH_SECRET): [MOCK.md](MOCK.md).

## Documentazione completa

Vedi [README.md](README.md) per l'indice: architettura, fasi, design, mock, avvio/deploy, test.

## Deviazioni dal prompt (sintesi)

- Package manager **npm** (pnpm non installabile).
- App in sottocartella `pausa/` (nome "Ivan progetto" non valido come package npm).
- Adapter **@opennextjs/cloudflare** (next-on-pages non supporta Next 15.5+).
- Auth **custom** (Lucia deprecata).
- Raccomandazioni in **TypeScript** (non servizio Rust).
- Realtime via **polling** (non WebSocket/Durable Objects).
- **Design Plan globale** invece che per singola schermata.
