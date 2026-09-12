# Correct stale requirement text

**Readiness: scaffolded 2026-09-12, not started.** Found while auditing the
Purposes written by `write-the-spec-purposes`: each Purpose claim was checked
against its spec's requirements and the code, and the requirements themselves
disagreed with the code in places no Purpose touched.

## Why

A requirement is a present-tense claim, and several dozen of them describe a
tree that changed under them. Nothing fails: `openspec validate` checks a spec's
shape, never its truth, and no test reads requirement prose. Each category below
has a cause in a completed change that altered the code and the one spec it was
about, but not the other specs that restated the same fact.

Measured 2026-09-12 by shape — tier words each game's `tierNames(...)` call does
not produce, backticked repo paths that resolve to nothing tracked, and present-
tense mentions of the C engine. **Re-take the census before trusting this list**
(tasks § 1); it is a sample of what the instruments found, classified by reading
each line.

### 1. Difficulty tiers named in the vocabulary `adopt-conventional-tier-names` replaced

That change renamed the tiers of every tiered game and carried one spec delta,
on `ts-engine`. The game specs still spell out the old words in their params,
presets, solver ladders and scenarios: `bridges` (Easy / Medium / Hard),
`clusters` (Tricky), `dominosa` (Trivial / Basic / Hard), `galaxies` (Normal for
Easy), `group`, `keen` and `towers` (Extreme), `lightup` (easy / tricky / hard,
and a "current Hard tier" awaiting an owner decision), `salad` (Normal and
Extreme), `seismic` and `slant` (Hard), `singles` and `tents` (Tricky), `spokes`
(Tricky for Normal), `tracks` (Hard), `undead` (a `diff: "tricky"` scenario),
`unequal` (Trivial / Extreme). Salad's `state.ts` doc comments say the two tiers
are "shown as Normal" and "shown as Extreme"; the menu says Easy and Normal.

Not stale, and to be left alone: a sentence explaining a rename *from* an
upstream word ("named `Unreasonable` rather than upstream's `Normal`") in
`bricks`, `mathrax`, `undead`, `spokes`, `dominosa` and `unequal`.

### 2. A declaration the engine deleted

`audit-input-mode-parity` removed `Game.needsRightButton` with all eighteen
declarations. `bridges`, `dominosa`, `magnets` and `tents` still require
`needsRightButton = true` in their first requirement.

### 3. The per-game C/WASM hybrid, in the present tense

- `flip` and `galaxies`: "… is served by the native TS engine" requires every
  other game to keep loading through C/WASM and `puzzles/<game>.c` to be deleted.
- `quick-save`: the slot "works for both TS-engine and C/WASM games".
- `ts-engine`: requirements that still specify what "an unported C/WASM game"
  reports (`canFindMistakes`, `canMarkAll`, `hasReference`, each with an
  "unported game" scenario), and "A TS-ported game stays in the catalog without a
  wasm artifact", whose scenario names a `catalog.json` that is now
  `src/puzzle/catalog-data.ts`.
- `ts-migration`: a scenario in which "unported games continue using the C
  implementation".

### 4. Requirements the code contradicts

- `netslide` "solves by replaying the generator's grid" requires Solve to report
  "solution not known" without `aux`; a later requirement in the same spec, and
  the code, recover the grid from the board instead.
- `palisade`'s hint requirements say referenced cells and cited regions are
  *shaded* `COL_HINT_CELL`; the renderer outlines them, and the spec's own later
  scenario already says "outlined".
- `repo-layout` "Cloudflare Pages tooling is not maintained in-tree" says the
  fork does not deploy to Cloudflare Pages and cites a deleted `PLAN.md`; CI
  publishes there with `wrangler-action`.
- `random` lists the surface as upstream's `random_new`, `random_bits`, … and
  `random_free`; the module exports `randomNew`, `randomBits`, … and has no free.
- `grid`: eight requirements say "`grid.ts` SHALL provide"; the module is
  `src/engine/grid/` behind `index.ts`.
- `ts-engine` cites `puzzle-view.ts` (now `src/puzzle/components/view.ts`);
  `repo-layout` lists `head-matter.ts` among the components "currently" present.
- `undead` "returning its four monster-entry keys" — check the count against
  what the list and `requestKeys` actually hold.

### 5. A help page that understates a game

`help/games/bridges.md` says bridges "may be single or double"; the Custom
dialog allows up to four between a pair. Player-visible, and plainly a
correction rather than a design choice.

## What Changes

- Spec deltas on the affected capabilities, restating each requirement in the
  tree's present terms. No behavior changes: every correction brings text to the
  code, never the reverse. Where a scenario describes a case that no longer
  exists (an unported game), it is retired with `REMOVED` plus `ADDED`, never a
  `MODIFIED` that keeps its heading over a rewritten body.
- The Salad doc comments and the Bridges help sentence.

## Impact

- `openspec/specs/*` via deltas: roughly two dozen capabilities.
- `src/games/salad/state.ts` (comments only), `help/games/bridges.md`.
- No player data, no board, no behavior.
