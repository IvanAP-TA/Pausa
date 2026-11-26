# Feedback "salvaci" (26 nov 2026) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sistemare la lista di feedback dell'utente su sidebar, Classifica, Registra, scheda opera, thread del feed, e aggiungere registi/autori (ricerca + pagina regista) e generi stabili (filtro classifica).

**Architecture:** App client `apps/mobile` (Expo Router + React Native Web, lucide, i18n a catalogo base `packages/messages/*.json` + aree `*.messages.ts`). Server Rust su Cloudflare Workers (`crates/api` = handler HTTP, `crates/core` = logica pura testata con `cargo test`, `migrations/` = D1). Tipi API generati da `ts-rs` in `packages/api-types` con `cargo test`. Due nuovi dati in DB: `media_genre` (codici genere stabili) e `person` + `media_person` (regista/creatore/autore); dettagli e filmografia della persona letti al volo da TMDB/AniList (già in cache Workers 1 giorno / 1 ora).

**Tech Stack:** Rust (worker-rs, serde_json, ts-rs), Cloudflare D1, Expo Router 4 / React Native Web, TypeScript, Vitest, Playwright, smoke test Node (`tools/api-smoke-*.mjs`).

## Global Constraints

- **Mai `git commit` / `git push` senza chiedere all'utente** (regola utente su tutti i progetti). I passi "Checkpoint" sotto = fermarsi, riassumere, chiedere se committare. **Mai push su `main`**: parte il deploy in produzione (`.github/workflows/deploy.yml`).
- Costo zero: Cloudflare Free, 10 ms CPU per richiesta, D1 5 M righe lette/giorno. Niente query che leggono tutto il catalogo; niente lavori lunghi in una sola richiesta (il backfill va a lotti piccoli).
- Icone solo da `lucide-react-native`, ri-esportate una per file in `apps/mobile/src/ui/lucide.ts` (`STROKE = 1.6`).
- Testi sempre in 3 lingue: `it`, `en`, `es`. Chiavi nuove in un `*.messages.ts` d'area (non nel catalogo base) salvo dove indicato.
- Pulsanti/target tattili ≥ 44 px (`control`), test a11y esistenti devono restare verdi.
- "Contiene spoiler" e "L'avevo già visto": **solo nascosti nel frontend**. Campi in `LogInput`, colonne DB e API restano.
- Ordinamenti `recent` e `title` restano supportati dal server (usati da smoke test e altri client): spariscono solo dalla UI della Classifica.
- Design: sistema in `DESIGN.md` (raggio 0, liste a righe sotto filetti, un solo colore accento). Nessuno stile nuovo fuori da token `@/theme`.
- PC con poca RAM: non lanciare suite e2e mentre girano agenti o build pesanti.

## Decisioni prese con l'utente (26 nov 2026)

| Tema | Decisione |
|---|---|
| Regista/autore | Completo: tabelle `person` + `media_person`, ricerca TMDB + AniList, pagina regista, ricarico opere esistenti |
| Genere | Tabella `media_genre` con codici stabili (gli stessi 19 slug di `GENRES` in `apps/mobile/src/api/people.ts`, etichette `profile.genres.*`) |
| Click in Classifica | Titolo/nome → Registra con l'opera già scelta; locandina → scheda opera |
| Chi ha visto senza voto | Avatar con trattino al posto del voto, conta per la soglia dei 3 |
| Ordinamento | Un solo ordinamento attivo; 1° click desc, 2° asc, 3° spento. All'apertura nessuno acceso; spento = media voti desc (ordine di oggi) |
| Decadi | Solo quelle con titoli (da `yearMin`/`yearMax` della risposta) |
| Registra, dettagli | Nascosta tutta la sezione "Aggiungi dettagli"; data = oggi automatico |
| Autore anime | Autore originale (AniList "Original Creator" / "Original Story" / "Story & Art" / "Story"); se manca, "Director" |
| Ricerca persone | TMDB + AniList, doppioni con stesso nome fusi |
| Filmografia | Solo da regista (film), creatore (serie), autore originale/regista (anime) |
| "< Indietro" | Visibile solo dopo aver scelto un'opera; riporta alla ricerca |

Assunzioni mie (dichiarate, cambiarle è economico):
- "Ultimo anno" = uscito nell'anno corrente o in quello prima (`yearFrom = anno-1`); "ultimi N anni" = `yearFrom = anno-N`, `yearTo` vuoto.
- Pagina regista vive dentro la Cerchia: `/c/[id]/person/[key]` (i voti mostrati sono della Cerchia). Da Registra (fuori Cerchia) uso la Cerchia corrente (`useCurrentCircle`); se l'utente non ha Cerchie, la pagina mostra la filmografia senza voti su `/person/[key]`.
- Più registi (es. fratelli Coen): mostro tutti, separati da virgola.
- Generi AniList senza corrispondenza (Slice of Life, Sports, Ecchi…) non vengono salvati; ogni anime riceve anche `animation`.

---

## Mappa file

**Server (Rust)**
- Modify `crates/core/src/ranking.rs` — `Dir`, `Filters.dir`, `Filters.genre`, `Title.genres`.
- Create `crates/core/src/genre.rs` — mappa TMDB id / nome AniList → slug.
- Create `crates/core/src/people.rs` — `PersonKey`, ruoli, parsing crediti, ricerca persone, scheda persona/filmografia.
- Modify `crates/core/src/catalog.rs` — `Draft.genre_slugs`, `Draft.people`; `draft_from_tmdb` / `draft_from_anilist` li riempiono.
- Modify `crates/core/src/lib.rs` — `pub mod genre; pub mod people;`.
- Modify `crates/core/src/dto.rs` — `RankingPage.genres`, `MediaDetailDto.authors`, `AuthorDto`, `PersonHitDto`, `PersonPageDto`, `PersonWorkDto`.
- Create `migrations/0003_authors_genres.sql`.
- Modify `crates/api/src/catalog.rs` — query AniList con staff, `store` / `fill_locale` scrivono generi e persone, `fill_catalog_v2` (backfill), `search_people`, `person_page_data`.
- Modify `crates/api/src/stats.rs` — `dir`, `genre`, generi della Cerchia.
- Modify `crates/api/src/media.rs` — `authors` nel dettaglio + riempimento pigro.
- Create `crates/api/src/people_catalog.rs` — handler `GET /api/people/search`, `GET /api/people/:key`.
- Modify `crates/api/src/admin.rs` — `POST /api/admin/catalog-backfill`.
- Modify `crates/api/src/lib.rs` — rotte.
- Modify `tools/mock-catalog.mjs` — crediti, staff, ricerca persone, scheda persona.
- Create `tools/api-smoke-authors.mjs`; Modify `tools/run-smoke.mjs` (aggiunge la suite), `tools/api-smoke-stats.mjs` (dir, genre).
- Create `tools/catalog-backfill.mjs` — chiama l'endpoint admin a lotti.

**Client (`apps/mobile`)**
- Modify `src/features/Shell.tsx` — allineamento Profilo.
- Modify `src/features/diary/Thread.tsx` — allineamento "Aggiungi a una lista".
- Create `src/features/stats/ranking-controls.ts` — logica pura (ciclo ordinamento, preset date, decadi, overflow avatar).
- Modify `src/features/stats/Ranking.tsx` — nuova barra controlli, riga voti con avatar, click rapidi.
- Create `src/features/stats/YearRangeSheet.tsx`, `src/features/stats/VoteAvatars.tsx`.
- Modify `src/features/stats/stats.messages.ts` — testi nuovi.
- Modify `src/features/diary/shared.tsx` — rimuove `CircleNav`; Modify `src/features/stats/Insights.tsx`, `src/features/CircleSettings.tsx` (tolgono l'uso).
- Modify `src/api/stats.ts` — `dir`, `genre`.
- Modify `src/features/diary/LogForm.tsx` — nasconde dettagli, "Sto guardando" solo serie/anime, via "Cambia titolo", "< Indietro".
- Modify `src/features/diary/TitleSearch.tsx` — select Titolo/Regista-autore, risultati persone.
- Create `src/api/people-catalog.ts` — client `searchPeople`, `person`.
- Create `src/features/people/PersonPage.tsx` + `src/features/people/person.messages.ts`.
- Create routes `app/[locale]/(app)/c/[id]/person/[key].tsx`, `app/[locale]/(app)/person/[key].tsx`.
- Create `src/features/diary/Authors.tsx`; Modify `CircleTitle.tsx`, `TitlePage.tsx`.
- Modify `src/ui/lucide.ts` — `Filter`, `CalendarRange`, `ChevronUp` (se mancano).
- Tests: `tests/ranking-controls.test.ts`, `tests/people-catalog.test.ts`, `e2e/people-stats.spec.ts`, `e2e/diary.spec.ts`, nuovo `e2e/authors.spec.ts`.

---

# Parte A — Ritocchi grafici

### Task 1: Sidebar, "Profilo" allineato alle altre voci

Causa: le icone sono 22 px; l'avatar è 24 px dentro un anello di 2 px con `margin: -2` → slot 24 px, testo spostato di 2 px e anello che sborda nel padding.

**Files:**
- Modify: `apps/mobile/src/features/Shell.tsx:159-171`
- Test: `apps/mobile/e2e/shell-align.spec.ts` (nuovo)

**Interfaces:** nessuna nuova.

- [ ] **Step 1: test e2e che misura l'inizio del testo delle voci della colonna**

```ts
// apps/mobile/e2e/shell-align.spec.ts
import { expect, test } from "@playwright/test";
import { signInAs, apiUp } from "./support-diary";

test.use({ viewport: { width: 1280, height: 900 } });

test("sidebar labels start at the same x, Profilo included", async ({ page }) => {
  test.skip(!(await apiUp()), "API not running");
  await signInAs(page, "giulia@pausa.test");
  await page.goto("/it/diary");
  const nav = page.getByRole("navigation").first();
  const links = nav.getByRole("link");
  const xs: number[] = [];
  for (const name of ["Diario", "Serata", "Classifica", "Profilo"]) {
    const label = links.filter({ hasText: name }).first().getByText(name, { exact: true });
    const box = await label.boundingBox();
    xs.push(Math.round(box!.x));
  }
  expect(new Set(xs).size, JSON.stringify(xs)).toBe(1);
});
```

Se `signInAs` / `apiUp` hanno nomi diversi in `e2e/support-diary.ts`, usare gli helper che lì fanno login e controllo API (leggere il file prima).

- [ ] **Step 2: eseguirlo, deve fallire** — `cd apps/mobile && npx playwright test e2e/shell-align.spec.ts` → FAIL, x di "Profilo" diverso di ~2 px.

- [ ] **Step 3: slot fisso 22 px, anello disegnato fuori dal flusso**

```tsx
// Shell.tsx — sostituisce il blocco `avatar={...}` di `profile`
avatar={
  <View style={{ width: 22, height: 22, alignItems: "center", justifyContent: "center" }}>
    <Avatar name={me?.name ?? ""} image={me?.image} size={22} />
    {a.me ? (
      <View aria-hidden style={{ position: "absolute", top: -3, left: -3, right: -3, bottom: -3, borderRadius: 999, borderWidth: 2, borderColor: c.accent }} />
    ) : null}
  </View>
}
```

- [ ] **Step 4: rieseguire** → PASS. Controllare a occhio anche la barra telefono (viewport 412) con uno screenshot: avatar centrato sopra "Profilo".

- [ ] **Step 5: Checkpoint** — riassumere e chiedere se committare.

### Task 2: Thread, select "Aggiungi a una lista" allineata al bottone

**Files:**
- Modify: `apps/mobile/src/features/diary/Thread.tsx:213-255` (`AddToList`)
- Test: `apps/mobile/e2e/diary.spec.ts` (nuovo test nel describe del thread)

- [ ] **Step 1: test che confronta bordo basso e altezza di select e bottone**

```ts
test("add-to-list select and button share the same bottom edge and height", async ({ page }) => {
  // stessa preparazione del test thread esistente: un log con almeno una lista disponibile
  await page.goto(threadUrl);
  const sel = page.getByTestId("add-to-list");
  const btn = page.getByTestId("add-to-list-go");
  const a = (await sel.boundingBox())!;
  const b = (await btn.boundingBox())!;
  expect(Math.abs(a.y + a.height - (b.y + b.height))).toBeLessThanOrEqual(1);
  expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(1);
});
```

(`threadUrl`: riusare la costruzione URL del test thread esistente nello stesso file.)

- [ ] **Step 2: eseguirlo** → FAIL (misurare quanti px: dice se il problema è altezza o allineamento).

- [ ] **Step 3: fix** — il bottone usa l'altezza del suo `size` e il wrapper non lo stira. Nel `View` riga di `AddToList`:

```tsx
<View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.xs }}>
  <Select<string> ... />
  <Button
    ...
    size="md"
    style={{ height: control, minHeight: control, paddingVertical: 0 }}
  />
</View>
```

Se il test mostra che a sbagliare è la select (bordo 1 px che allunga a 46 px), aggiungere in `src/ui/Select.tsx` `boxSizing: "border-box", height: control` allo stile del `<select>` invece del ritocco al bottone. Correggere solo il lato che il test indica.

- [ ] **Step 4: rieseguire** → PASS.
- [ ] **Step 5: Checkpoint.**

---

# Parte B — Classifica

### Task 3: Server, ordinamento ascendente/discendente

**Files:**
- Modify: `crates/core/src/ranking.rs` (enum `Dir`, `Filters.dir`, `rank`)
- Modify: `crates/api/src/stats.rs:174-200` (`ranking_inner` legge `dir`)
- Modify: `apps/mobile/src/api/stats.ts` (`RankingQuery.dir`)
- Test: `crates/core/src/ranking.rs` (mod tests), `tools/api-smoke-stats.mjs`

**Interfaces:**
- Produces: `pub enum Dir { Desc, Asc }`, `Dir::parse(Option<&str>) -> Dir` (default `Desc`), `Filters.dir: Dir`. Query `dir=asc|desc`. TS: `RankingQuery.dir?: "asc" | "desc"`.

- [ ] **Step 1: test Rust**

```rust
#[test]
fn ascending_reverses_the_primary_key_but_not_the_name_tiebreak() {
    let f = |sort, dir| Filters { sort: Some(sort), dir, ..Default::default() };
    assert_eq!(ids(&rank(sample(), &people(), &f(Sort::Avg, Dir::Asc))), ["c", "a", "e", "b"], "worst first; Amélie/Eva tie keeps A before E");
    assert_eq!(ids(&rank(sample(), &people(), &f(Sort::Votes, Dir::Asc))), ["c", "a", "e", "b"]);
    // years in the sample: Eva 1995, Berserk 1997, Amélie 2001, Cars 2006 (Dune left out: no votes)
    assert_eq!(ids(&rank(sample(), &people(), &f(Sort::Year, Dir::Asc))), ["e", "b", "a", "c"], "oldest first");
    assert_eq!(ids(&rank(sample(), &people(), &f(Sort::Avg, Dir::Desc))), ["b", "a", "e", "c"], "desc unchanged");
}
```

- [ ] **Step 2: eseguire** — `~/.cargo/bin/cargo test -p pausa-core ranking` → FAIL ("cannot find type `Dir`").

- [ ] **Step 3: implementare**

```rust
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Dir {
    #[default]
    Desc,
    Asc,
}

impl Dir {
    pub fn parse(s: Option<&str>) -> Dir {
        if s == Some("asc") { Dir::Asc } else { Dir::Desc }
    }
}
```

In `Filters` aggiungere `pub dir: Dir,`. In `rank`, calcolare la chiave primaria a parte e invertirla solo lei:

```rust
    let primary = |a: &Ranked, b: &Ranked| -> std::cmp::Ordering {
        match f.sort.unwrap_or(Sort::Avg) {
            Sort::Votes => b.votes.cmp(&a.votes).then(desc(a.avg.unwrap_or(0.0), b.avg.unwrap_or(0.0))),
            Sort::Year => b.title.year.unwrap_or(0).cmp(&a.title.year.unwrap_or(0)),
            Sort::Recent => b.title.last_watched.cmp(&a.title.last_watched),
            Sort::Title => by_name(&a.title, &b.title).reverse(),
            Sort::Avg => desc(a.avg.unwrap_or(-1.0), b.avg.unwrap_or(-1.0)).then(b.votes.cmp(&a.votes)),
        }
    };
    out.sort_by(|a, b| {
        let p = primary(a, b);
        let p = if f.dir == Dir::Asc { p.reverse() } else { p };
        p.then(by_name(&a.title, &b.title))
    });
```

Nota: `Title` "desc" = Z→A per coerenza; oggi `sort=title` senza `dir` dava A→Z. Per non rompere i client esistenti, in `stats.rs` il default di `dir` per `sort=title` è `Asc`:

```rust
        sort: Some(sort),
        dir: match query_param(req, "dir").as_deref() {
            Some(d) => Dir::parse(Some(d)),
            None if sort == Sort::Title => Dir::Asc,
            None => Dir::Desc,
        },
```

con `let sort = Sort::parse(query_param(req, "sort").as_deref());` sopra `filters`. Import `Dir` in `stats.rs`. Il test esistente sul titolo in `ranking.rs` che usa `Filters { sort: Some(Sort::Title), .. }` va aggiornato con `dir: Dir::Asc`.

- [ ] **Step 4: eseguire** → PASS tutti i test `ranking`.

- [ ] **Step 5: smoke** — in `tools/api-smoke-stats.mjs`, dopo i controlli di ordinamento esistenti:

```js
const asc = await q("dir=asc");
const desc = await q("");
check("ranking: dir=asc is the default order reversed", JSON.stringify(asc.items.map((i) => i.media.id)) === JSON.stringify([...desc.items].reverse().map((i) => i.media.id)) || asc.items[0].avg <= desc.items[0].avg, JSON.stringify(asc.items.map((i) => i.avg)));
check("ranking: sort=title without dir stays A→Z", (await q("sort=title")).items[0].media.title <= (await q("sort=title")).items.at(-1).media.title);
```

Run: `node tools/run-smoke.mjs --only api-smoke-stats` → PASS.

- [ ] **Step 6: client** — `apps/mobile/src/api/stats.ts`: aggiungere `dir?: "asc" | "desc";` a `RankingQuery`.
- [ ] **Step 7: Checkpoint.**

### Task 4: Logica pura dei controlli Classifica

**Files:**
- Create: `apps/mobile/src/features/stats/ranking-controls.ts`
- Test: `apps/mobile/tests/ranking-controls.test.ts`

**Interfaces:**
- Produces:
  - `type SortKey = "avg" | "votes" | "year"`; `type SortState = { key: SortKey; dir: "desc" | "asc" } | null`
  - `nextSort(state: SortState, clicked: SortKey): SortState`
  - `type YearPreset = { id: string; yearFrom?: number; yearTo?: number }` — id: `"all" | "last1" | "last5" | "last10" | "last20" | "d1950"…`
  - `yearPresets(now: number, yearMin: number | null, yearMax: number | null): YearPreset[]`
  - `presetOf(range: { yearFrom?: number; yearTo?: number }, presets: YearPreset[]): string` — id del preset uguale o `"custom"`
  - `splitVotes<T>(all: T[], open: boolean, max = 3): { shown: T[]; hidden: number }`

- [ ] **Step 1: test**

```ts
// apps/mobile/tests/ranking-controls.test.ts
import { describe, expect, it } from "vitest";
import { nextSort, presetOf, splitVotes, yearPresets } from "@/features/stats/ranking-controls";

describe("sort cycle", () => {
  it("off → desc → asc → off on the same key", () => {
    const a = nextSort(null, "avg");
    expect(a).toEqual({ key: "avg", dir: "desc" });
    const b = nextSort(a, "avg");
    expect(b).toEqual({ key: "avg", dir: "asc" });
    expect(nextSort(b, "avg")).toBeNull();
  });
  it("another key starts again at desc and replaces the old one", () => {
    expect(nextSort({ key: "avg", dir: "asc" }, "year")).toEqual({ key: "year", dir: "desc" });
  });
});

describe("year presets", () => {
  it("fixed presets first, then one per decade that has titles", () => {
    const p = yearPresets(2026, 1957, 2024);
    expect(p.map((x) => x.id)).toEqual(["all", "last1", "last5", "last10", "last20", "d1950", "d1960", "d1970", "d1980", "d1990", "d2000", "d2010", "d2020"]);
    expect(p.find((x) => x.id === "last1")).toEqual({ id: "last1", yearFrom: 2025 });
    expect(p.find((x) => x.id === "d1960")).toEqual({ id: "d1960", yearFrom: 1960, yearTo: 1969 });
    expect(p[0]).toEqual({ id: "all" });
  });
  it("no titles: only the fixed presets", () => {
    expect(yearPresets(2026, null, null).map((x) => x.id)).toEqual(["all", "last1", "last5", "last10", "last20"]);
  });
  it("recognises a range as a preset or as custom", () => {
    const p = yearPresets(2026, 1990, 2020);
    expect(presetOf({}, p)).toBe("all");
    expect(presetOf({ yearFrom: 1990, yearTo: 1999 }, p)).toBe("d1990");
    expect(presetOf({ yearFrom: 1993, yearTo: 1999 }, p)).toBe("custom");
  });
});

describe("vote avatars", () => {
  it("shows three and counts the rest until opened", () => {
    expect(splitVotes([1, 2, 3, 4, 5], false)).toEqual({ shown: [1, 2, 3], hidden: 2 });
    expect(splitVotes([1, 2, 3, 4, 5], true)).toEqual({ shown: [1, 2, 3, 4, 5], hidden: 0 });
    expect(splitVotes([1, 2, 3], false)).toEqual({ shown: [1, 2, 3], hidden: 0 });
  });
});
```

- [ ] **Step 2: eseguire** — `cd apps/mobile && npx vitest run tests/ranking-controls.test.ts` → FAIL (modulo mancante).

- [ ] **Step 3: implementare**

```ts
// apps/mobile/src/features/stats/ranking-controls.ts
export type SortKey = "avg" | "votes" | "year";
export type SortState = { key: SortKey; dir: "desc" | "asc" } | null;

/** One sort at a time: first click desc, second asc, third off (the list falls back to best average first). */
export function nextSort(state: SortState, clicked: SortKey): SortState {
  if (!state || state.key !== clicked) return { key: clicked, dir: "desc" };
  return state.dir === "desc" ? { key: clicked, dir: "asc" } : null;
}

export type YearPreset = { id: string; yearFrom?: number; yearTo?: number };

/** "All", the last 1/5/10/20 years, then one decade per decade that holds at least one title (release year). */
export function yearPresets(now: number, yearMin: number | null, yearMax: number | null): YearPreset[] {
  const out: YearPreset[] = [{ id: "all" }, ...[1, 5, 10, 20].map((n) => ({ id: `last${n}`, yearFrom: now - n }))];
  if (yearMin === null || yearMax === null) return out;
  for (let d = Math.floor(yearMin / 10) * 10; d <= yearMax; d += 10) out.push({ id: `d${d}`, yearFrom: d, yearTo: d + 9 });
  return out;
}

export function presetOf(range: { yearFrom?: number; yearTo?: number }, presets: YearPreset[]): string {
  const hit = presets.find((p) => p.yearFrom === range.yearFrom && p.yearTo === range.yearTo);
  return hit ? hit.id : "custom";
}

export function splitVotes<T>(all: T[], open: boolean, max = 3): { shown: T[]; hidden: number } {
  if (open || all.length <= max) return { shown: all, hidden: 0 };
  return { shown: all.slice(0, max), hidden: all.length - max };
}
```

- [ ] **Step 4: eseguire** → PASS.
- [ ] **Step 5: Checkpoint.**

### Task 5: Classifica, barra controlli (tipo, ordinamento, filtri, date) e via il sotto-menu

**Files:**
- Modify: `apps/mobile/src/features/stats/Ranking.tsx`
- Create: `apps/mobile/src/features/stats/YearRangeSheet.tsx`
- Modify: `apps/mobile/src/features/diary/shared.tsx:385-422` (elimina `CircleNav`)
- Modify: `apps/mobile/src/features/stats/Insights.tsx:21,331`, `apps/mobile/src/features/CircleSettings.tsx:17,228` (tolgono import e uso)
- Modify: `apps/mobile/src/features/stats/stats.messages.ts`
- Modify: `apps/mobile/src/ui/lucide.ts`
- Test: `apps/mobile/e2e/people-stats.spec.ts` (riscrive il test "average, votes, sort, filters…")

**Interfaces:**
- Consumes: Task 3 (`dir`), Task 4 (`nextSort`, `yearPresets`, `presetOf`).
- Produces: `YearRangeSheet({ open, onClose, value, onApply, yearMin, yearMax })` con `value/onApply: { yearFrom?: number; yearTo?: number }`. TestID: `kind-movie|kind-tv|kind-anime`, `sort-avg|sort-votes|sort-year` (con `aria-sort`-like `aria-label` che include la direzione), `open-filters`, `open-years`, `year-<presetId>`, `year-custom-from`, `year-custom-to`, `apply-years`.

Insights e Impostazioni restano raggiungibili dalla pagina Cerchia (`CirclePage.tsx:246,249`) e dalla colonna (`CircleAside.tsx:69`): verificato.

- [ ] **Step 1: riscrivere il test e2e** (sostituisce il blocco sort/filters del test "average, votes, sort, filters…"; i dati del seed hanno solo film, quindi il default "Film" mostra le stesse 3 righe):

```ts
test("type tabs, three-state sort, filters with funnel, year range sheet", async () => {
  const { page } = bob;
  await page.goto(`/it/c/${cid}/ranking`);
  const rows = page.getByTestId(/^rank-/);
  await expect(page.getByRole("navigation", { name: /feed|classifica/i })).toHaveCount(0); // no CircleNav
  await expect(page.getByTestId("kind-movie")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: it.ranking.filters.any })).toHaveCount(0); // no "Tutti"
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText(/se7en/i); // off = best average first

  const votes = page.getByTestId("sort-votes");
  await votes.click();
  await expect(votes).toHaveAttribute("data-dir", "desc");
  await expect(rows.first()).toContainText(/matrix/i);
  await votes.click();
  await expect(votes).toHaveAttribute("data-dir", "asc");
  await expect(rows.last()).toContainText(/matrix/i);
  await votes.click();
  await expect(votes).toHaveAttribute("data-dir", "off");
  await expect(rows.first()).toContainText(/se7en/i);
  await expect(page.getByTestId("sort-title")).toHaveCount(0);
  await expect(page.getByTestId("sort-recent")).toHaveCount(0);

  // funnel icon on Filtri
  await expect(page.getByTestId("open-filters").locator("svg")).toHaveCount(1);

  // year range: a decade preset, then custom
  await page.getByTestId("open-years").click();
  await page.getByTestId("year-d1990").click();
  await page.getByTestId("apply-years").click();
  await expect(rows).toHaveCount(2); // Se7en 1995, Matrix 1999
  await page.getByTestId("open-years").click();
  await page.getByTestId("year-custom").click();
  await page.getByTestId("year-custom-from").fill("2010");
  await page.getByTestId("year-custom-to").fill("2010");
  await page.getByTestId("apply-years").click();
  await expect(rows).toHaveCount(1); // Inception
  await page.getByTestId("open-years").click();
  await page.getByTestId("year-all").click();
  await page.getByTestId("apply-years").click();
  await expect(rows).toHaveCount(3);

  await page.getByTestId("kind-tv").click();
  await expect(page.getByText(it.ranking.emptyAll)).toBeVisible();
});
```

Gli altri controlli del vecchio test (ricerca `rank-q`, "visto da", "visti da tutti", "almeno 3") restano, aggiornati togliendo la riga del tipo dal popup.

- [ ] **Step 2: eseguire** → FAIL (`kind-movie` non esiste).

- [ ] **Step 3: icone** — in `src/ui/lucide.ts` aggiungere se assenti:

```ts
export { default as Filter } from "lucide-react-native/icons/funnel";
export { default as CalendarRange } from "lucide-react-native/icons/calendar-range";
export { default as ArrowDown } from "lucide-react-native/icons/arrow-down";
export { default as ArrowUp } from "lucide-react-native/icons/arrow-up";
```

(Verificare in `node_modules/lucide-react-native/dist/esm/icons/` che `funnel` esista; nelle versioni vecchie si chiama `filter`.)

- [ ] **Step 4: testi** — `stats.messages.ts`, dentro `stats.ranking` per ciascuna lingua:

```ts
// it
kindLabel: "Tipo", sortOff: "{label}: nessun ordine", sortDesc: "{label}: decrescente", sortAsc: "{label}: crescente",
years: "Anni di uscita", yearsAll: "Intera durata", yearsLast: "{count, plural, one {Ultimo anno} other {Ultimi # anni}}",
decade: "Anni {short}", decadeFull: "{year}", custom: "Range custom", from: "Dal", to: "Al", apply: "Applica",
// en
kindLabel: "Type", sortOff: "{label}: no order", sortDesc: "{label}: descending", sortAsc: "{label}: ascending",
years: "Release years", yearsAll: "All time", yearsLast: "{count, plural, one {Last year} other {Last # years}}",
decade: "{short}s", decadeFull: "{year}s", custom: "Custom range", from: "From", to: "To", apply: "Apply",
// es
kindLabel: "Tipo", sortOff: "{label}: sin orden", sortDesc: "{label}: descendente", sortAsc: "{label}: ascendente",
years: "Años de estreno", yearsAll: "Todo", yearsLast: "{count, plural, one {Último año} other {Últimos # años}}",
decade: "Años {short}", decadeFull: "{year}", custom: "Rango personalizado", from: "Desde", to: "Hasta", apply: "Aplicar",
```

Etichetta decade: per `d1950`…`d1990` `short = "50"`…`"90"`; da `d2000` in poi `t("stats.ranking.decadeFull", { year: 2000 })` → "2000" (it) / "2000s" (en). Funzione locale in `YearRangeSheet.tsx`:

```ts
const decadeLabel = (t: T, d: number) => (d < 2000 ? t("stats.ranking.decade", { short: String(d).slice(2) }) : t("stats.ranking.decadeFull", { year: d }));
```

- [ ] **Step 5: `YearRangeSheet.tsx`**

```tsx
import { useState } from "react";
import { View } from "react-native";
import { useI18n } from "@/i18n";
import { space } from "@/theme";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { Field } from "@/ui/Field";
import { Sheet } from "@/ui/Sheet";
import { presetOf, yearPresets, type YearPreset } from "./ranking-controls";
import "./stats.messages";

export type YearRange = { yearFrom?: number; yearTo?: number };
const year = (v: string) => (/^\d{4}$/.test(v.trim()) ? Number(v) : undefined);

export function YearRangeSheet({ open, onClose, value, onApply, yearMin, yearMax }: { open: boolean; onClose: () => void; value: YearRange; onApply: (r: YearRange) => void; yearMin: number | null; yearMax: number | null }) {
  const { t } = useI18n();
  const presets = yearPresets(new Date().getFullYear(), yearMin, yearMax);
  const [sel, setSel] = useState<string>(() => presetOf(value, presets));
  const [from, setFrom] = useState(value.yearFrom ? String(value.yearFrom) : "");
  const [to, setTo] = useState(value.yearTo ? String(value.yearTo) : "");
  const label = (p: YearPreset) =>
    p.id === "all" ? t("stats.ranking.yearsAll")
    : p.id.startsWith("last") ? t("stats.ranking.yearsLast", { count: Number(p.id.slice(4)) })
    : decadeLabel(t, Number(p.id.slice(1)));
  const apply = () => {
    const p = presets.find((x) => x.id === sel);
    onApply(p ? { yearFrom: p.yearFrom, yearTo: p.yearTo } : { yearFrom: year(from), yearTo: year(to) });
    onClose();
  };
  return (
    <Sheet title={t("stats.ranking.years")} open={open} onClose={onClose}>
      <View role="radiogroup" aria-label={t("stats.ranking.years")} style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {presets.map((p) => (
          <Chip key={p.id} type="radio" label={label(p)} on={sel === p.id} onPress={() => setSel(p.id)} testID={`year-${p.id}`} />
        ))}
        <Chip type="radio" label={t("stats.ranking.custom")} on={sel === "custom"} onPress={() => setSel("custom")} testID="year-custom" />
      </View>
      {sel === "custom" ? (
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field label={t("stats.ranking.from")} value={from} onChangeText={setFrom} keyboardType="number-pad" maxLength={4} hint={yearMin ? String(yearMin) : undefined} testID="year-custom-from" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("stats.ranking.to")} value={to} onChangeText={setTo} keyboardType="number-pad" maxLength={4} hint={yearMax ? String(yearMax) : undefined} testID="year-custom-to" />
          </View>
        </View>
      ) : null}
      <Button label={t("stats.ranking.apply")} onPress={apply} testID="apply-years" />
    </Sheet>
  );
}
```

Prima di scrivere: leggere `src/ui/Chip.tsx` e verificare che `Chip` accetti `type="radio"` (come `PersonChip type="checkbox"`); se non c'è, usare `role="radio"` + `aria-checked` con la prop che il componente espone. Il nome `T` = tipo di `t` esportato da `@/i18n` (controllare il nome reale).

- [ ] **Step 6: `Ranking.tsx` — stato e barra**

Sostituire `SORTS`, `Draft`, `EMPTY`, `toQuery`, gli stati e il blocco tra `<Heading>` e il risultato:

```tsx
type Kind = "movie" | "tv" | "anime";
type Draft = { q: string; minVotes: string; everyone: boolean; by: string; genre: string };
const EMPTY: Draft = { q: "", minVotes: "", everyone: false, by: "", genre: "" };
const SORT_KEYS: SortKey[] = ["avg", "votes", "year"];

const toQuery = (d: Draft): RankingQuery => ({
  q: d.q.trim() || undefined,
  minVotes: d.minVotes === "" ? undefined : Number(d.minVotes),
  everyone: d.everyone || undefined,
  by: d.by || undefined,
  genre: d.genre || undefined,
});
```

(`genre` arriva col Task 11; fino ad allora tenerlo fuori da `Draft` oppure lasciarlo e ignorarlo lato server: il server lo ignora finché il Task 10 non c'è.)

In `RankingBody`:

```tsx
const [kind, setKind] = useState<Kind>("movie");
const [sort, setSort] = useState<SortState>(null);
const [years, setYears] = useState<YearRange>({});
const [yearsOpen, setYearsOpen] = useState(false);
const query = { ...toQuery(applied), kind, ...years, sort: sort?.key ?? "avg", dir: sort?.dir ?? "desc", page };
const filtered = Object.values(toQuery(applied)).filter((v) => v !== undefined).length;
const yearsOn = years.yearFrom !== undefined || years.yearTo !== undefined;
```

JSX (al posto di `<CircleNav …/>`, del `Choice` ordinamento e della riga Filtri):

```tsx
<Text tone="ink2">{t("ranking.lede")}</Text>
<Choice<Kind>
  label={t("stats.ranking.kindLabel")}
  value={kind}
  onChange={(k) => { setKind(k); setPage(0); }}
  options={(["movie", "tv", "anime"] as const).map((k) => ({ value: k, label: t(`kind.${k}`), testID: `kind-${k}` }))}
/>
<View role="group" aria-label={t("ranking.filters.sort")} style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
  {SORT_KEYS.map((k) => {
    const dir = sort?.key === k ? sort.dir : "off";
    const label = t(`ranking.sort.${k}`);
    return (
      <Button
        key={k}
        label={label}
        variant={dir === "off" ? "secondary" : "primary"}
        icon={dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : undefined}
        accessibilityLabel={t(dir === "off" ? "stats.ranking.sortOff" : dir === "desc" ? "stats.ranking.sortDesc" : "stats.ranking.sortAsc", { label })}
        testID={`sort-${k}`}
        dataSet={{ dir }}
        onPress={() => { setSort((s) => nextSort(s, k)); setPage(0); }}
      />
    );
  })}
</View>
<View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
  <Button label={t("ranking.filters.title")} variant="secondary" icon={Filter} testID="open-filters" onPress={() => { setDraft(applied); setOpen(true); }} />
  <Button label={yearsOn ? `${years.yearFrom ?? "…"}–${years.yearTo ?? "…"}` : t("stats.ranking.years")} variant={yearsOn ? "primary" : "secondary"} icon={CalendarRange} testID="open-years" onPress={() => setYearsOpen(true)} />
  {filtered > 0 ? <Tag tone="accent" label={t("diary.feed.active", { count: filtered })} /> : null}
  {filtered > 0 || yearsOn ? <Button label={t("ranking.filters.reset")} variant="quiet" onPress={() => { setApplied(EMPTY); setYears({}); setPage(0); }} /> : null}
</View>
<YearRangeSheet key={yearsOpen ? "open" : "closed"} open={yearsOpen} onClose={() => setYearsOpen(false)} value={years} onApply={(r) => { setYears(r); setPage(0); }} yearMin={num(rank.data?.yearMin) ?? null} yearMax={num(rank.data?.yearMax) ?? null} />
```

Note per l'implementatore:
- `Choice` accetta `testID` per opzione? Leggere `src/ui/Choice.tsx` (`ChoiceOption`). Se manca, aggiungere `testID?: string` a `ChoiceOption` e passarlo al `Pressable` dell'opzione (modifica minima, retrocompatibile).
- `Button` non ha `dataSet`: aggiungere a `Button.tsx` una prop opzionale `dataSet?: Record<string, string>` passata al `Pressable` (React Native Web la rende come `data-*`; serve al test `data-dir`).
- `yearMin/yearMax` della risposta oggi sono calcolati su **tutti** i tipi: va bene (decadi della Cerchia).
- Nel `Sheet` dei filtri togliere il `Choice` del tipo e i due `Field` anni.
- Togliere import ora inutili (`CircleNav`, `Field` se resta usato solo da `rank-q`: resta).

- [ ] **Step 7: eliminare `CircleNav`** da `diary/shared.tsx` e i suoi due altri usi (Insights, CircleSettings). `npx tsc --noEmit -p apps/mobile` → nessun errore.

- [ ] **Step 8: eseguire l'e2e** (stack: `node tools/dev-stack.mjs --seed`, poi `npm run build:web` e `node scripts/serve-dist.mjs 4173` in `apps/mobile`) — `npx playwright test e2e/people-stats.spec.ts` → PASS.
- [ ] **Step 9: Checkpoint.**

### Task 6: Riga voti con avatar a iniziali ed espansione

**Files:**
- Create: `apps/mobile/src/features/stats/VoteAvatars.tsx`
- Modify: `apps/mobile/src/features/stats/Ranking.tsx` (`PersonTag` sostituito)
- Modify: `apps/mobile/src/features/stats/stats.messages.ts`
- Test: `apps/mobile/e2e/people-stats.spec.ts`

**Interfaces:**
- Consumes: `splitVotes` (Task 4), `Avatar({ name, image?, size })` da `src/ui/Avatar.tsx`.
- Produces: `VoteAvatars({ people: { userId; name; image }[]; ratings: Map<string, number>; meId: string })`. TestID `votes-more`.

- [ ] **Step 1: test e2e** (nel test ranking, sulla riga Matrix che ha 3 voti; per testare l'espansione serve un titolo con ≥4 persone: aggiungere nel `beforeAll` del describe un quarto membro `dan` che vota Matrix 6, con lo stesso helper usato per ann/bob/cara):

```ts
const matrix = rows.filter({ hasText: /matrix/i });
await expect(matrix.getByLabel(`${ANN_NOW}: 4,5 stelle`)).toBeVisible(); // accessible label kept
await expect(matrix.getByText(ANN_NOW, { exact: true })).toHaveCount(0); // name no longer printed
await expect(matrix.getByRole("listitem")).toHaveCount(3);
await matrix.getByTestId("votes-more").click();
await expect(matrix.getByRole("listitem")).toHaveCount(4);
await expect(page.getByRole("dialog")).toHaveCount(0); // inline, no popup
```

- [ ] **Step 2: eseguire** → FAIL.

- [ ] **Step 3: testi** — in `stats.ranking`: it `more: "+{count}"`, `moreLabel: "Mostra altri {count} voti"`, `less: "Mostra meno"`, `noVote: "–"`; en `moreLabel: "Show {count} more votes"`, `less: "Show less"`; es `moreLabel: "Mostrar {count} votos más"`, `less: "Mostrar menos"` (`more`, `noVote` uguali).

- [ ] **Step 4: componente**

```tsx
// apps/mobile/src/features/stats/VoteAvatars.tsx
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useI18n } from "@/i18n";
import { control, hair, space, useTheme, web } from "@/theme";
import { Avatar } from "@/ui/Avatar";
import { starsText } from "@/ui/Stars";
import { Text } from "@/ui";
import { splitVotes } from "./ranking-controls";
import "./stats.messages";

type P = { userId: string; name: string; image?: string | null };

export function VoteAvatars({ people, ratings, meId }: { people: P[]; ratings: Map<string, number>; meId: string }) {
  const { t, locale } = useI18n();
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const { shown, hidden } = splitVotes(people, open);
  return (
    <View role="list" aria-label={t("ranking.who")} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
      {shown.map((p) => {
        const r = ratings.get(p.userId);
        return (
          <View
            key={p.userId}
            role="listitem"
            aria-label={r === undefined ? `${p.name}: ${t("ranking.noRating")}` : `${p.name}: ${t("ranking.rated", { stars: r / 2 })}`}
            style={{ flexDirection: "row", alignItems: "center", gap: space["2xs"], paddingRight: space.xs, borderWidth: hair, borderColor: p.userId === meId ? c.accent : c.rule, minHeight: 32 }}
          >
            <Avatar name={p.name} image={p.image ?? undefined} size={28} />
            <Text aria-hidden variant="small" tone={r === undefined ? "muted" : "ink"} style={{ fontVariant: ["tabular-nums"] }}>
              {r === undefined ? t("stats.ranking.noVote") : starsText(r, locale)}
            </Text>
          </View>
        );
      })}
      {hidden > 0 || open ? (
        <Pressable
          role="button"
          aria-expanded={open}
          aria-label={open ? t("stats.ranking.less") : t("stats.ranking.moreLabel", { count: hidden })}
          testID="votes-more"
          onPress={() => setOpen((o) => !o)}
          style={[{ minHeight: control, minWidth: control, alignItems: "center", justifyContent: "center", borderWidth: hair, borderColor: c.rule }, web({ cursor: "pointer" })]}
        >
          <Text variant="small" tone="ink2">{open ? "−" : t("stats.ranking.more", { count: hidden })}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
```

In `Entry`: `people` deve includere `image` (da `circle.data.members`, campo `image`); sostituire il blocco `role="list"` con `<View style={{ paddingLeft: … }}><VoteAvatars people={tags} ratings={rated} meId={meId} /></View>`. Eliminare `PersonTag` e `first`.

- [ ] **Step 5: eseguire** → PASS. Lanciare anche `e2e/a11y*.spec.ts` (target 44 px).
- [ ] **Step 6: Checkpoint.**

### Task 7: Voto rapido dalla Classifica

**Files:**
- Modify: `apps/mobile/src/features/stats/Ranking.tsx` (`Entry`)
- Modify: `apps/mobile/src/features/stats/stats.messages.ts`
- Test: `apps/mobile/e2e/people-stats.spec.ts`

**Interfaces:** link a `/log?media=<mediaId>&circle=<circleId>` (già gestiti da `NewLog`, `LogForm.tsx:481-510`).

- [ ] **Step 1: test**

```ts
const matrix = rows.filter({ hasText: /matrix/i });
await expect(matrix.getByRole("link", { name: /vota matrix/i })).toHaveAttribute("href", new RegExp(`/it/log\\?media=.+&circle=${cid}`));
await expect(matrix.getByRole("link", { name: /apri matrix/i })).toHaveAttribute("href", new RegExp(`/it/c/${cid}/m/`));
await matrix.getByRole("link", { name: /vota matrix/i }).click();
await expect(page.getByTestId("picked-title")).toContainText(/matrix/i);
await expect(page.getByTestId("media-search")).toHaveCount(0);
```

- [ ] **Step 2: eseguire** → FAIL.
- [ ] **Step 3: testi** — `stats.ranking.vote`: it "Vota {title}", en "Rate {title}", es "Puntuar {title}". (`feed.openTitle` esistente = "Apri {title}" per la locandina.)
- [ ] **Step 4: implementare** — in `Entry`: il `Link` del titolo punta a `href(\`/log?media=${item.media.id}&circle=${circleId}\`)` con `aria-label={t("stats.ranking.vote", { title })}`; la `MediaPoster` viene avvolta in:

```tsx
<Link href={href(`/c/${circleId}/m/${item.media.id}`) as Href} asChild>
  <Pressable role="link" aria-label={t("feed.openTitle", { title: item.media.title })} style={web({ cursor: "pointer" })}>
    <MediaPoster title={item.media.title} path={item.media.posterPath} width={wide ? 56 : 48} />
  </Pressable>
</Link>
```

Verificare che `href()` di `useI18n` preservi la query string (altrove si usa `href("/lists?circle=…")`, quindi sì).

- [ ] **Step 5: eseguire** → PASS.
- [ ] **Step 6: Checkpoint.**

---

# Parte C — Generi stabili

### Task 8: Core, mappa generi

**Files:**
- Create: `crates/core/src/genre.rs`; Modify `crates/core/src/lib.rs` (`pub mod genre;`)
- Modify: `crates/core/src/catalog.rs` (`Draft.genre_slugs: Vec<&'static str>`, riempito in `draft_from_tmdb` e `draft_from_anilist`)

**Interfaces:**
- Produces: `pub const SLUGS: [&str; 18]` (i 19 di `GENRES` client **meno** `anime`), `pub fn from_tmdb(id: i64) -> &'static [&'static str]`, `pub fn from_anilist(name: &str) -> &'static [&'static str]`, `pub fn collect(slugs: impl IntoIterator<Item = &'static str>) -> Vec<&'static str>` (ordinati, senza doppioni). `Draft.genre_slugs`.

- [ ] **Step 1: test** (in fondo a `genre.rs`)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn tmdb_movie_and_tv_ids_map_to_the_same_slugs() {
        assert_eq!(from_tmdb(28), ["action"]);
        assert_eq!(from_tmdb(10759), ["action", "adventure"]);
        assert_eq!(from_tmdb(10765), ["fantasy", "scifi"]);
        assert_eq!(from_tmdb(10768), ["war"]);
        assert!(from_tmdb(10767).is_empty(), "talk shows have no slug");
    }
    #[test]
    fn anilist_names() {
        assert_eq!(from_anilist("Sci-Fi"), ["scifi"]);
        assert_eq!(from_anilist("Mecha"), ["scifi"]);
        assert!(from_anilist("Slice of Life").is_empty());
    }
    #[test]
    fn collect_sorts_and_dedupes() {
        assert_eq!(collect(["scifi", "action", "scifi"]), vec!["action", "scifi"]);
    }
    #[test]
    fn every_mapped_slug_is_known() {
        for id in [28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 53, 10752, 37, 10759, 10762, 10765, 10768] {
            for s in from_tmdb(id) { assert!(SLUGS.contains(s), "{s}"); }
        }
    }
}
```

E in `catalog.rs` tests:

```rust
#[test]
fn drafts_carry_stable_genre_slugs() {
    let tv = json!({"id": 1, "name": "X", "genres": [{"id": 10759, "name": "Azione e avventura"}, {"id": 18, "name": "Dramma"}]});
    assert_eq!(draft_from_tmdb(true, &tv).unwrap().genre_slugs, vec!["action", "adventure", "drama"]);
    let ani = json!({"data": {"Media": {"id": 5, "title": {"romaji": "X"}, "genres": ["Action", "Slice of Life"]}}});
    assert_eq!(draft_from_anilist(&ani).unwrap().genre_slugs, vec!["action", "animation"]);
}
```

- [ ] **Step 2: eseguire** — `~/.cargo/bin/cargo test -p pausa-core genre drafts_carry` → FAIL.

- [ ] **Step 3: implementare**

```rust
//! Stable genre codes, the same in every language: TMDB numeric ids and AniList names map onto the slugs the app already labels
//! (`profile.genres.*`). A genre with no slug is dropped.

pub const SLUGS: [&str; 18] = [
    "action", "adventure", "animation", "comedy", "crime", "documentary", "drama", "family", "fantasy",
    "history", "horror", "musical", "mystery", "romance", "scifi", "thriller", "war", "western",
];

pub fn from_tmdb(id: i64) -> &'static [&'static str] {
    match id {
        28 => &["action"],
        12 => &["adventure"],
        16 => &["animation"],
        35 => &["comedy"],
        80 => &["crime"],
        99 => &["documentary"],
        18 => &["drama"],
        10751 | 10762 => &["family"],
        14 => &["fantasy"],
        36 => &["history"],
        27 => &["horror"],
        10402 => &["musical"],
        9648 => &["mystery"],
        10749 => &["romance"],
        878 => &["scifi"],
        53 => &["thriller"],
        10752 | 10768 => &["war"],
        37 => &["western"],
        10759 => &["action", "adventure"],
        10765 => &["fantasy", "scifi"],
        _ => &[],
    }
}

pub fn from_anilist(name: &str) -> &'static [&'static str] {
    match name {
        "Action" => &["action"],
        "Adventure" => &["adventure"],
        "Comedy" => &["comedy"],
        "Drama" => &["drama"],
        "Fantasy" | "Mahou Shoujo" | "Supernatural" => &["fantasy"],
        "Horror" => &["horror"],
        "Music" => &["musical"],
        "Mystery" => &["mystery"],
        "Romance" => &["romance"],
        "Sci-Fi" | "Mecha" => &["scifi"],
        "Thriller" | "Psychological" => &["thriller"],
        _ => &[],
    }
}

pub fn collect(slugs: impl IntoIterator<Item = &'static str>) -> Vec<&'static str> {
    let mut v: Vec<&'static str> = slugs.into_iter().collect();
    v.sort_unstable();
    v.dedup();
    v
}
```

In `catalog.rs`: campo `pub genre_slugs: Vec<&'static str>,` in `Draft`. In `draft_from_tmdb`: `genre_slugs: crate::genre::collect(genre_ids(body).into_iter().flat_map(|id| crate::genre::from_tmdb(id).iter().copied())),`. In `draft_from_anilist`: dai nomi di `genres` (tutti, non solo i primi 4) `flat_map(from_anilist)` + `"animation"`, poi `collect`.

- [ ] **Step 4: eseguire** → PASS (tutti i test del crate: `cargo test -p pausa-core`).
- [ ] **Step 5: Checkpoint.**

### Task 9: Migrazione e salvataggio di generi (e tabelle persone)

Una sola migrazione per generi e persone (stesso deploy).

**Files:**
- Create: `migrations/0003_authors_genres.sql`
- Modify: `crates/api/src/catalog.rs` (`store`, `fill_locale`)
- Test: `tools/api-smoke-authors.mjs` (nuova, prima parte), `tools/run-smoke.mjs` (elenco suite)

**Interfaces:**
- Produces (schema):

```sql
-- 0003: stable genres and the people behind a title (director / creator / original author).
CREATE TABLE media_genre (
  media_id TEXT NOT NULL REFERENCES media_entity(id) ON DELETE CASCADE,
  genre TEXT NOT NULL,
  PRIMARY KEY (media_id, genre)
) WITHOUT ROWID;
CREATE INDEX media_genre_by_genre ON media_genre(genre, media_id);

CREATE TABLE person (
  id TEXT PRIMARY KEY,
  tmdb_id INTEGER,
  anilist_id INTEGER,
  name TEXT NOT NULL,
  profile_path TEXT,                  -- TMDB path or AniList https URL
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX person_tmdb_uq ON person(tmdb_id) WHERE tmdb_id IS NOT NULL;
CREATE UNIQUE INDEX person_anilist_uq ON person(anilist_id) WHERE anilist_id IS NOT NULL;

CREATE TABLE media_person (
  media_id TEXT NOT NULL REFERENCES media_entity(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('director', 'creator', 'author')),
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (media_id, person_id, role)
) WITHOUT ROWID;
CREATE INDEX media_person_by_person ON media_person(person_id);

-- NULL = genres/people never fetched for this title (titles stored before 0003): filled lazily and by the admin backfill.
ALTER TABLE media_entity ADD COLUMN catalog_v2_at INTEGER;
```

- Produces (Rust): `async fn write_v2(db: &D1Database, media_id_sql: (&str, Vec<JsValue>), d: &Draft) -> R<Vec<D1PreparedStatement>>` — statement che inseriscono generi e persone e impostano `catalog_v2_at`, da appendere ai batch di `store` e `fill_locale`. Le persone arrivano dal Task 12 (`d.people`); in questo task `write_v2` scrive solo generi + `catalog_v2_at` e ha già il ciclo persone vuoto pronto.

- [ ] **Step 1: smoke test** (`tools/api-smoke-authors.mjs`, struttura come `api-smoke-stats.mjs`):

```js
// Genres and authors: stored on resolve, shown on the title, searchable, with a person page.
import { call, check, finish, mail, sql, signIn } from "./smoke-lib.mjs";

sql("DELETE FROM rate_limit");
const a = await signIn(mail("au1"));
const res = await call("POST", "/api/media/resolve", { cookie: a.cookie, body: { mediaKey: "tmdb:movie:603", locale: "it" } });
check("resolve ok", res.status === 200, res.text);
const mid = res.json.id;
const g = sql(`SELECT genre FROM media_genre WHERE media_id='${mid}' ORDER BY genre`);
check("matrix: stable genres stored", JSON.stringify(g.map((r) => r.genre)) === JSON.stringify(["action", "scifi"]), JSON.stringify(g));
check("catalog_v2_at set", sql(`SELECT catalog_v2_at FROM media_entity WHERE id='${mid}'`)[0].catalog_v2_at > 0);

finish();
```

(Verificare in `tools/smoke-lib.mjs` che `sql()` restituisca righe; se restituisce testo, usare la sua variante che fa il parse JSON.) Aggiungere `"api-smoke-authors"` in coda all'elenco suite di `tools/run-smoke.mjs`.

- [ ] **Step 2: eseguire** — `node tools/run-smoke.mjs --only api-smoke-authors` → FAIL (tabella mancante).
- [ ] **Step 3: creare la migrazione** (SQL sopra).
- [ ] **Step 4: `write_v2` + chiamate** — in `store`, dopo il push di `media_detail`:

```rust
    for g in &d.genre_slugs {
        stmts.push(
            db.prepare(format!("INSERT OR IGNORE INTO media_genre(media_id, genre) SELECT id, ?3 FROM media_entity WHERE {find_sql}"))
                .bind(&[find_args[0].clone(), find_args[1].clone(), (*g).into()])?,
        );
    }
    stmts.push(
        db.prepare(format!("UPDATE media_entity SET catalog_v2_at = ?3 WHERE {find_sql}"))
            .bind(&[find_args[0].clone(), find_args[1].clone(), now.into()])?,
    );
```

In `fill_locale` stessi due blocchi con `media_id` diretto (`VALUES (?1, ?2)` / `WHERE id = ?1`). Estrarre in una funzione `v2_statements(db, target: Target, d: &Draft, now: f64) -> R<Vec<D1PreparedStatement>>` con `enum Target<'a> { Find(&'a str, &'a [JsValue]), Id(&'a str) }` per non duplicare (servirà anche per le persone).

- [ ] **Step 5: eseguire** → PASS. Poi tutto lo smoke: `node tools/run-smoke.mjs` → tutte verdi.
- [ ] **Step 6: Checkpoint.**

### Task 10: Server, filtro genere in classifica

**Files:**
- Modify: `crates/core/src/ranking.rs` (`Title.genres: Vec<String>`, `Filters.genre: Option<String>`)
- Modify: `crates/core/src/dto.rs` (`RankingPage.genres: Vec<String>`)
- Modify: `crates/api/src/stats.rs` (`load` legge `media_genre`, `titles_of` riempie, `ranking_inner` legge `genre`, risposta con generi presenti)
- Test: `ranking.rs` tests, `tools/api-smoke-stats.mjs`

**Interfaces:**
- Produces: query `genre=<slug>`; `RankingPage.genres` = slug presenti tra i titoli del **tipo** richiesto, ordinati. TS rigenerato: `genres: Array<string>`.

- [ ] **Step 1: test Rust**

```rust
#[test]
fn genre_filter_keeps_titles_with_that_slug() {
    let mut s = sample();
    s[0].genres = vec!["romance".into(), "comedy".into()];
    s[1].genres = vec!["action".into()];
    let r = rank(s, &people(), &Filters { genre: Some("action".into()), ..Default::default() });
    assert_eq!(ids(&r), ["b"]);
}
```

Aggiornare l'helper `t(...)` dei test con `genres: vec![]`.

- [ ] **Step 2: eseguire** → FAIL. **Step 3:** campo + condizione nel `filter`: `&& f.genre.as_ref().is_none_or(|g| t.genres.iter().any(|x| x == g))`.

- [ ] **Step 4: API** — quinta query nel batch di `load`:

```rust
db.prepare("SELECT g.media_id, g.genre FROM media_genre g WHERE g.media_id IN (SELECT l.media_id FROM log_share s JOIN log l ON l.id = s.log_id WHERE s.circle_id = ?1)")
    .bind(&[circle_id.into()])?,
```

con `#[derive(Deserialize)] struct GenreRow { media_id: String, genre: String }`, campo `genres: Vec<GenreRow>` in `CircleData`, e in `titles_of` un ciclo che fa `t.genres.push(..)`. In `ranking_inner`: `genre: query_param(req, "genre").filter(|g| pausa_core::genre::SLUGS.contains(&g.as_str())),`. Generi per la risposta, calcolati prima di `rank` e rispettando il tipo:

```rust
let kind = filters.kind.clone();
let mut genres: Vec<String> = titles.iter().filter(|t| kind.as_ref().is_none_or(|k| &t.kind == k)).flat_map(|t| t.genres.iter().cloned()).collect();
genres.sort();
genres.dedup();
```

Campo `genres` in `RankingPage` (dto) e nella costruzione della risposta. `cargo test --workspace` rigenera `packages/api-types`.

- [ ] **Step 5: smoke** — in `api-smoke-stats.mjs`, dopo l'inserimento dei titoli: `sql(\`INSERT INTO media_genre VALUES ('${T[1]}','drama'),('${T[2]}','drama'),('${T[3]}','comedy')\`)`, poi:

```js
const gd = await q("genre=drama");
check("ranking: genre filter", gd.items.every((i) => [T[1], T[2]].includes(i.media.id)) && gd.total === 2, JSON.stringify(gd.items.map((i) => i.media.title)));
check("ranking: genres present for the menu", JSON.stringify((await q("kind=movie")).genres) === JSON.stringify(["comedy", "drama"]));
check("ranking: unknown genre ignored", (await q("genre=nope")).total === (await q("")).total);
```

`node tools/run-smoke.mjs --only api-smoke-stats` → PASS.
- [ ] **Step 6: Checkpoint.**

### Task 11: Client, filtro genere nel popup Filtri

**Files:**
- Modify: `apps/mobile/src/api/stats.ts` (`genre?: string`)
- Modify: `apps/mobile/src/features/stats/Ranking.tsx` (`Draft.genre`, `Select` nel `Sheet`)
- Test: `apps/mobile/e2e/people-stats.spec.ts`

- [ ] **Step 1: test** — nel `beforeAll` del describe ranking, dopo aver creato i log, inserire generi (il file e2e ha già un helper per SQL locale? se no, aggiungere i generi via `wrangler d1 execute` come fanno gli altri e2e che toccano il DB; leggere `e2e/support-diary.ts`). Poi:

```ts
await page.getByTestId("open-filters").click();
const genre = page.getByTestId("rank-genre");
await expect(genre).toHaveValue(""); // "Tutti"
await genre.selectOption("drama");
await page.getByTestId("apply-filters").click();
await expect(rows).toHaveCount(1);
```

- [ ] **Step 2: eseguire** → FAIL.
- [ ] **Step 3: implementare** — nel `Sheet`, dopo `rank-q`:

```tsx
<Select<string>
  label={t("stats.ranking.genre")}
  value={draft.genre}
  testID="rank-genre"
  onChange={set("genre")}
  options={[{ value: "", label: t("ranking.filters.any") }, ...(rank.data?.genres ?? []).map((g) => ({ value: g, label: t(`profile.genres.${g}`) }))]}
/>
```

Testi `stats.ranking.genre`: it "Genere", en "Genre", es "Género". Se il genere scelto sparisce cambiando tipo (non è più in `rank.data.genres`), azzerarlo: `useEffect(() => { if (applied.genre && rank.data && !rank.data.genres.includes(applied.genre)) setApplied((d) => ({ ...d, genre: "" })); }, [rank.data]);`.
- [ ] **Step 4: eseguire** → PASS.
- [ ] **Step 5: Checkpoint.**

---

# Parte D — Registi e autori (server)

### Task 12: Core, crediti, chiavi persona, ricerca, scheda

**Files:**
- Create: `crates/core/src/people.rs`; Modify `crates/core/src/lib.rs`
- Modify: `crates/core/src/catalog.rs` (`Draft.people: Vec<Credit>`; `draft_from_tmdb` / `draft_from_anilist` li riempiono)

**Interfaces:**
- Produces:

```rust
pub enum Role { Director, Creator, Author }            // as_str: "director" | "creator" | "author"
pub enum PersonKey { Tmdb(i64), Anilist(i64) }         // parse("tmdb:5655") / ("anilist:96881"), Display = the same text
pub struct Credit { pub key: PersonKey, pub name: String, pub profile: Option<String>, pub role: Role, pub position: i64 }
pub struct PersonHit { pub key: PersonKey, pub name: String, pub profile: Option<String>, pub known_for: Vec<String> }
pub struct PersonWork { pub work_key: String /* catalog Key text: tmdb:movie:1 | tmdb:tv:2 | anilist:3 */, pub kind: Kind, pub title: String, pub year: Option<i64>, pub poster_path: Option<String>, pub role: Role }
pub struct PersonCard { pub key: PersonKey, pub name: String, pub profile: Option<String>, pub born: Option<String>, pub died: Option<String>, pub place: Option<String>, pub bio: Option<String>, pub works: Vec<PersonWork> }

pub fn credits_from_tmdb(tv: bool, body: &Value) -> Vec<Credit>;    // film: crew job "Director"; serie: created_by
pub fn credits_from_anilist(media: &Value) -> Vec<Credit>;           // staff.edges: author roles, fallback Director
pub fn hits_from_tmdb(body: &Value, max: usize) -> Vec<PersonHit>;   // /search/person, known_for_department in Directing|Writing|Creator
pub fn hits_from_anilist(body: &Value, max: usize) -> Vec<PersonHit>;// Page.staff, primaryOccupations has Mangaka|Director|Writer|Original Creator|Story
pub fn merge_hits(tmdb: Vec<PersonHit>, anilist: Vec<PersonHit>, max: usize) -> Vec<PersonHit>; // same folded name = one hit (TMDB kept)
pub fn card_from_tmdb(body: &Value) -> Option<PersonCard>;          // /person/{id}?append_to_response=combined_credits
pub fn card_from_anilist(body: &Value) -> Option<PersonCard>;       // data.Staff with staffMedia
```

Regole ruoli AniList (`edges[].role` è testo libero, es. "Original Creator", "Original Story", "Story & Art", "Story", "Director", "Chief Director"):
- autore: `role` che inizia con `Original Creator`, `Original Story`, `Story & Art`, oppure uguale a `Story` → `Role::Author`;
- se nessun autore: `Director` / `Chief Director` → `Role::Director`;
- max 3 crediti.

Regole filmografia TMDB (`combined_credits.crew`): film con `job == "Director"` → `Role::Director`; tv con `job == "Creator"` (TMDB lo mette in `department: "Creator"`/`"Writing"`) → `Role::Creator`; tv con generi 16 + `original_language == "ja"` → `Kind::Anime`. Un'opera compare una volta (dedupe su `work_key`), ordinate per anno desc. **Rischio da verificare al Step 1**: la forma reale di `combined_credits` per i creatori. Prima di scrivere il parser, l'implementatore chiede all'utente un `TMDB_API_TOKEN` (o lo prende dai secret locali se c'è un `.dev.vars`) e salva una risposta vera di `/person/1223786?append_to_response=combined_credits` (David Simon) come fixture `crates/core/tests/fixtures/tmdb_person_simon.json` ridotta a 3-4 voci; se non c'è token, scrive il parser sulle due forme (`job: "Creator"` e `department: "Creator"`) e lo segnala nel riepilogo.

Filmografia AniList (`Staff.staffMedia.edges[] { staffRole, node { id type format title seasonYear startDate coverImage } }`): solo `type == ANIME`, ruolo con le stesse regole autore/regista; `Kind::Anime`.

- [ ] **Step 1: test** (in `people.rs`; fixture inline con `serde_json::json!`)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn keys_round_trip() {
        assert_eq!(PersonKey::parse("tmdb:5655"), Some(PersonKey::Tmdb(5655)));
        assert_eq!(PersonKey::parse("anilist:96881"), Some(PersonKey::Anilist(96881)));
        assert_eq!(PersonKey::parse("tmdb:0"), None);
        assert_eq!(PersonKey::parse("imdb:1"), None);
        assert_eq!(PersonKey::Tmdb(7).to_string(), "tmdb:7");
    }

    #[test]
    fn film_directors_from_crew() {
        let b = json!({"credits": {"crew": [
            {"id": 1, "name": "Lana Wachowski", "job": "Director", "profile_path": "/l.jpg"},
            {"id": 2, "name": "Lilly Wachowski", "job": "Director"},
            {"id": 3, "name": "Bill Pope", "job": "Director of Photography"}
        ]}});
        let c = credits_from_tmdb(false, &b);
        assert_eq!(c.iter().map(|x| x.name.as_str()).collect::<Vec<_>>(), ["Lana Wachowski", "Lilly Wachowski"]);
        assert!(c.iter().all(|x| x.role == Role::Director));
    }

    #[test]
    fn series_creators_from_created_by() {
        let b = json!({"created_by": [{"id": 1223786, "name": "David Simon", "profile_path": "/ds.jpg"}], "credits": {"crew": [{"id": 9, "name": "Ep Director", "job": "Director"}]}});
        let c = credits_from_tmdb(true, &b);
        assert_eq!(c.len(), 1);
        assert_eq!((c[0].name.as_str(), c[0].role), ("David Simon", Role::Creator));
        assert_eq!(c[0].key, PersonKey::Tmdb(1223786));
    }

    #[test]
    fn anime_original_author_first_then_director() {
        let m = json!({"staff": {"edges": [
            {"role": "Director", "node": {"id": 10, "name": {"full": "Masayuki Kojima"}}},
            {"role": "Original Creator", "node": {"id": 11, "name": {"full": "Naoki Urasawa"}, "image": {"large": "https://s4.anilist.co/u.jpg"}}}
        ]}});
        let c = credits_from_anilist(&m);
        assert_eq!(c.len(), 1);
        assert_eq!((c[0].name.as_str(), c[0].role), ("Naoki Urasawa", Role::Author));
        let only_dir = json!({"staff": {"edges": [{"role": "Director", "node": {"id": 10, "name": {"full": "Masayuki Kojima"}}}]}});
        assert_eq!(credits_from_anilist(&only_dir)[0].role, Role::Director);
    }

    #[test]
    fn person_search_keeps_directors_and_writers_only() {
        let b = json!({"results": [
            {"id": 1, "name": "Christopher Nolan", "known_for_department": "Directing", "known_for": [{"title": "Inception"}]},
            {"id": 2, "name": "Keanu Reeves", "known_for_department": "Acting"},
            {"id": 3, "name": "David Simon", "known_for_department": "Writing", "known_for": [{"name": "The Wire"}]}
        ]});
        let h = hits_from_tmdb(&b, 10);
        assert_eq!(h.iter().map(|x| x.name.as_str()).collect::<Vec<_>>(), ["Christopher Nolan", "David Simon"]);
        assert_eq!(h[1].known_for, ["The Wire"]);
    }

    #[test]
    fn merged_hits_drop_the_anilist_twin() {
        let t = vec![PersonHit { key: PersonKey::Tmdb(1), name: "Hayao Miyazaki".into(), profile: None, known_for: vec![] }];
        let a = vec![
            PersonHit { key: PersonKey::Anilist(9), name: "Hayao  Miyazaki".into(), profile: None, known_for: vec![] },
            PersonHit { key: PersonKey::Anilist(8), name: "Naoki Urasawa".into(), profile: None, known_for: vec![] },
        ];
        let m = merge_hits(t, a, 10);
        assert_eq!(m.iter().map(|x| x.key.to_string()).collect::<Vec<_>>(), ["tmdb:1", "anilist:8"]);
    }

    #[test]
    fn tmdb_card_lists_directed_films_and_created_series_by_year() {
        let b = json!({"id": 1223786, "name": "David Simon", "birthday": "1960-02-09", "place_of_birth": "Washington, D.C.", "biography": "Writer.", "profile_path": "/ds.jpg",
            "combined_credits": {"cast": [{"id": 5, "media_type": "tv", "name": "Cameo"}], "crew": [
                {"id": 1438, "media_type": "tv", "name": "The Wire", "first_air_date": "2002-06-02", "job": "Creator", "department": "Creator", "genre_ids": [80, 18], "original_language": "en", "poster_path": "/w.jpg"},
                {"id": 1438, "media_type": "tv", "name": "The Wire", "first_air_date": "2002-06-02", "job": "Executive Producer", "department": "Production"},
                {"id": 4, "media_type": "tv", "name": "Treme", "first_air_date": "2010-04-11", "job": "Creator", "department": "Creator", "genre_ids": [18], "original_language": "en"},
                {"id": 7, "media_type": "tv", "name": "Some Show", "first_air_date": "2015-01-01", "job": "Writer", "department": "Writing"}
            ]}});
        let c = card_from_tmdb(&b).unwrap();
        assert_eq!(c.works.iter().map(|w| (w.title.as_str(), w.work_key.as_str())).collect::<Vec<_>>(), [("Treme", "tmdb:tv:4"), ("The Wire", "tmdb:tv:1438")]);
        assert!(c.works.iter().all(|w| w.role == Role::Creator && w.kind == Kind::Tv));
        assert_eq!(c.born.as_deref(), Some("1960-02-09"));
    }

    #[test]
    fn anilist_card_keeps_anime_where_they_are_author_or_director() {
        let b = json!({"data": {"Staff": {"id": 11, "name": {"full": "Naoki Urasawa"}, "image": {"large": "https://s4.anilist.co/u.jpg"}, "description": "Mangaka.", "dateOfBirth": {"year": 1960, "month": 1, "day": 2},
            "staffMedia": {"edges": [
                {"staffRole": "Original Creator", "node": {"id": 19, "type": "ANIME", "title": {"romaji": "Monster", "english": "Monster"}, "seasonYear": 2004, "coverImage": {"large": "https://s4.anilist.co/m.jpg"}}},
                {"staffRole": "Theme Song Lyrics", "node": {"id": 20, "type": "ANIME", "title": {"romaji": "Other"}}},
                {"staffRole": "Story & Art", "node": {"id": 30, "type": "MANGA", "title": {"romaji": "Monster"}}}
            ]}}}});
        let c = card_from_anilist(&b).unwrap();
        assert_eq!(c.works.len(), 1);
        assert_eq!((c.works[0].work_key.as_str(), c.works[0].role, c.works[0].kind), ("anilist:19", Role::Author, Kind::Anime));
        assert_eq!(c.born.as_deref(), Some("1960-01-02"));
    }
}
```

- [ ] **Step 2: eseguire** — `~/.cargo/bin/cargo test -p pausa-core people` → FAIL.

- [ ] **Step 3: implementare `people.rs`.** Punti chiave (il resto è parsing diretto con gli stessi helper `s()`/`n()` di `catalog.rs`: renderli `pub(crate)` lì e riusarli):

```rust
use crate::catalog::{Kind, n, s, tmdb_poster_str, year_of};
use crate::ranking::fold;
use serde_json::Value;
use std::fmt;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role { Director, Creator, Author }
impl Role {
    pub fn as_str(self) -> &'static str { match self { Role::Director => "director", Role::Creator => "creator", Role::Author => "author" } }
    pub fn parse(s: &str) -> Option<Role> { match s { "director" => Some(Role::Director), "creator" => Some(Role::Creator), "author" => Some(Role::Author), _ => None } }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PersonKey { Tmdb(i64), Anilist(i64) }
impl PersonKey {
    pub fn parse(s: &str) -> Option<PersonKey> {
        let (src, id) = s.split_once(':')?;
        let id: i64 = id.parse().ok().filter(|n| *n > 0)?;
        match src { "tmdb" => Some(PersonKey::Tmdb(id)), "anilist" => Some(PersonKey::Anilist(id)), _ => None }
    }
}
impl fmt::Display for PersonKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self { PersonKey::Tmdb(i) => write!(f, "tmdb:{i}"), PersonKey::Anilist(i) => write!(f, "anilist:{i}") }
    }
}

fn anilist_role(role: &str) -> Option<Role> {
    let r = role.trim();
    if r.starts_with("Original Creator") || r.starts_with("Original Story") || r.starts_with("Story & Art") || r == "Story" { Some(Role::Author) }
    else if r == "Director" || r == "Chief Director" { Some(Role::Director) }
    else { None }
}

/// Collapse spaces and fold accents/case so "Hayao  Miyazaki" and "hayao miyazaki" meet.
fn name_key(name: &str) -> String { fold(&name.split_whitespace().collect::<Vec<_>>().join(" ")) }
```

`credits_from_anilist`: raccoglie `(role, node)` dagli edge; se c'è almeno un `Author` tiene solo quelli, altrimenti i `Director`; dedupe per id; `take(3)`; `position` = indice. `credits_from_tmdb(tv)`: se `tv` legge `created_by[]` (`Role::Creator`), altrimenti `credits.crew[]` con `job == "Director"`; dedupe per id; `take(3)`. Foto TMDB passano da `tmdb_poster_str` (stessa validazione dei poster: estrarre da `tmdb_poster` in `catalog.rs` una `pub(crate) fn tmdb_poster_str(p: Option<String>) -> Option<String>`); foto AniList solo se iniziano con `https://s4.anilist.co/`.

`card_from_tmdb`: per ogni voce di `combined_credits.crew` calcola ruolo (`movie` + `job=="Director"` → Director; `tv` + (`job=="Creator"` || `department=="Creator"`) → Creator; altrimenti scarta); kind via la stessa regola di `tmdb_kind` (renderla `pub(crate)`); dedupe `work_key` mantenendo la prima; ordina per `year` desc poi titolo.

`card_from_anilist`: `dateOfBirth {year,month,day}` → `format!("{y:04}-{m:02}-{d:02}")` solo se tutti presenti, altrimenti solo anno; `description` passa da `strip_html`.

In `catalog.rs`: `pub people: Vec<crate::people::Credit>,` in `Draft` (`Credit` deriva `Clone, Debug, PartialEq`); `draft_from_tmdb` aggiunge `people: crate::people::credits_from_tmdb(tv, body)`; `draft_from_anilist` `people: crate::people::credits_from_anilist(m)`.

- [ ] **Step 4: eseguire** → PASS; `cargo test -p pausa-core` tutto verde.
- [ ] **Step 5: Checkpoint.**

### Task 13: API, salvare autori, riempimento pigro e backfill

**Files:**
- Modify: `crates/api/src/catalog.rs` — `ANILIST_MEDIA` e `ANILIST_BY_MAL` con staff; `v2_statements` scrive persone; `pub async fn fill_v2(env, db, user_id, media_id) -> R<()>`
- Modify: `crates/api/src/admin.rs` + `crates/api/src/lib.rs` — `POST /api/admin/catalog-backfill?limit=N`
- Create: `tools/catalog-backfill.mjs`
- Modify: `tools/mock-catalog.mjs` — crediti/staff
- Test: `tools/api-smoke-authors.mjs`

**Interfaces:**
- Consumes: `Draft.people`, `Draft.genre_slugs`, `Credit`, `Role`.
- Produces: `fill_v2` (rilegge TMDB/AniList nella lingua `it` e scrive solo generi + persone + `catalog_v2_at`); endpoint backfill risponde `{ "done": n, "left": m }`, processa `limit` (default 5, max 10) titoli con `catalog_v2_at IS NULL` per `created_at`; errore su un titolo = salta e imposta comunque `catalog_v2_at` (niente loop infinito su titoli spariti dal catalogo).

- [ ] **Step 1: mock** — in `tools/mock-catalog.mjs`: `movie()` aggiunge `credits.crew: [{ id: 9339, name: "Lana Wachowski", job: "Director", profile_path: "/lana.jpg" }, { id: 9340, name: "Lilly Wachowski", job: "Director" }]`; `series(1396)` aggiunge `created_by: [{ id: 66633, name: "Vince Gilligan", profile_path: "/vg.jpg" }]`; la risposta AniList `Media` aggiunge `staff: { edges: [{ role: "Original Creator", node: { id: 96881, name: { full: "Eiichiro Oda" }, image: { large: "https://s4.anilist.co/oda.jpg" } } }, { role: "Director", node: { id: 1, name: { full: "Konosuke Uda" } } }] }`.

- [ ] **Step 2: smoke** (in `api-smoke-authors.mjs`, prima di `finish()`):

```js
const people = sql(`SELECT p.name, mp.role FROM media_person mp JOIN person p ON p.id = mp.person_id WHERE mp.media_id='${mid}' ORDER BY mp.position`);
check("matrix: two directors stored", JSON.stringify(people) === JSON.stringify([{ name: "Lana Wachowski", role: "director" }, { name: "Lilly Wachowski", role: "director" }]), JSON.stringify(people));
const bb = (await call("POST", "/api/media/resolve", { cookie: a.cookie, body: { mediaKey: "tmdb:tv:1396", locale: "it" } })).json.id;
check("breaking bad: creator", sql(`SELECT p.name FROM media_person mp JOIN person p ON p.id=mp.person_id WHERE mp.media_id='${bb}' AND mp.role='creator'`)[0]?.name === "Vince Gilligan");

// backfill: a title from before 0003 (no genres/people, catalog_v2_at NULL) is filled by the admin endpoint
sql(`DELETE FROM media_person WHERE media_id='${mid}'; DELETE FROM media_genre WHERE media_id='${mid}'; UPDATE media_entity SET catalog_v2_at=NULL WHERE id='${mid}'`);
const op = await signIn(OPERATOR_EMAIL); // the operator account used by api-smoke-admin
const bf = await call("POST", "/api/admin/catalog-backfill?limit=10", { cookie: op.cookie });
check("backfill: answers done/left", bf.status === 200 && bf.json.left === 0 && bf.json.done >= 1, bf.text);
check("backfill: people back", sql(`SELECT COUNT(*) AS n FROM media_person WHERE media_id='${mid}'`)[0].n === 2);
check("backfill needs an operator", (await call("POST", "/api/admin/catalog-backfill", { cookie: a.cookie })).status === 403);
```

`OPERATOR_EMAIL`: copiare come `api-smoke-admin.mjs` ottiene l'operatore (leggerlo). Lazy fill (detail):

```js
sql(`DELETE FROM media_person WHERE media_id='${mid}'; UPDATE media_entity SET catalog_v2_at=NULL WHERE id='${mid}'`);
const d = await call("GET", `/api/media/${mid}?locale=it`, { cookie: a.cookie });
check("detail: authors filled on first read", d.json.authors.map((x) => x.name).join(",") === "Lana Wachowski,Lilly Wachowski", d.text);
```

(Il controllo `authors` passa solo dopo il Task 14: scriverlo ora, va verde lì.)

- [ ] **Step 3: eseguire** → FAIL.

- [ ] **Step 4: query AniList** — in `ANILIST_MEDIA` e `ANILIST_BY_MAL` aggiungere dopo `coverImage{large}`: `staff(sort:RELEVANCE,perPage:25){edges{role node{id name{full} image{large}}}}`. Nota: cambia la chiave cache (la query è nel corpo POST): ok.

- [ ] **Step 5: persone in `v2_statements`** — per ogni `Credit`:

```rust
let (col, ext) = match &c.key { PersonKey::Tmdb(i) => ("tmdb_id", *i), PersonKey::Anilist(i) => ("anilist_id", *i) };
stmts.push(db.prepare(format!("INSERT INTO person(id, {col}, name, profile_path) VALUES (?1, ?2, ?3, ?4) ON CONFLICT({col}) WHERE {col} IS NOT NULL DO UPDATE SET name = excluded.name, profile_path = COALESCE(excluded.profile_path, person.profile_path)"))
    .bind(&[new_id().into(), (ext as f64).into(), c.name.as_str().into(), opt_s(&c.profile)])?);
// then the link, finding both rows by their natural keys
stmts.push(db.prepare(format!("INSERT OR IGNORE INTO media_person(media_id, person_id, role, position) SELECT m.id, p.id, ?{a}, ?{b} FROM media_entity m, person p WHERE {media_where} AND p.{col} = ?{c}"))
    .bind(&[...])?);
```

(`media_where` = `m.id = ?1` per `Target::Id`, oppure il `find_sql` con alias `m.` per `Target::Find`; i numeri dei placeholder in base al target. Scrivere due rami espliciti, è più leggibile di una stringa composta.) Prima di inserire, per `fill_v2` cancellare i link vecchi: `DELETE FROM media_person WHERE media_id = ?1`.

- [ ] **Step 6: `fill_v2`** — come `fill_locale` ma con `Locale` italiano fisso (le persone non dipendono dalla lingua; i generi sono codici), e scrive **solo** `v2_statements(Target::Id(media_id), …)` più `DELETE FROM media_person`/`media_genre` di quel titolo in testa al batch. Se il catalogo non risponde: `UPDATE media_entity SET catalog_v2_at = ?2 WHERE id = ?1` e `Ok(())`.

- [ ] **Step 7: endpoint backfill** in `admin.rs`:

```rust
/// `POST /api/admin/catalog-backfill?limit=5`: genres and authors for titles stored before migration 0003, a few per call
/// (each title is one or two catalogue requests; the CPU budget is 10 ms, network waits do not count).
pub async fn catalog_backfill(req: Request, env: Env) -> Result<Response> {
    finish(catalog_backfill_inner(&req, &env).await)
}

async fn catalog_backfill_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let op = require_operator(req, env, &db).await?;
    let limit = query_param(req, "limit").and_then(|v| v.parse::<i64>().ok()).unwrap_or(5).clamp(1, 10);
    let ids: Vec<IdRow> = db.prepare("SELECT id FROM media_entity WHERE catalog_v2_at IS NULL ORDER BY created_at LIMIT ?1").bind(&[(limit as f64).into()])?.all().await?.results()?;
    for r in &ids {
        let _ = catalog::fill_v2(env, &db, &op.user_id, &r.id).await;
    }
    let left = db.prepare("SELECT COUNT(*) AS n FROM media_entity WHERE catalog_v2_at IS NULL").first::<CountRow>(None).await?.map_or(0, |c| c.n);
    json(&serde_json::json!({ "done": ids.len(), "left": left }), 200)
}
```

(Verificare cosa restituisce `require_operator`: se non dà lo user id, prenderlo da `session::require`. `IdRow`/`CountRow`: riusare struct già presenti nel file o dichiararle.) Rotta in `lib.rs`: `(Method::Post, ["api", "admin", "catalog-backfill"]) => admin::catalog_backfill(req, env).await,`. Il conteggio `COUNT(*) … WHERE catalog_v2_at IS NULL` legge tutte le righe di `media_entity`: con il catalogo di Pausa (migliaia) è accettabile perché il backfill gira poche volte; segnalarlo nel commento.

- [ ] **Step 8: `tools/catalog-backfill.mjs`**

```js
// Fills genres and authors for titles stored before migration 0003. Usage:
//   PAUSA_URL=https://pausa.gnagno.org PAUSA_COOKIE='<operator session cookie>' node tools/catalog-backfill.mjs
const base = process.env.PAUSA_URL ?? "http://127.0.0.1:8798";
const cookie = process.env.PAUSA_COOKIE;
if (!cookie) throw new Error("PAUSA_COOKIE missing (operator session)");
for (;;) {
  const r = await fetch(`${base}/api/admin/catalog-backfill?limit=5`, { method: "POST", headers: { cookie } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const { done, left } = await r.json();
  console.log(`done ${done}, left ${left}`);
  if (left === 0 || done === 0) break;
  await new Promise((ok) => setTimeout(ok, 1500)); // TMDB ~40 req/10 s; AniList 90/min
}
```

- [ ] **Step 9: eseguire** — `node tools/run-smoke.mjs --only api-smoke-authors` → PASS tranne il controllo `authors` (Task 14). Poi suite completa → le altre verdi.
- [ ] **Step 10: Checkpoint.**

### Task 14: API, autori nel dettaglio, ricerca persone, scheda persona con voti

**Files:**
- Modify: `crates/core/src/dto.rs`
- Modify: `crates/api/src/media.rs` (`read_detail`, `detail_inner`)
- Create: `crates/api/src/people_catalog.rs`; Modify `crates/api/src/lib.rs` (`mod people_catalog;` + rotte)
- Modify: `crates/api/src/catalog.rs` — `pub async fn person_search(...)`, `pub async fn person_card(...)`
- Modify: `tools/mock-catalog.mjs` — `/search/person`, `/person/:id`, AniList `Page.staff`, `Staff`
- Test: `tools/api-smoke-authors.mjs`

**Interfaces:**
- Produces (DTO, `ts-rs` export):

```rust
pub struct AuthorDto { pub key: String /* tmdb:1 | anilist:2 */, pub name: String, pub role: String /* director|creator|author */ }
// MediaDetailDto gains: pub authors: Vec<AuthorDto>,
pub struct PersonHitDto { pub key: String, pub name: String, pub profile_path: Option<String>, pub known_for: Vec<String> }
pub struct PersonWorkDto {
    pub work_key: String,              // catalog key, for POST /api/media/resolve when media_id is null
    pub media_id: Option<String>,      // set when Pausa already holds the title
    pub kind: String, pub title: String, pub year: Option<i64>, pub poster_path: Option<String>, pub role: String,
    pub avg: Option<f64>,              // Cerchia average, half stars; null without circle or votes
    pub ratings: Vec<PersonRating>,    // Cerchia ratings (empty without circle)
}
pub struct PersonPageDto { pub key: String, pub name: String, pub profile_path: Option<String>, pub born: Option<String>, pub died: Option<String>, pub place: Option<String>, pub bio: Option<String>, pub works: Vec<PersonWorkDto> }
```

- Endpoint:
  - `GET /api/people/search?q=&locale=` → `Vec<PersonHitDto>` (max 10; ≥2 caratteri; stesso limite di ricerca di `media::search`, che conta su `Caller { counted: true }`).
  - `GET /api/people/:key?locale=&circle=<circleId>` → `PersonPageDto`. Con `circle`: verifica membership (`manage::my_role`) e aggiunge voti della Cerchia ai titoli che Pausa ha già. 404 se chiave non valida o catalogo senza persona.

- [ ] **Step 1: mock** — `GET /3/search/person?query=` → per `q` che contiene "simon": `[{ id: 1223786, name: "David Simon", known_for_department: "Writing", known_for: [{ media_type: "tv", name: "The Wire" }], profile_path: "/ds.jpg" }, { id: 2, name: "Simon Actor", known_for_department: "Acting" }]`; per "wachowski": Lana (9339, Directing). `GET /3/person/9339` → card con `combined_credits.crew` = Matrix (603, movie, job Director, `release_date` 1999-03-30) e un film 2 (id 604, "Matrix Reloaded", 2003). AniList: query che contiene `Page{staff` → `{ data: { Page: { staff: [{ id: 96881, name: { full: "Eiichiro Oda" }, primaryOccupations: ["Mangaka"], image: { large: "https://s4.anilist.co/oda.jpg" } }] } } }`; query che contiene `Staff(id` → card Oda con `staffMedia` One Piece (anilist 21, ANIME, "Original Creator").

- [ ] **Step 2: smoke**

```js
const hits = await call("GET", "/api/people/search?q=simon&locale=it", { cookie: a.cookie });
check("people search: writers yes, actors no", hits.json.map((h) => h.key).join() === "tmdb:1223786", hits.text);
const oda = await call("GET", "/api/people/search?q=oda&locale=it", { cookie: a.cookie });
check("people search: anilist staff too", oda.json.some((h) => h.key === "anilist:96881"));

// a circle where two people rated Matrix
const K = (await call("POST", "/api/circles", { cookie: a.cookie, body: { name: "Registi" } })).json;
const b = await signIn(mail("au2"));
await call("POST", "/api/circles/join", { cookie: b.cookie, body: { code: K.inviteCode } });
for (const [who, r] of [[a, 9], [b, 7]]) await call("POST", "/api/logs", { cookie: who.cookie, body: { mediaKey: `local:${mid}`, watchedOn: "2026-03-15", rating: r, circles: [K.id] } });
const pg = await call("GET", `/api/people/tmdb:9339?locale=it&circle=${K.id}`, { cookie: a.cookie });
check("person page: works with circle votes", pg.status === 200 && pg.json.works[0].title === "Matrix Reloaded" && pg.json.works[1].mediaId === mid && pg.json.works[1].avg === 8 && pg.json.works[1].ratings.length === 2, pg.text);
check("person page: unknown work has no media id", pg.json.works[0].mediaId === null && pg.json.works[0].workKey === "tmdb:movie:604");
const out = await signIn(mail("au3"));
check("person page: circle of others is 404", (await call("GET", `/api/people/tmdb:9339?circle=${K.id}`, { cookie: out.cookie })).status === 404);
check("person page: bad key 404", (await call("GET", "/api/people/nope:1", { cookie: a.cookie })).status === 404);
check("person page needs a session", (await call("GET", "/api/people/tmdb:9339")).status === 401);
```

- [ ] **Step 3: eseguire** → FAIL.

- [ ] **Step 4: dettaglio** — in `read_detail` quarta query nel batch:

```rust
db.prepare("SELECT p.tmdb_id, p.anilist_id, p.name, mp.role FROM media_person mp JOIN person p ON p.id = mp.person_id WHERE mp.media_id = ?1 ORDER BY mp.position")
    .bind(&[media_id.into()])?,
```

mappata in `AuthorDto { key: tmdb_id.map(|i| format!("tmdb:{i}")).or(anilist_id.map(|i| format!("anilist:{i}"))), … }` (scartare righe senza nessuno dei due). In `detail_inner`, dopo il blocco `fill_locale`: se `SELECT catalog_v2_at FROM media_entity WHERE id = ?1` è NULL → `let _ = catalog::fill_v2(env, &db, &s.user_id, media_id).await;`.

- [ ] **Step 5: `catalog::person_search` / `person_card`** — TMDB `/search/person?query=<q>&language=<lang>&include_adult=false` + AniList `query($q:String){Page(perPage:8){staff(search:$q){id name{full} primaryOccupations image{large}}}}`, in parallelo come fa `search` (stesso schema di errori: un catalogo giù non fa fallire l'altro), poi `merge_hits(…, 10)`. Card: `PersonKey::Tmdb(id)` → `/person/{id}?language=<lang>&append_to_response=combined_credits` → `card_from_tmdb`; `Anilist(id)` → `query($id:Int){Staff(id:$id){id name{full} image{large} description(asHtml:false) dateOfBirth{year month day} dateOfDeath{year month day} homeTown staffMedia(type:ANIME,sort:START_DATE_DESC,perPage:50){edges{staffRole node{id type title{romaji english native} seasonYear startDate{year} coverImage{large}}}}}}` → `card_from_anilist`.

- [ ] **Step 6: `people_catalog.rs`** — `search` (session, `q` ≥ 2 caratteri altrimenti `[]`, `catalog::person_search`, DTO). `page`:
  1. `session::require`; `PersonKey::parse(key)` o 404.
  2. se `circle` presente: `manage::my_role(&db, circle, &s.user_id).await?` (dà già 404 ai non membri).
  3. `catalog::person_card` (o 404).
  4. per collegare i titoli: raccogliere gli id TMDB per kind e gli id AniList dei `works`, una query sola: `SELECT id, kind, tmdb_id, anilist_id FROM media_entity WHERE (tmdb_id IN (…) AND kind IN ('movie','tv','anime')) OR anilist_id IN (…)` (placeholder generati, max 50 opere per card: troncare `works` a 50 prima). Abbinare TMDB per `(tmdb_id, kind == "movie")` vs serie.
  5. con `circle`: `SELECT r.media_id, r.user_id, r.rating FROM rating_current r JOIN circle_member m ON m.circle_id = r.circle_id AND m.user_id = r.user_id WHERE r.circle_id = ?1 AND r.media_id IN (…)` → `ratings` e `avg` (media semplice come `ranking.rs`).
  6. titolo localizzato: se il titolo è in Pausa, usare `media_title` nella lingua (unire alla query del punto 4 con `LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?`); altrimenti quello del catalogo.

  Rotte in `lib.rs`: `(Method::Get, ["api", "people", "search"]) => people_catalog::search(req, env).await,` **prima di** `(Method::Get, ["api", "people", key]) => people_catalog::page(req, env, key).await,`.

- [ ] **Step 7: eseguire** — `cargo test --workspace` (rigenera i tipi TS) poi `node tools/run-smoke.mjs` → tutte verdi, compreso il controllo `authors` del Task 13.
- [ ] **Step 8: Checkpoint.**

---

# Parte E — Registi e autori, pagina Registra (client)

### Task 15: Registra, pulizia del modulo

**Files:**
- Modify: `apps/mobile/src/features/diary/LogForm.tsx` (`Form`, `PickedCard`, `NewLog`)
- Modify: `apps/mobile/src/features/diary/diary.messages.ts` (`log.back`)
- Test: `apps/mobile/e2e/diary.spec.ts`

**Interfaces:** `Form` prop `onChangeTitle` resta (serve a "Indietro"); `PickedCard` perde `onChangeTitle`.

- [ ] **Step 1: test**

```ts
test("log form: no details, no change-title, watching only for series, back returns to search", async ({ page }) => {
  await page.goto("/it/log");
  await expect(page.getByRole("link", { name: /indietro/i })).toHaveCount(0); // search screen: hidden
  await page.getByTestId("media-search").fill("matrix");
  await page.getByTestId("candidate-tmdb:movie:603").click();
  await expect(page.getByTestId("log-details")).toHaveCount(0);
  await expect(page.getByRole("switch", { name: /spoiler/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /cambia titolo/i })).toHaveCount(0);
  await expect(page.getByTestId("mode-watching")).toHaveCount(0); // film
  await page.getByRole("button", { name: /indietro/i }).click();
  await expect(page.getByTestId("media-search")).toBeVisible();
  await page.getByTestId("media-search").fill("breaking");
  await page.getByTestId("candidate-tmdb:tv:1396").click();
  await expect(page.getByTestId("mode-watching")).toBeVisible(); // series
});
```

(Il mock catalogo e2e usa le stesse chiavi del mock smoke? Verificare in `e2e/diary.spec.ts` quali candidate usa e adattare le chiavi.) Aggiornare i test esistenti di `diary.spec.ts` che aprono `log-details` o usano "Cambia titolo": vanno tolti o riscritti (il salvataggio con data diversa da oggi non è più possibile dal modulo nuovo; resta dalla modifica di un log esistente → vedi nota Step 3).

- [ ] **Step 2: eseguire** → FAIL.

- [ ] **Step 3: implementare**
  - `Form`: rimuovere il blocco `<Details …>…</Details>` dal ramo `watched` **solo per i log nuovi**: `{edit ? <Details …>…</Details> : null}`. Motivo: la modifica di un log esistente deve poter ancora correggere la data e gli altri campi già salvati (confermato dall'utente il 26 nov). **Anche in modifica** i due `Toggle` "Contiene spoiler" e "L'avevo già visto" sono nascosti (rimuovere il loro `<View>` dal JSX; gli stati restano e vengono inviati col valore iniziale, così un log già marcato spoiler resta tale). Gli stati (`spoilers`, `rewatch`, `platform`, `day`…) restano e continuano a essere inviati con i valori iniziali (`false`, oggi, piattaforma ricordata).
  - Stagione/episodio per le serie stavano dentro i dettagli: nel modo "Ho visto" di una serie non si chiedono più (log = serie intera). Nel modo "Sto guardando" restano (`progress`).
  - `ModeTabs`: `{edit || !series ? null : <ModeTabs mode={mode} onChange={setMode} />}` e lo stesso nel ramo `watching` (non raggiungibile per i film).
  - `PickedCard`: togliere prop e bottone `onChangeTitle`.
  - `NewLog`: sostituire `<BackLink to={href("/diary")} label={t("tabs.diary")} />` con:

```tsx
{picked ? <BackButton label={t("log.back")} onPress={() => setPicked(null)} /> : null}
```

  `BackLink` è un link: per tornare alla ricerca serve un bottone con lo stesso aspetto. Leggere `src/ui/BackLink.tsx` e aggiungere lì `export function BackButton({ label, onPress })` con stessa grafica (`ChevronLeft` + testo piccolo) ma `Pressable role="button"`. Testo `log.back`: it "Indietro", en "Back", es "Atrás" (in `diary.messages.ts`, area diary).

- [ ] **Step 4: eseguire** → PASS. Lanciare tutto `e2e/diary.spec.ts`.
- [ ] **Step 5: Checkpoint.**

### Task 16: Ricerca per regista/autore

**Files:**
- Create: `apps/mobile/src/api/people-catalog.ts`
- Modify: `apps/mobile/src/features/diary/TitleSearch.tsx`
- Modify: `apps/mobile/src/features/diary/diary.messages.ts`
- Test: `apps/mobile/tests/people-catalog.test.ts`, `apps/mobile/e2e/authors.spec.ts` (nuovo)

**Interfaces:**
- Consumes: Task 14 endpoint e tipi `PersonHitDto`, `PersonPageDto`.
- Produces: `peopleCatalogEndpoints(c: Client)` → `{ search(q, locale, signal?): Promise<PersonHitDto[]>; person(key, o: { locale: string; circle?: string }, signal?): Promise<PersonPageDto> }`, `peopleCatalogApi`. `Search` nuova prop `people?: boolean` (mostra la select; default `false` così liste e preferiti non cambiano). Navigazione persona: `circleId ? /c/<circleId>/person/<key> : /person/<key>`.

- [ ] **Step 1: unit test (URL)**

```ts
// apps/mobile/tests/people-catalog.test.ts
import { describe, expect, it, vi } from "vitest";
vi.mock("@/api", () => ({ client: {} }));
import { peopleCatalogEndpoints } from "@/api/people-catalog";

describe("people catalogue endpoints", () => {
  it("builds the URLs", async () => {
    const calls: string[] = [];
    const c = { json: async (_m: string, url: string) => (calls.push(url), []) } as never;
    const api = peopleCatalogEndpoints(c);
    await api.search("david simon", "it");
    await api.person("tmdb:1223786", { locale: "it", circle: "c1" });
    expect(calls).toEqual(["/api/people/search?q=david%20simon&locale=it", "/api/people/tmdb%3A1223786?locale=it&circle=c1"]);
  });
});
```

- [ ] **Step 2: eseguire** → FAIL. **Step 3:**

```ts
// apps/mobile/src/api/people-catalog.ts
import type { PersonHitDto, PersonPageDto } from "@pausa/api-types";
import { client } from "@/api";
import type { Client } from "./client";
import { query } from "./diary";

const e = encodeURIComponent;

export function peopleCatalogEndpoints(c: Client) {
  return {
    search: (q: string, locale: string, signal?: AbortSignal) => c.json<PersonHitDto[]>("GET", `/api/people/search${query({ q, locale })}`, { signal }),
    person: (key: string, o: { locale: string; circle?: string }, signal?: AbortSignal) => c.json<PersonPageDto>("GET", `/api/people/${e(key)}${query({ ...o })}`, { signal }),
  };
}
export const peopleCatalogApi = peopleCatalogEndpoints(client);
```

- [ ] **Step 4: eseguire** → PASS.

- [ ] **Step 5: e2e**

```ts
// apps/mobile/e2e/authors.spec.ts — skip when the API is down, like the other app-flow specs
test("search by director opens the director page", async ({ page }) => {
  await page.goto("/it/log");
  await page.getByTestId("search-mode").selectOption("people");
  await page.getByTestId("media-search").fill("wachowski");
  await expect(page.getByTestId(/^candidate-tmdb:movie/)).toHaveCount(0); // only people
  await page.getByTestId("person-tmdb:9339").click();
  await expect(page).toHaveURL(/\/person\/tmdb%3A9339|\/person\/tmdb:9339/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Lana Wachowski/);
});
```

(Lo stack e2e usa `tools/mock-catalog.mjs` come lo smoke? Verificare in `tools/dev-stack.mjs`; se lo stack e2e non usa il mock, questo test va in skip senza TMDB e lo si dice nel riepilogo.)

- [ ] **Step 6: implementare la select e i risultati persona** in `TitleSearch.tsx`:

```tsx
const [mode, setMode] = useState<"titles" | "people">("titles");
const [people, setPeople] = useState<PersonHitDto[]>([]);
// effect: same debounce; when mode === "people" call peopleCatalogApi.search(term, locale, ctl.signal) and store in `people`
```

Sopra il `Field`:

```tsx
{props.people ? (
  <Select<"titles" | "people">
    label={t("log.searchBy")}
    value={mode}
    testID="search-mode"
    onChange={(m) => { setMode(m); setState({ status: "idle", items: [] }); setPeople([]); }}
    options={[{ value: "titles", label: t("log.byTitle") }, { value: "people", label: t("log.byPerson") }]}
  />
) : null}
```

Il `Field` usa `label={mode === "people" ? t("log.searchPerson") : t("log.search")}`. Risultati persona: stessa riga dei titoli (`Pressable` sotto filetto) con `Avatar` / foto 44 px (`MediaPoster` con `path={h.profilePath}` va bene: gestisce path TMDB e URL AniList), nome in `Title`, `knownFor.slice(0, 2).join(", ")` in piccolo, `testID={\`person-${h.key}\`}`, `onPress={() => router.push(href(circleId ? \`/c/${circleId}/person/${encodeURIComponent(h.key)}\` : \`/person/${encodeURIComponent(h.key)}\`))}` con `circleId` da `useCurrentCircle()`.

Testi (area diary): it `searchBy: "Cerca per"`, `byTitle: "Titolo"`, `byPerson: "Regista/autore"`, `searchPerson: "Cerca un regista o un autore"`; en `"Search by"`, `"Title"`, `"Director/author"`, `"Search for a director or author"`; es `"Buscar por"`, `"Título"`, `"Director/autor"`, `"Busca un director o autor"`.

In `LogForm.tsx` `NewLog`: `<Search onPick={setPicked} autoFocus people />`.

Su native `Select` cade su `Choice` (`Select.native.tsx`): nessun lavoro extra.

- [ ] **Step 7: eseguire** e2e → PASS (dopo Task 17 per l'heading; fino ad allora fermarsi al controllo URL).
- [ ] **Step 8: Checkpoint.**

### Task 17: Pagina regista/autore

**Files:**
- Create: `apps/mobile/src/features/people/PersonPage.tsx`, `apps/mobile/src/features/people/person.messages.ts`
- Create: `apps/mobile/app/[locale]/(app)/c/[id]/person/[key].tsx`, `apps/mobile/app/[locale]/(app)/person/[key].tsx`
- Modify: `apps/mobile/src/features/Shell.tsx:35` (rotta persona = scheda Classifica/diario attiva? → nessuna voce attiva: non toccare se `useActive` non la evidenzia)
- Test: `apps/mobile/e2e/authors.spec.ts`

**Interfaces:**
- Consumes: `peopleCatalogApi.person`, `diaryApi.resolveMedia(key, locale)`, `VoteAvatars` (Task 6), `Avatar`, `MediaPoster`, `KindTag`.
- Produces: `PersonPage()` legge `id?` (Cerchia) e `key` da `useLocalSearchParams`.

- [ ] **Step 1: e2e**

```ts
test("director page: photo, facts, works by type with circle votes, click opens the title", async ({ page }) => {
  await page.goto(`/it/c/${cid}/person/tmdb:9339`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Lana Wachowski/);
  await expect(page.getByRole("heading", { level: 2, name: "Film" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Serie" })).toHaveCount(0); // no series for her in the mock
  const matrix = page.getByTestId(/^work-/).filter({ hasText: /matrix$/i });
  await expect(matrix.getByRole("listitem")).toHaveCount(2); // two circle votes
  await matrix.getByRole("link").first().click();
  await expect(page).toHaveURL(new RegExp(`/c/${cid}/m/`));
  await page.goBack();
  await page.getByTestId(/^work-/).filter({ hasText: /reloaded/i }).getByRole("link").first().click();
  await expect(page).toHaveURL(new RegExp(`/c/${cid}/m/`)); // resolved on click, then opened
});
```

(Seed: far votare Matrix a due membri della Cerchia di test come nel Task 14.)

- [ ] **Step 2: eseguire** → FAIL.

- [ ] **Step 3: testi** (`person.messages.ts`, `registerArea("person", { it, en, es })` come `stats.messages.ts`):

```ts
const it = { person: { films: "Film", series: "Serie", anime: "Anime", born: "Nascita: {date}", died: "Morte: {date}", noWorks: "Nessuna opera da regista o autore.", role: { director: "Regia", creator: "Creazione", author: "Autore originale" }, back: "Indietro", open: "Apri {title}" } } as const;
const en = { person: { films: "Films", series: "Series", anime: "Anime", born: "Born: {date}", died: "Died: {date}", noWorks: "No works as director or author.", role: { director: "Director", creator: "Creator", author: "Original author" }, back: "Back", open: "Open {title}" } } as const;
const es = { person: { films: "Películas", series: "Series", anime: "Anime", born: "Nacimiento: {date}", died: "Muerte: {date}", noWorks: "Ninguna obra como director o autor.", role: { director: "Dirección", creator: "Creación", author: "Autor original" }, back: "Atrás", open: "Abrir {title}" } } as const;
```

(Formule neutre "Nascita:/Morte:" per non presumere il genere della persona.)

- [ ] **Step 4: componente**

```tsx
// apps/mobile/src/features/people/PersonPage.tsx
import type { PersonWorkDto } from "@pausa/api-types";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "@/api";
import { diaryApi } from "@/api/diary";
import { peopleCatalogApi } from "@/api/people-catalog";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { hair, space, useTheme, web } from "@/theme";
import { BackButton } from "@/ui/BackLink";
import { MediaPoster } from "@/ui/MediaPoster";
import { Empty, ErrorState, Heading, Loading, Screen, Text, Title } from "@/ui";
import { KindTag, num } from "../diary/shared";
import { RequireSession, useMe } from "../session";
import { VoteAvatars } from "../stats/VoteAvatars";
import "./person.messages";

const GROUPS = [["movie", "person.films"], ["tv", "person.series"], ["anime", "person.anime"]] as const;

function Work({ w, circleId, members, meId }: { w: PersonWorkDto; circleId?: string; members: { userId: string; name: string; image?: string | null }[]; meId: string }) {
  const { t, href, locale } = useI18n();
  const { c } = useTheme();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const id = w.mediaId ?? (await diaryApi.resolveMedia(w.workKey, locale)).id;
      router.push(href(circleId ? `/c/${circleId}/m/${id}` : `/t/${id}`) as Href);
    } finally {
      setBusy(false);
    }
  };
  const rated = new Map(w.ratings.map((r) => [r.userId, r.rating]));
  const voters = members.filter((m) => rated.has(m.userId));
  const y = num(w.year);
  return (
    <View role="listitem" testID={`work-${w.workKey}`} style={{ borderBottomWidth: hair, borderColor: c.rule, paddingVertical: space.sm, gap: space.xs }}>
      <Pressable role="link" aria-label={t("person.open", { title: w.title })} aria-busy={busy} onPress={open} style={[{ flexDirection: "row", gap: space.sm, alignItems: "center" }, web({ cursor: "pointer" })]}>
        <MediaPoster title={w.title} path={w.posterPath} width={48} />
        <View style={{ flex: 1, gap: space["3xs"] }}>
          <Title numberOfLines={2} style={{ fontSize: 22, lineHeight: 24 }}>{w.title}</Title>
          <Text variant="small" tone="muted">{[y, t(`person.role.${w.role}` as const)].filter(Boolean).join(" · ")}</Text>
        </View>
        {w.avg ? <Title style={{ fontSize: 32, lineHeight: 32 }}>{new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(w.avg / 2)}</Title> : null}
      </Pressable>
      {voters.length > 0 ? <VoteAvatars people={voters} ratings={rated} meId={meId} /> : null}
    </View>
  );
}

function Body({ circleId, personKey }: { circleId?: string; personKey: string }) {
  const { t, locale, date } = useI18n();
  const router = useRouter();
  const me = useMe();
  const p = useResource((signal) => peopleCatalogApi.person(personKey, { locale, circle: circleId }, signal), [personKey, locale, circleId]);
  const circle = useResource((signal) => (circleId ? api.circle(circleId, signal) : Promise.resolve(null)), [circleId]);
  const members = (circle.data?.members ?? []).map((m) => ({ userId: m.userId, name: m.name, image: m.image }));
  if (p.loading && !p.data) return <Loading rows={4} />;
  if (p.error) return <ErrorState error={p.error} onRetry={p.reload} />;
  const d = p.data!;
  const facts = [d.born ? t("person.born", { date: d.born }) : null, d.place, d.died ? t("person.died", { date: d.died }) : null].filter(Boolean).join(" · ");
  return (
    <>
      <BackButton label={t("person.back")} onPress={() => router.back()} />
      <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
        <MediaPoster title={d.name} path={d.profilePath} width={96} />
        <View style={{ flex: 1, gap: space.xs }}>
          <Heading level={1}>{d.name}</Heading>
          {facts ? <Text tone="ink2">{facts}</Text> : null}
        </View>
      </View>
      {d.bio ? <Text tone="ink2" numberOfLines={6}>{d.bio}</Text> : null}
      {d.works.length === 0 ? <Empty title={t("person.noWorks")} /> : null}
      {GROUPS.map(([kind, label]) => {
        const ws = d.works.filter((w) => w.kind === kind);
        if (ws.length === 0) return null;
        return (
          <View key={kind} style={{ gap: space.xs }}>
            <Heading level={2}>{t(label)}</Heading>
            <View role="list">{ws.map((w) => <Work key={w.workKey} w={w} circleId={circleId} members={members} meId={me.id} />)}</View>
          </View>
        );
      })}
    </>
  );
}

export function PersonPage() {
  const { id, key } = useLocalSearchParams<{ id?: string; key: string }>();
  return (
    <RequireSession>
      <Screen>
        <Body circleId={id ? String(id) : undefined} personKey={decodeURIComponent(String(key))} />
      </Screen>
    </RequireSession>
  );
}
```

Date: `d.born` è `YYYY-MM-DD` o solo anno; formattarlo con `date(ymdToMs(d.born))` se è una data piena (helper in `diary/dates`, verificare nome), altrimenti mostrarlo così. Prima di scrivere: verificare i nomi reali di `Heading level={2}`, `Empty title`, `useResource` con `Promise.resolve(null)` (se `useResource` non accetta null, usare due componenti).

- [ ] **Step 5: rotte**

```tsx
// apps/mobile/app/[locale]/(app)/c/[id]/person/[key].tsx  (and the same in app/[locale]/(app)/person/[key].tsx)
import { privateMetadata } from "@/seo/metadata";
import { PersonPage } from "@/features/people/PersonPage";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <PersonPage />;
}
```

Se il progetto ha un elenco rotte private per SEO/CSP (cercare `privateMetadata` e `zero-js` / `seo` test), aggiungere le due rotte nuove dove servono (i test `seo` e `zero-js` lo diranno).

- [ ] **Step 6: eseguire** `e2e/authors.spec.ts` → PASS.
- [ ] **Step 7: Checkpoint.**

### Task 18: Nome del regista/autore nella scheda opera

**Files:**
- Create: `apps/mobile/src/features/diary/Authors.tsx`
- Modify: `apps/mobile/src/features/diary/CircleTitle.tsx` (sotto titolo originale, ~riga 67), `apps/mobile/src/features/diary/TitlePage.tsx` (~riga 79)
- Modify: `apps/mobile/src/features/diary/diary.messages.ts`
- Test: `apps/mobile/e2e/authors.spec.ts`

**Interfaces:**
- Consumes: `MediaDetailDto.authors: AuthorDto[]` (Task 14).
- Produces: `Authors({ authors, circleId? })`.

- [ ] **Step 1: test**

```ts
test("title page names the directors, linked to their page", async ({ page }) => {
  await page.goto(`/it/c/${cid}/m/${matrixId}`);
  const lana = page.getByRole("link", { name: "Lana Wachowski" });
  await expect(lana).toBeVisible();
  await expect(page.getByText(/^Regia/)).toBeVisible();
  await lana.click();
  await expect(page).toHaveURL(new RegExp(`/c/${cid}/person/tmdb`));
});
```

- [ ] **Step 2: eseguire** → FAIL.
- [ ] **Step 3: testi** (area diary): it `authors: { director: "Regia", creator: "Creata da", author: "Autore originale" }`; en `{ director: "Directed by", creator: "Created by", author: "Original author" }`; es `{ director: "Dirección", creator: "Creada por", author: "Autor original" }`.
- [ ] **Step 4: componente**

```tsx
// apps/mobile/src/features/diary/Authors.tsx
import type { AuthorDto } from "@pausa/api-types";
import { View } from "react-native";
import { useI18n } from "@/i18n";
import { space } from "@/theme";
import { Text, TextLink } from "@/ui";
import "./diary.messages";

export function Authors({ authors, circleId }: { authors: AuthorDto[]; circleId?: string }) {
  const { t, href } = useI18n();
  if (authors.length === 0) return null;
  const role = authors[0].role as "director" | "creator" | "author";
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: space["2xs"] }}>
      <Text tone="muted">{t(`authors.${role}`)}</Text>
      {authors.map((a, i) => (
        <Text key={a.key}>
          <TextLink href={href(circleId ? `/c/${circleId}/person/${encodeURIComponent(a.key)}` : `/person/${encodeURIComponent(a.key)}`)}>{a.name}</TextLink>
          {i < authors.length - 1 ? ", " : ""}
        </Text>
      ))}
    </View>
  );
}
```

(`TextLink` è usato in `CircleAside.tsx:69`: importarlo da dove lo importa quel file.) In `CircleTitle.tsx` subito dopo la riga del titolo originale: `<Authors authors={d.authors} circleId={id} />`; in `TitlePage.tsx` `<Authors authors={d.authors} />`.

- [ ] **Step 5: eseguire** → PASS.
- [ ] **Step 6: Checkpoint.**

---

# Chiusura

### Task 19: Verifica completa e note di rilascio

- [ ] **Step 1:** `~/.cargo/bin/cargo test --workspace` → verde (tipi TS rigenerati, nessuna differenza non voluta in `packages/api-types`: `git diff --stat packages/api-types`).
- [ ] **Step 2:** `node tools/run-smoke.mjs` → tutte le suite verdi (14 con `api-smoke-authors`).
- [ ] **Step 3:** `cd apps/mobile && npx tsc --noEmit && npx vitest run` → verde.
- [ ] **Step 4:** stack + build + e2e completo (`node tools/dev-stack.mjs --seed`, `npm run build:web`, `node scripts/serve-dist.mjs 4173`, `npx playwright test`) — **senza agenti in parallelo** (poca RAM). Rilanciare da soli i test instabili noti (tastiera sul thread).
- [ ] **Step 5:** screenshot di controllo (telefono 412 px e desktop 1280 px) di: Classifica (barra, popup anni, riga con +N aperto/chiuso), Registra (ricerca per regista, modulo film, modulo serie), pagina regista, scheda opera con "Regia". Mostrarli all'utente.
- [ ] **Step 6:** scrivere in `docs/rebuild/MANCA.md` (o file di rilascio esistente) i passi di deploy: migrazione `0003` applicata dal deploy; poi **lanciare `tools/catalog-backfill.mjs` contro produzione** con cookie operatore finché `left = 0` (senza, filtro genere e registi delle opere vecchie restano vuoti finché qualcuno non apre la scheda).
- [ ] **Step 7: Checkpoint finale** — riepilogo all'utente, chiedere se committare (mai push su `main` senza conferma esplicita).

---

## Self-review (fatta)

- Copertura lista utente: sidebar (T1) · tipo fuori, default film, niente "tutti" (T5) · voto rapido (T7) · via sotto-menu (T5) · via titolo/visti di recente (T5) · ordinamento 3 stati (T3, T4, T5) · imbuto (T5) · avatar + espansione inline (T6) · date range a parte con preset, decadi, custom tradotto, anno di uscita (T4, T5) · filtro genere default "tutti" (T8–T11) · ricerca per regista con select (T16) · solo registi nei risultati (T12 `hits_*`, T16) · click → pagina regista (T16, T17) · autore principale serie/anime (T12) · modulo senza dettagli/spoiler/già visto, non cancellati (T15) · "sto guardando" solo serie/anime (T15) · via "cambia titolo" (T15) · "< Indietro" alla ricerca (T15) · pagina regista con info, foto, opere per tipo, voti, click (T14, T17) · regista cliccabile nella scheda (T18) · select lista allineata (T2).
- Punti da confermare con l'utente durante l'esecuzione (segnalati nei task): eccezione "modifica log" che tiene i dettagli (T15); forma reale di `combined_credits` per i creatori TMDB (T12, serve token).
