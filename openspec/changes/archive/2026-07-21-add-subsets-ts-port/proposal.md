# add-subsets-ts-port

## Why

**Subsets is a genuine deductive puzzle, and porting it adds a game shape this
collection does not yet have.** You are given a grid and every set over an
`n`-letter universe; place each set exactly once so the horseshoe (⊃) clues hold
— an arrow points from a superset to a subset, and *all* possible arrows are
shown, so a missing arrow between two cells is itself a constraint (neither set
contains the other). Invented by Inaba Naoki, it ships in the `x-sheep`
third-party collection under `puzzles/unreleased/`.

It is a natural TS port now. The C runtime is retired; Subsets is small
(~1,724 lines), depends on nothing beyond `shuffle` (already in `random.ts`), and
its generator is **solver-gated with a unique-solution guarantee** — so it is a
real logic game that ships `findMistakes` (its rule validator already exists) and
is a candidate for a later explained hint. Its two catalog icons already exist.

## What Changes

- **`src/native/games/subsets/`** — the game, following the established multi-file
  port shape (`state` / `solver` / `generator` / `render` / `index`).
- **The desc codec** — the per-cell run-length encoding (a fixed set number or `_`
  for a blank, then `U`/`R`/`D`/`L` arrow markers, comma-separated), ported as an
  exact inverse of `attempt_load_game` / `new_game_desc` (byte-match surface).
- **The deductive solver** — the six-rule candidate-elimination loop over a
  per-cell "cube" of possible set-values (arrow propagation, disjointness, single
  count/position, cube↔bits sync, advanced arrow-subset). Ported **exactly as
  compiled**, including the disabled second half of the advanced rule, because the
  solver's verdict gates which clues the generator keeps (design D2).
- **The uniqueness-gated generator** — assign all `2^n` sets to the grid by one
  `shuffle`, derive every arrow clue, then in a shuffled order blank each cell and
  keep it blank only while the solver still reaches a complete solution (D3).
- **The sub-cell tri-state input model** — each cell is a small grid of letter
  slots; left/right-click cycles a slot through known / unknown / cleared, with a
  keyboard cursor. Modelled as a discriminated-union `Move`, not a move string (D4).
- **`findMistakes`** — Subsets is uniquely solvable, so it ships `findMistakes`
  (Check & Save depends on it): surface the rule-validator's flags — a duplicated
  placed set, and any arrow whose subset/superset (or missing-arrow disjointness)
  relation is violated (D5).
- **`solve()` and `textFormat`** — ported faithfully (upstream ships both).
- **A byte-match differential** against a new `puzzles/auxiliary/subsets-trace.c`,
  asserting the TS `newDesc` reproduces the C desc byte-for-byte across seeds —
  validating generator, solver and codec together over the bit-identical
  `random.ts` (D6).
- **Registration** in `ts-ported-ids.ts` + `games/index.ts` (stage 1); the
  C/WASM build stays as the fallback until stage 2.
- **Stage 2, on owner acceptance**: add `TS_PORTED` to `puzzle(subsets …)` in
  `puzzles/unreleased/CMakeLists.txt`, delete `puzzles/unreleased/subsets.c`, and
  rebuild.

Explicitly **not** in this change:

- **An explained hint** — Subsets is deductive and is a strong hint candidate, but
  an explained `hint()` is always its own change, per every prior port.
- **New sizes / a Custom dialog** — upstream locks Subsets to `4×4`, `n = 4`
  (`validate_params` rejects anything else, and `configure` is `false`). The port
  matches that: one preset, no custom-params dialog (D8). Other sizes are an
  upstream TODO and a future change.

## Impact

- Affected specs: new `subsets` capability.
- Affected code: new `src/native/games/subsets/`, registration in
  `ts-ported-ids.ts` + `games/index.ts`, new `puzzles/auxiliary/subsets-trace.c`.
- Stage 2 marks Subsets `TS_PORTED` and deletes `puzzles/unreleased/subsets.c`.
- No icon work: `src/assets/icons/subsets-{64,128}d8.png` already exist, so the
  `puzzle-icons` obligation is already met.
