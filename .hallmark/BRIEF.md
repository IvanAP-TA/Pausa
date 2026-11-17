# Brief for every redesign agent (Pausa, Darkroom)

Pausa is a private group diary for films, series and anime (Next.js 16 App Router, React 19, Tailwind v4, next-intl with it/en/es). The user asked for a full visual redesign of the whole app with the Hallmark skill. The system is already chosen and built: theme **Darkroom** (warm print-black ground, hairline condensed capitals, one amber signal, zero radius). Your job is to bring one group of screens into that system at **full depth**: the content and the wiring stay, the composition and the styling change.

## Read first, in this order
1. `DESIGN.md` (repo root): the locked system. It is the rule.
2. `src/app/globals.css` and `src/app/tokens.css`: the tokens and the shared component classes (`.display`, `.title`, `.figure`, `.btn`, `.btn-primary`, `.btn-quiet`, `.btn-sm`, `.btn-lg`, `.link`, `.field`, `.field-label`, `.well`, `.grained`, `.plate`, `.rows`, `.tag`, `.subtitle`, `.meter`, `.skeleton`, `.tabular`).
3. The screens already redesigned, as the reference for composition and class usage: `src/components/log-card.tsx`, `src/app/[locale]/c/[circleId]/page.tsx`, `src/app/[locale]/c/[circleId]/filter-bar.tsx`, `src/app/[locale]/c/[circleId]/loading.tsx`, `src/components/tab-bar.tsx`, `src/components/reactions.tsx`, `src/components/poster.tsx`.
4. `C:\Users\Giuseppe\.claude\skills\hallmark\references\redesign.md` § "What a redesign keeps", and `C:\Users\Giuseppe\.claude\skills\hallmark\references\themes\darkroom.md`.
5. `AGENTS.md` in the repo root: this Next.js version differs from what you remember; check `node_modules/next/dist/docs/` before using an API you are not sure of.

## What must stay (a broken one of these fails the redesign)
- Every link `href`, form `action`, field `name`, `id`, `key`, `type`, `value`, `aria-*`, `role`, `data-*`, handler, hook, server action, import of logic, prop name and exported name. Edit markup and class strings inside the component that owns them. Do not move logic, rename props, change data fetching, or change what a component renders conditionally.
- Every message key. Do **not** edit `messages/*.json`. Do not add user-facing copy. If a control you keep needs an accessible name that has no key, reuse an existing key.
- Every heading, figure, fact and link the screen shows today. Nothing is added and nothing is dropped. If something has to go, stop and report it instead.
- No file deleted, no route removed, no test edited.

## The Floor (never break these)
1. Every colour and font goes through a token: Tailwind utilities from the theme (`bg-paper`, `text-ink-2`, `border-rule`, `text-accent`, `bg-accent`, `text-accent-ink`, `font-display`) or `var(--color-*)`. No hex, rgb or oklch literal, no `text-[#…]`, no `bg-white`, `bg-black`, no Tailwind stock palette (`slate-…`, `red-…`).
2. Never `transition-all`. Never animate `width`, `height`, `top`, `left`. Use `transition-colors`, `transition-opacity`, `transition-transform`, or `transition-[a,b]` with those properties.
3. Never an eyebrow (small inert text above a heading that announces it). Never a label in tracked capitals: no `uppercase` with `tracking-*` on text of 15px or under. Labels, captions, table heads, tags and nav links are Barlow, `text-sm`, sentence case, untracked. (Display capitals come from `.display`, `.title`, `.btn`, `h1` to `h3`, which are legal.)
4. No middle-dot chains (`A · B · C`) built in JSX: join with `, ` or lay the facts out in columns or lines. No arrow glued to a link or button label (`→`, `›`, `>`): delete the arrow, keep the label. No em or en dash in JSX copy.
5. No card inside a card. No purple or blue gradient, in fact no gradient. No blur, glass, glow or shadow. No emoji used as an icon: replace an icon emoji or a `✓ ○ ×` glyph with a small inline `<svg aria-hidden="true">` in the style of `tab-bar.tsx` (stroke 1.6, square caps). An emoji a person chose (a reaction, an avatar, a cover glyph) is content and stays.
6. Every interactive element keeps a visible focus (the global `:focus-visible` outline does it: never add `outline-none` without a replacement), a hover state, `active:translate-y-px` on buttons, and a disabled state.
7. Radius is 0: remove `rounded-full`, `rounded-lg`, `rounded-xl`, `rounded-2xl` from everything except an avatar or a round live dot. (`rounded-sm` and `rounded-md` already resolve to 0; remove them when you touch the line.)
8. Body text is 16px (`text-base`), secondary text `text-sm` (14px); nothing under 12px, and `text-xs` only for a badge count. Touch targets 44px (`min-h-11`) on phones.
9. Image-bearing grid tracks use `minmax(0,1fr)`; a heading that can be long keeps `min-w-0`.

## How Darkroom composes an app screen
- A screen opens with its `h1` in `.display` (once), then the content. No decorative header band.
- Lists are **rows on the ground under hairlines** (`.rows`, `.plate`), not stacks of bordered rounded cards. Use a `.well` only for a region that is a different kind of thing (a form, an empty state, a call to act), and a `.well` never sits inside another.
- Item titles (a film, a list, a person, a section) use `.title` or `h2`/`h3`; they are capitals in the condensed face, so they can be large (`text-title` 2rem, or `text-xl`/`text-2xl` in a tight row).
- Numbers that are the point (a rank, a count, a score, a timer) use `.figure` at a large size with `tabular`, in ink; the unit or label beside it in `text-sm text-muted`.
- Posters lead: `Poster` at 104px or wider where a title is the subject, `size="sm"` (56px) only inside a compact row.
- Amber is scarce: one `.btn-primary` per view, the current selection, a rating, a badge. Secondary actions are `.btn` or `.btn-quiet`; destructive ones are `.btn-quiet` with `text-error`.
- Forms: one column, `.field-label` above each `.field`, the submit button full width on a phone (`w-full sm:w-fit`).
- Every data region keeps the empty, loading and error states it already has; restyle them (an empty state is a `.well grained` with a `.title`, one sentence and the action). Do not invent states the screen has no logic for; list any that are missing in your report.
- Light mode comes free from the tokens; do not write `dark:` variants or theme conditionals.
- Layout widths: the Cerchia shell gives each screen a column of at most 40rem; use `px-4` for the gutter and `grid gap-6` between regions.

## Working rules
- Touch only the files in your list. Do not edit `globals.css`, `tokens.css`, `base.css`, `DESIGN.md`, `layout.tsx`, or any component outside your list. If you need a shared class or token that does not exist, use utilities and say so in your report.
- Do not run `git` commands that change anything (no add, commit, stash, checkout). Do not start, stop or restart the dev server (it is running on port 3000). Do not run `npm run build`, `npm install`, tests or `tsc` (the machine is short on memory; the lead runs them once at the end). You may run `npx eslint <your files>`.
- Do not take screenshots or launch a browser.
- Write code comments sparingly, in English, like the existing ones.

## Report back (short)
1. Files changed.
2. For each screen: the composition in one line (what leads, how the rest is arranged).
3. Anything dropped, reworded or left as found on purpose, with the reason.
4. Copy problems you saw in `messages/*.json` values (dots, arrows, dashes) that you could not fix: key and text.
5. States a screen is missing (for the owner), and anything you needed from the shared system.
