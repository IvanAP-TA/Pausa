# Brief comune per gli agenti dell'allineamento a legacy

Progetto: `C:\Users\Giuseppe\Desktop\Personal Project\Pausa` (ramo `main`, modifiche locali NON committate).
App nuova = `apps/mobile` (Expo / React Native, export web) + API Rust su Cloudflare Workers (`crates/api`, `crates/core`).
Obiettivo: ogni schermata dell'app nuova **identica** al ramo `legacy` (Next.js) per grafica e funzioni.

## Dove guardare
- Checklist e inventario: `docs/rebuild/ALLINEAMENTO-LEGACY.md` (la tua parte è indicata nel tuo prompt).
- Legacy (solo lettura): `C:/devkitPro/msys2/tmp/claude/5ed7f0291d11be4d/c3d109e7-a261-475d-babd-4560e0883442/scratchpad/legacy`
  - pagine: `src/app/[locale]/c/[circleId]/...`, componenti `src/components/`, query `src/lib/data.ts`, CSS `src/app/globals.css`.
- Sistema grafico: `DESIGN.md` (nella root del ramo legacy) e le primitive già portate in `apps/mobile/src/ui/`:
  `Surfaces.tsx` (Well, Reel, DayHead, Chapter, EmptyMark, Meter decorativo, CheckBox), `Button` (size sm/md/lg, `icon`),
  `Select` (`<select>` sul web, Choice su native), `PersonChip`, `Choice`, `Chip`, `Field`, `Tag`, `Stars` (`size`),
  `Avatar`, `MediaPoster`, `Row/RowList`, icone lucide in `ui/lucide.ts` (aggiungine lì, un import per file, strokeWidth 1.6).
- Esempi recenti fatti bene: `apps/mobile/src/features/diary/{CircleHead,FilterBar,Feed,shared}.tsx`.
  `shared.tsx` contiene `LogCard` (prop `onThread`), `ReactionBar`, `CardList`. `dates.ts` ha `relativeTime`, `dayName`.

## Regole
- **Mai** `git commit`, `git push`, `git stash`, `git checkout` di file. Mai toccare `.github/`.
- Lavori nello stesso albero con altri agenti in parallelo. Tocca **solo i file della tua parte**.
  File condivisi (solo aggiunte piccole, rileggi subito prima di modificare, non riformattare):
  `crates/core/src/dto.rs`, `crates/api/src/lib.rs` (rotte), `packages/api-types/src/index.ts`,
  `packages/messages/{it,en,es}.json`, `apps/mobile/src/ui/lucide.ts`, `apps/mobile/src/api/*.ts`, `apps/mobile/src/features/diary/shared.tsx`.
  Se un Edit fallisce perché il file è cambiato, rileggilo e riapplica solo la tua modifica.
- Testi: tutto in i18n, tre lingue (it/en/es). Riusa le chiavi di legacy (`packages/messages` ha già il catalogo v1); nuove chiavi nel file area della feature se esiste.
- Accessibilità: ogni controllo ≥ 44px su telefono (i `Button size="sm"` sul telefono con `style={{ minHeight: control }}`), nome accessibile,
  `role="progressbar"` vietato per barre decorative (i test lo usano come "sta caricando").
- Colori solo dai token (`useTheme().c`), niente hex. Stili web-only con `web({...})`.
- Rust: dopo aver cambiato `crates/core/src/dto.rs` rigenera i tipi TS con `cargo test -p pausa-core` (cargo è in `~/.cargo/bin`, fuori dal PATH:
  in bash `export PATH="$HOME/.cargo/bin:$PATH"`), poi aggiungi l'export in `packages/api-types/src/index.ts` (ordine alfabetico).
- Query sui log di una Cerchia: visibili solo se condivisi (`log_share`) da chi è ancora membro, escludendo gli autori bloccati
  (`l.user_id NOT IN (SELECT blocked_id FROM user_block WHERE blocker_id = ?)`). Copia lo stile di `crates/api/src/diary.rs::feed_inner`.

## Verifiche che PUOI lanciare
- `cd apps/mobile && npx tsc --noEmit -p .`
- `cd apps/mobile && npx vitest run`
- `export PATH="$HOME/.cargo/bin:$PATH" && cargo check --workspace` e `cargo test -p pausa-core`
- Aggiungi controlli API nel file smoke della tua area (`tools/api-smoke-*.mjs`) ma **NON lanciare** `tools/run-smoke.mjs`,
  `tools/dev-stack.mjs`, `serve-dist`, `npm run build:web` né Playwright: porte condivise e poca RAM. Li lancia il coordinatore alla fine.
- Puoi aggiornare/aggiungere e2e in `apps/mobile/e2e/` per la tua schermata (senza lanciarli).

## Lezioni del primo giro (obbligatorie)
- Il ramo/worktree `legacy` è **solo lettura**: mai modificarlo, mai git su di esso tranne log/show/grep.
- Dopo aver creato un file nuovo verifica con `ls` che esista davvero (percorsi con `[ ]` e `( )`: usa lo strumento Write, non heredoc della shell).
- Se cambi un controllo usato dagli e2e (es. pulsanti → `<select>`), cerca con grep **tutti** gli e2e che lo usano (`apps/mobile/e2e/*.ts`) e aggiornali; i testID che iniziano come altri (es. `log-this` vs `/^log-/`) rompono i conteggi.
- Nelle regex dentro template string scrivi `\\?`, non `\?`.
- Nei test API usa solo titoli che il catalogo finto conosce (`tools/mock-catalog.mjs`: film 603, 194, 807, 27205; serie 1396, 37854).
- Rotte nuove dell'app con parametri: aggiungile anche a `crates/core/src/shell.rs` (Worker, con test) e allo `SHELL` di `apps/mobile/scripts/postexport.mjs`.

## Pagine pubbliche (fase 5): zero JavaScript
Le pagine pubbliche (landing, guide, legali, sign-in statico) vengono esportate **senza JavaScript** (`apps/mobile/scripts/postexport.mjs`,
test `apps/mobile/e2e/zero-js.spec.ts`). Decisione dell'utente: i pezzi interattivi di legacy si rifanno **con CSS e HTML nativo**,
mai con script: `<details>/<summary>` (FAQ, menu), `:target` o radio/checkbox nascoste + `:checked` (tema, demo a passi, schede),
`position: sticky` (header, CTA), `@keyframes`/`animation-timeline: view()` con fallback statico (reveal), `<form>` con `action` per i link.
Il tema scelto con CSS non può salvare il cookie: va bene che valga solo nella pagina (dillo nel rapporto). Rispetta `prefers-reduced-motion`.

## Rapporto finale (breve)
File toccati; cosa è fatto rispetto alla checklist; differenze volute da legacy; cosa NON hai fatto; test aggiunti; esito di tsc/vitest/cargo.
