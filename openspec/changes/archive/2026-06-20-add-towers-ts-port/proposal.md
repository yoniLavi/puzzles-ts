# Proposal: Port Towers (Skyscrapers) to native TypeScript

**Status**: Proposed

## Why

Towers (a.k.a. *Skyscrapers*) is migration-order port #19. It is a Latin-square
puzzle: fill a `w × w` grid so each row and column contains every height
`1..w` exactly once, subject to the outside clues — each clue counts how many
towers are *visible* from that edge (a taller tower hides every shorter one
behind it). `towers.c` is ~2269 lines.

It is the natural next port because it is the first game that needs the **full
generic `latin_solver` framework** (`latin.c`'s solver half: the candidate
cube, positional/numeric elimination, set elimination, forcing chains, and
recursion), not just `latin_generate`. That framework is shared upstream by
Towers, Solo, Unequal, Keen and Group — porting it once to `engine/` unblocks
all of them, and Singles already proved the `latin_generate`/`matching` half is
RNG-faithful. Towers also introduces the **Sudoku-style number-entry UI**
(digit/pencil-mark entry, mouse + keyboard cursor, immutable clue cells) that
the remaining number-placement games reuse, and a distinctive **3D tower
rendering** mode.

It has **no long-tail-risk entanglements**: no `midend_supersede_game_desc`
(the desc is fixed clues + givens and never changes), no undo-by-state-equality
(every move is a definite cell/pencil toggle, completion is locally decidable
via `check_errors`), and the only `#ifdef EDITOR`-ish input is the dev-only
`'M'` fill-all-pencil-marks key (kept for fidelity). It uniquely determines its
solution, making it a natural `findMistakes` (Check & Save) carrier and a strong
future `hint()` candidate (a separate change).

## What Changes

- **New generic Latin solver in `src/native/engine/latin.ts`.** Port `latin.c`'s
  solver half idiomatically as a `LatinSolver` class + a `latinSolver(...)`
  entry point: the `o³` candidate cube, `place`, positional elimination
  (`elim`/`diffSimple`), set elimination (`set`/`diffSet`, row/col and the
  extreme single-number variant), forcing chains (`forcing`), and the recursive
  guess-and-verify (`recurse`) used for the hardest difficulty and for
  uniqueness checking. Generic over a game's `usersolvers` + `valid` callbacks,
  exactly like upstream. The negative-result sentinels stay numeric and faithful
  (`DIFF_IMPOSSIBLE = 10`, `DIFF_AMBIGUOUS = 11`, `DIFF_UNFINISHED = 12`).
- **Promote the Latin *generator* to `engine/latin.ts`.** Move
  `matching`/`latinGenerate`/`latinGenerateRect` out of `singles/generator.ts`
  (Towers is the second consumer — the playbook's promote-on-second-consumer
  rule) and re-point Singles at the shared module. The Singles differential test
  guards that the move is byte-for-byte behaviour-preserving.
- **New `src/native/games/towers/` port** implementing
  `Game<TowersParams, TowersState, TowersMove, TowersUi, TowersDrawState,
  TowersMistake>`:
  - `state.ts` — `{ w, diff }` params (Easy/Hard/Extreme/Unreasonable), the
    clue+grid desc codec (`/`-separated edge clues, run-length grid givens),
    immutable shared `clues`/`immutable` typed arrays + mutable `grid`/`pencil`/
    `cluesDone`, `completed`/`cheated`, `cloneState`, `textFormat`, the
    `STARTSTEP`/`CLUEPOS` clue-geometry helpers.
  - `solver.ts` — Towers' two `usersolver`s (`solverEasy` clue heuristics,
    `solverHard` exhaustive per-clue analysis) + `towersValid`, driven through
    the shared `LatinSolver`; the `solveTowers(w, clues, soln, maxdiff)` driver
    mapping Easy→simple, Hard→set₀, Extreme→set₁+forcing, Unreasonable→recursion.
  - `generator.ts` — `newTowersDesc`: Latin square → derive all `4w` clues →
    remove givens then clues while the solver still grades exactly at the target
    difficulty (the empty-grid special-case for small Easy boards included).
  - `render.ts` — palette index-for-index with the C enum, `computeSize`/
    `setTileSize`, the `(w+2)²` clue-border tile model, the per-tile cache, the
    3D tower polygons + 2D fallback, pencil-mark grid layout, clue cells with
    done/error colouring, cursor, and completion flash.
  - `index.ts` — `Game` glue: `interpretMove` (3D click hit-testing, left/right
    cell select + pencil highlight, off-grid clue strike toggle, keyboard cursor
    incl. shift/ctrl to reach clues, digit/backspace entry), `executeMove`,
    `status`, `solve` (uses `aux` when present), `findMistakes`, the `prefs` hook
    (3D appearance, keep-pencil-highlight), `registerGame`.
- **`findMistakes` (Check & Save).** Towers re-solves from its immutable clues +
  givens to the unique solution and flags every player grid cell that
  contradicts it, so the shipped Check & Save control hard-blocks a wrong board
  (the gap the playbook calls out: a solvable game without `findMistakes`
  silently saves mistakes).
- **Differential.** Towers earns a gated byte-match differential
  (`towers-differential.test.ts` vs a frozen C trace): `random.ts` is
  bit-identical and the whole generation path (Latin square → clue derivation →
  solver-gated removal) is RNG-faithful, so a faithful port reproduces the C
  desc exactly for the same seed at each difficulty. A live
  `scripts/diff-towers.test.ts` backs it while `towers.c` exists (deleted with
  the C at acceptance).
- **Stage-1 registration only.** Add `towers` to `ts-ported-ids.ts` and import
  it in `games/index.ts` so the TS impl serves it for owner smoke-testing. The
  `TS_PORTED` flag + `puzzles/towers.c` deletion happen **only on owner
  acceptance**, per the two-stage parity gate.

## Impact

- **Affected specs:** new `towers` capability (ADDED requirements: Game
  interface, clue+grid desc codec, Latin-square generator, the difficulty-graded
  clue solver, digit/pencil moves + cursor, 3D/2D rendering, the two
  preferences, mistake-checking). New shared `latin-solver` capability under the
  `ts-engine` umbrella (the generic framework + generator promotion).
- **Affected code:** new `src/native/engine/latin.ts`; `singles/generator.ts`
  re-points at it; new `src/native/games/towers/*`; one line each in
  `ts-ported-ids.ts` and `games/index.ts`; `puzzles/auxiliary/towers-trace.c`
  + its `cliprogram()` line (deleted with `towers.c` at acceptance). No change
  to `towers.c` until owner acceptance (stage 2).

## Out of scope

- An explained `hint()` is a **separate** change (`add-towers-hint`). Towers'
  graded deductive solver makes it a strong Palisade-quality-bar candidate
  (narrate *why* each digit is forced: the visibility/clue reasoning), but per
  the hint-authoring guide that is its own parity-gated change.
- Printing (`game_print`) — no TS replacement fork-wide; out of scope for every
  port so far.
- Grid sizes above 9 (upstream's documented solver-speed ceiling).
