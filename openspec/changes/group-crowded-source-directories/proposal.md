# group-crowded-source-directories

> **Depends on `retire-native-directory`.** That change moves the same files;
> this one must land after it so nothing is moved twice, and its spec deltas are
> written against the post-`retire-native-directory` text (`src/engine/`,
> `src/games/`).

## Why

Two directories hold more than one thing, for reasons that were never decided —
they accumulated.

**`src/engine/` is 104 files flat** (~22,300 lines). Most of it is a genuinely
flat namespace of independent helpers, which is fine. But two families inside it
are large, internally coupled, and read as one subject:

- **grid** — `grid.ts` (a barrel), `grid-core`, `grid-desc`, `grid-geometry`,
  `grid-trim`, `grid-tilings{,-basic,-dodec,-hex}`, their tests, the existing
  `tilings/` subdirectory, and 932 KB of `__fixtures__`. Twelve source files
  plus a subdirectory, on one subject, interleaved alphabetically with
  `geometry.ts`, `game.ts` and `hint-plan.ts`.
- **colour** — `colours`, `colour-token`, `colour-mkhighlight`, `palette`,
  `palette-games` and their tests. `consolidate-colour-palette` gave this family
  a deliberate three-layer structure (palette → meanings → per-game relatives);
  the filesystem shows none of it, and the layering is the whole point of that
  design.

**`src/puzzle/` holds two roles.** It is the main-thread puzzle runtime — the
`Puzzle` object, the Comlink worker host, `drawing.ts`, `engine-surface.ts`,
`catalog*.ts` — *and* nine Lit components totalling ~3,300 lines
(`puzzle-view`, `puzzle-view-interactive`, `puzzle-keys`, `puzzle-history`,
`puzzle-type-menu`, `puzzle-config`, `puzzle-context`, `other-puzzles-menu`,
`puzzle-end-notification`). The `repo-layout` spec says Lit components live in
`screens/`, `dialogs/` or `components/` — and then exempts `src/puzzle/` as
"puzzle runtime + Comlink worker". The exemption is what lets two roles share a
folder, and the tell is that every one of those nine files carries a redundant
`puzzle-` prefix *because it lives in a directory called `puzzle`*.

Neither is urgent and neither is a false signal — this is a readability change,
and it is proposed on the standing "noticeably cleaner is sufficient
justification" directive rather than on a defect history.

## What Changes

- **`src/engine/grid/`** — the twelve grid modules, their tests and fixtures,
  and the existing `tilings/` subdirectory move under it. `grid.ts` becomes
  `grid/index.ts`, keeping its role as the barrel its own doc comment tells
  callers to import from.
- **`src/engine/colour/`** — the five colour modules and their tests, in the
  order `consolidate-colour-palette` designed: `colours.ts` (the twelve-colour
  palette), `palette.ts` (the meanings), `palette-games.ts` (board-relative),
  plus `colour-token.ts` and `colour-mkhighlight.ts`.
- **`src/puzzle/components/`** — the nine Lit components, losing the now-redundant
  `puzzle-` prefix on their *filenames* (the custom-element tag names
  `<puzzle-view>` etc. are the app's public DOM vocabulary and do **not**
  change).
- **`scripts/feedback-probe.mjs` learns about subdirectories.** It currently does
  `readdirSync("src/native/engine")` — flat, one level — to derive both the
  barrel set and each module's own tests. See `design.md` D2: this is the
  riskiest part of the change and the only part that can fail *quietly*.

Explicitly **not** in this change:

- **Regrouping the rest of the engine.** `latin.ts`, `divvy.ts`, `laydomino.ts`,
  `loopgen.ts`, `findloop.ts`, `wires.ts`, `dsf.ts` and friends stay flat. A
  "solver-libs/" bucket is arguable in both directions, and a grouping nobody can
  defend is worse than no grouping — the two families here are chosen precisely
  because they are not arguable.
- **Renaming `src/puzzle/`** or moving its components into the top-level
  `src/components/`. They are puzzle-specific and belong next to the runtime they
  drive; the problem is that the folder does not say which is which.

## Impact

- **Affected specs**: `repo-layout` — the `src/` layout requirement (the two new
  engine subdirectories and the `src/puzzle/` split), and "A shared module's
  tests give feedback where the code lives" (the derivation must survive
  nesting).
- **Affected code**: ~40 file moves plus their importers; `scripts/feedback-probe.mjs`,
  `scripts/feedback-probe-cases.mjs` (14 path references),
  `scripts/stryker.config.mjs` (7), `scripts/colour-*.test.ts` (14).
- **Risk**: moderate, and asymmetric between the two halves. The `src/puzzle/`
  split and the colour move fail loudly (`tsc`, then `vite build` on the Lit
  registration side). The grid move can fail **silently** through the probe —
  which is the whole of D2 and the reason this change is separate from
  `retire-native-directory` rather than bundled into it.
