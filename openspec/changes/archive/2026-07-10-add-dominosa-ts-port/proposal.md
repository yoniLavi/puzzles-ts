# Port Dominosa (dominosa.c) to native TypeScript

## Why

Dominosa is the next game in the top-down migration: a classic pure-logic
puzzle (~3600 lines of C) with a **graded deductive solver** (five levels:
Trivial / Basic / Hard / Extreme, plus an Ambiguous "just scramble" mode) and a
unique solution — a strong fit for the fork's `findMistakes` / Check-&-Save
contract and a future explained-hint candidate (a separate change). Both of its
shared-library dependencies are **already ported**: `findloop.ts` (Tarjan
bridge-finding, used by the parity deduction) and `laydomino.ts`
(`dominoLayout`, the RNG-faithful 2×1 tiling used by the generator). Porting
Dominosa makes it `laydomino.c`'s **last** C consumer, so `puzzles/laydomino.c`
can be deleted at stage 2 alongside `dominosa.c`.

No `midend_supersede_game_desc`, no editor-only move letters, no
undo-via-state-string equality. The generator is a brute-force "generate,
solve, keep if solvable at exactly the target difficulty" loop; its only RNG
draws are `dominoLayout` plus a handful of `shuffle`/`random_upto` calls in the
allocator, all reproducible over the bit-identical `random.ts` — so a
**byte-match differential** is feasible (the generator is solver-gated, §4.4:
the TS solver must reach C's exact verdict on every board).

## What Changes

- Add a **flip (parity) DSF** to `src/native/engine/dsf.ts` as a `FlipDsf`
  class (`dsf_new_flip` / `dsf_canonify_flip` / `dsf_merge_flip`), the parity
  union-find the forcing-chain deduction needs. Idiomatic TS, ported
  faithfully from `dsf.c`; tier-1 test.
- Add `src/native/games/dominosa/` implementing
  `Game<DominosaParams, DominosaState, DominosaMove, DominosaUi, DominosaDrawState, DominosaMistake>`:
  place one of every possible domino (all number-pairs from `0-0` to `n-n`)
  into an `(n+2) × (n+1)` grid so each square's number matches its clue. Params
  `n` (max face number, default 6) and `diff`; all 12 upstream presets.
- Port the **graded solver** (`run_solver` + the nine `deduce_*` techniques)
  faithfully with its exact deductive power at each level: Trivial
  (domino/square single-placement), Basic (square-single-domino,
  domino-must-overlap, two local-duplicate rules, and the **parity** deduction
  via `findloop.ts`), Hard (set analysis, non-doubles), Extreme (set analysis
  with doubles, and the **forcing-chain** deduction via `FlipDsf`). Returns the
  impossible / unique / ambiguous (0 / 1 / 2) verdict identical to C.
- Port the **generator** (`new_game_desc` + the `alloc_*` allocator):
  `dominoLayout` a random tiling, then assign numbers by one of three
  strategies keyed on difficulty (`alloc_trivial` for Ambiguous,
  `alloc_try_unique` below Hard, `alloc_try_hard` for Hard+), reject boards not
  soluble at exactly the target difficulty, and emit the row-major number desc
  (`[NN]` bracket-escape for numbers ≥ 10) plus the solution `aux`. The
  difficulty cap for tiny boards (`n==1`→Trivial, `n==2`→Basic) is ported.
- Ship **`findMistakes`** (boards are uniquely solvable; Check & Save depends
  on it): re-solve to the unique solution and flag both cells of any
  player-placed domino the solution does not contain; a board that is not
  uniquely solvable yields none. Rendered as an inset red overlay, distinct
  from the always-on red **clash** highlight (a domino value placed twice).
- Port the input model: left-click / `CURSOR_SELECT` between two adjacent
  numbers toggles a domino; right-click / `CURSOR_SELECT2` between two adjacent
  empty squares toggles a barrier edge (annotation); right-click or a digit key
  on a number toggles one of two value highlights (a UI-only solver aid). A
  half-grid keyboard cursor (`2w−1 × 2h−1`) selects domino gaps and edges.
- Render to parity: rounded-corner domino ends (circles + rects), the clue
  numbers, barrier edge lines, the two-colour value highlights, the red clash
  fill, the half-grid cursor corners, and the completion flash, under the web
  build's `NARROW_BORDERS` geometry (`BORDER = −DOMINO_GUTTER`). Palette
  index-for-index with the C enum; the fork mistake overlay appended past it.
- Byte-match differential: transient `puzzles/auxiliary/dominosa-trace.c`
  records preset/seed → desc fixtures; a committed gated test asserts `newDesc`
  reproduces them exactly plus the TS solver grades each C board at the recorded
  difficulty.
- Register the game for owner smoke-testing (stage 1). On owner acceptance,
  flip `TS_PORTED`, delete `puzzles/dominosa.c`, `puzzles/laydomino.c` (now
  unused) and the trace harness, and archive this change (stage 2).

## Impact

- Affected specs: **new `dominosa` capability**; a note in `repo-layout` for
  the new shared `FlipDsf` in `engine/dsf.ts`.
- Affected code: `src/native/engine/dsf.ts` (FlipDsf),
  `src/native/games/dominosa/` (new),
  `src/native/games/ts-ported-ids.ts` + `src/native/games/index.ts`
  (registration), `puzzles/auxiliary/{CMakeLists.txt,dominosa-trace.c}`
  (transient trace harness), `puzzles/CMakeLists.txt` (`TS_PORTED` at stage 2),
  `puzzles/dominosa.c` + `puzzles/laydomino.c` (deleted at stage 2).
- No pencil-mark UX (no candidate grid). No keypad (upstream
  `game_request_keys` is NULL). No prefs. No supersede, no printing port, no
  editor letters (documented skips). No app-shell changes.
</content>
</invoke>
