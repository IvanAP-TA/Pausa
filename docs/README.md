# Pausa — Documentazione

**Pausa** è un "Letterboxd a circuito chiuso": il diario sociale **privato** di un gruppo di amici (Cerchia) su film, serie e anime, con un motore di decisione di gruppo (la Serata) e raccomandazioni basate sui gusti reali.

Dominio previsto: `pausa.gnagno.org`.

## Stato (15 novembre 2026)

Fase 1 + 2 + 3 **complete in codice**, tutto **mockato** (nessuna chiave esterna richiesta), gira in locale.

- 39 test verdi · typecheck pulito · build di produzione OK
- `sloplint` (audit anti-AI-slop di Hallmark) = clean
- Design conforme alla direzione artistica del prompt (§3 Midnight Screening Room)

## Indice

| Documento | Contenuto |
|---|---|
| [STATO.md](STATO.md) | Stato sintetico + avvio rapido |
| [ARCHITETTURA.md](ARCHITETTURA.md) | Stack, struttura cartelle, modello dati, moduli |
| [FASI.md](FASI.md) | Cosa include ogni fase e com'è stata realizzata |
| [DESIGN.md](DESIGN.md) | Design system, conformità §3, skill §9, regole anti-slop |
| [MOCK.md](MOCK.md) | Cosa è finto e come passare al reale |
| [AVVIO-E-DEPLOY.md](AVVIO-E-DEPLOY.md) | Avvio locale demo + deploy Cloudflare |
| [TEST.md](TEST.md) | Testing e verifica |
| `superpowers/specs/` | Spec Fase 1 (brainstorming) |
| `superpowers/plans/` | Piano di implementazione Fase 1 |

## Fonte di verità prodotto

Il file `../MASTER_PROMPT_PAUSA(1).md` (v2.3) è la spec di prodotto originale. Questa documentazione descrive cosa è stato effettivamente costruito.

## Avvio in 3 comandi

```bash
cd pausa
npx wrangler d1 migrations apply pausa --local   # solo la prima volta
npm run dev
```

Apri http://localhost:3000 → "Entra in demo".
