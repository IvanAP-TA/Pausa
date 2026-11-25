# Pausa

Diario privato di film, serie e anime per gruppi di amici (Cerchie), più la Serata: un voto di gruppo per decidere cosa guardare.

| Cartella | Cosa |
|---|---|
| `crates/api` | API Rust su Cloudflare Workers (`workers-rs`), D1, Durable Object della Serata |
| `crates/core`, `crates/engine` | logica condivisa e motore di raccomandazione |
| `apps/mobile` | client Expo: Android + web statico (servito dal Worker) — vedi il suo README |
| `packages/api-types` | tipi TypeScript generati dal Rust (`cargo test`) |
| `packages/messages` | testi it/en/es |
| `migrations/` | schema D1 |
| `tools/` | stack locale, smoke test dell'API, migrazione dati v1→v2, generatore VAPID |
| `docs/DEPLOY.md` | messa online su Cloudflare, pulizia del vecchio sito, rilascio in test su Google Play |
| `docs/rebuild/` | piano, inventario, lacune, budget e stato del rifacimento |
| `DESIGN.md`, `design/` | sistema visivo (token in `design/tokens.css`) |

## Sviluppo locale

```bash
npm ci                          # wrangler (radice)
node tools/dev-stack.mjs        # API locale (wrangler dev --local) + catalogo finto
node tools/run-smoke.mjs        # build del Worker + suite smoke dell'API
cargo test --workspace          # test Rust (rigenera packages/api-types)
cd apps/mobile && npm ci && npm run check
```
