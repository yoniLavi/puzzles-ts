# Proposal: Port Undead to native TypeScript

**Status**: Proposed

## Why

Undead ("Haunted Mirror Mazes", after janko.at's *Spukschloss*) is the next
migration-order port — listed in the Latin-family slot (Unequal → Keen → Undead →
Solo) for its **pencil-mark UX kinship**, though it is *not* a Latin-square game
and does **not** use `engine/latin.ts`. The player fills a `w × h` grid (each cell
is either a fixed diagonal **mirror** `\`/`/` or a **monster** cell) with one of
three monsters — **Ghost**, **Vampire**, **Zombie** — subject to:

- **Total counts** of each monster type (given above the grid).
- **Sightline clues** around the grid edge. A sightline enters at an edge cell and
  travels straight, **bouncing off mirrors**, until it exits at another edge cell;
  the clue at each end counts the monsters *visible* along that line. Visibility
  depends on type: a **vampire** is visible only on the *direct* (pre-reflection)
  part of a line, a **ghost** only on the *reflected* (post-mirror) part, and a
  **zombie** is always visible.

`undead.c` is ~3050 lines. Its hard parts are the **mirror-maze path tracer**
(`make_paths` + `range2grid`/`grid2range`), a **per-path candidate-enumeration
solver** (`solve_iterative`) backed by a **whole-grid brute-force uniqueness
check** (`solve_bruteforce`), both driven by a shared odometer (`next_list`) over
the `{ghost, vampire, zombie}` choice at each cell, and a generator that seeds
unique-solution paths (`get_unique`) then grades difficulty by iteration depth +
ambiguity + brute-force need. It carries the full **pencil-mark UX** (mark-all,
sticky pencil, the corner indicator, note-mistakes) the family shares, plus three
Undead-specific UI niceties: a **monster-count display style** toggle
(total / remaining / placed-of-total), a **pictures-vs-letters** monster toggle,
and **strike-through "done" marks** on satisfied edge clues.

It has **no long-tail-risk entanglements**: no `midend_supersede_game_desc` (the
desc — mirror layout + totals + sightings — never changes), no
undo-by-state-equality (every move is a definite cell/pencil/clue toggle and
`interpret_move` returns `UI_UPDATE`/null for no-ops), and no `#ifdef EDITOR`
input. It uniquely determines its solution, making it a natural `findMistakes`
(Check & Save) carrier and a future `hint()` candidate (a separate change).

## What Changes

- **New `src/native/games/undead/` port** implementing
  `Game<UndeadParams, UndeadState, UndeadMove, UndeadUi, UndeadDrawState, UndeadMistake>`:
  - `state.ts` — `{ w, h, diff }` params (Easy / Normal / Tricky); the desc codec
    (totals + run-length grid + comma-separated sightings); the immutable shared
    `UndeadCommon` (grid `(w+2)·(h+2)`, `xinfo` cell→monster-index map, the traced
    `paths[]`, `fixed[]`, per-type totals) built once by `newState`; the mutable
    `UndeadState` (`guess` per-cell monster bitmask `1..7`, `pencils`, the live
    error overlays `cellErrors`/`hintErrors`/`countErrors`, `hintsDone`,
    `solved`/`cheated`); `cloneState`; the move/ui types; `makePaths` +
    `range2grid`/`grid2range`/`num2grid` + `isClue`/`clueIndex`.
  - `solver.ts` — `nextList` (the `{1,2,4}`-per-cell odometer over a `possible`
    bitmask), `checkNumbers`/`checkSolution` (count + sightline validators),
    `solveIterative` (per-path candidate intersection to a fixpoint),
    `solveBruteforce` (whole-grid unique-solution search), the `solveUndead`
    grading driver, and `findUndeadSolution` (re-solve to the unique solution for
    `solve`/`findMistakes`).
  - `generator.ts` — `newUndeadDesc`: random mirror/monster fill with ratio +
    path-length gates, `getUnique` seeding of unique-solution paths, random fill
    of the remainder, sighting computation, and the difficulty grade-and-retry
    loop; encodes the desc + an `aux` solution string. Ported faithfully over
    `random.ts` (deterministic in TS), but **not** byte-match-gated — see Design.
  - `render.ts` — palette index-for-index with the C enum; the monster-count row
    layout (`calculateCountLayout`) + the three count blocks; the edge sighting
    hints (strike-through when "done", red on error); the grid cells — mirrors
    (thick diagonals), drawn ghost/vampire/zombie shapes *or* ASCII letters,
    2×2 pencil grids, the highlight background (+ pencil-mode corner triangle);
    the solve flash; the per-tile diff cache; the Check & Save mistake overlay;
    the pencil-mode indicator.
  - `index.ts` — `Game` glue: `interpretMove` (highlight cursor + select; left =
    real, right = pencil with the family's sticky-pencil + filled-cell rules;
    `G`/`V`/`Z`/`1`/`2`/`3` entry and `E`/`backspace` clear honouring pencil mode;
    `M` → mark-all; `D` clue strike-through; `a` ascii toggle; `c`/right-click on
    a count → count-style cycle; count-block clicks place/remove a monster),
    `executeMove` (apply + recompute the live error overlays + completion),
    `solve` (uses `aux` when present), `findMistakes`, the pencil-mark UX
    (`canMarkAll`, sticky-pencil + auto?-no + keep-highlight prefs, plus the
    `monsters` and `count-style` prefs), `describeParams`, `colours`,
    `registerGame`.
- **Live error overlays are preserved (parity).** Upstream recomputes
  `cell_errors`/`hint_errors`/`count_errors` inside `execute_move` and `redraw`
  paints them red as you play (over-placing a monster type reddens its count and
  every cell of that type; a sightline that can no longer reach its clue reddens
  the clue and the whole line). The port reproduces this on every `executeMove`;
  it is distinct from `findMistakes`.
- **`findMistakes` (Check & Save).** Undead re-solves the board to its unique
  solution and flags every placed monster that contradicts it (`"cell"`) plus the
  note-mistake convention (an empty cell whose **non-empty** pencil notes have
  crossed out its solution monster — `"note"`), so Check & Save hard-blocks a
  wrong board. Solution derived from the desc clues only, never the notes.
- **Differential (solver-agreement, not byte-match).** Undead's generator sorts
  equal-`num_monsters` paths with `qsort`, whose tie-ordering is
  implementation-defined and differs across libc builds (native-glibc trace vs
  wasm-musl), so a byte-identical desc match is infeasible. Instead a gated
  `undead-differential.test.ts` decodes a frozen set of **C-generated** boards and
  asserts the TS solver reaches the same *order-independent* verdicts —
  uniquely solvable, iteratively-solvable-or-not, and the same post-fixpoint
  ambiguity count — validating the solver/codec port without the brittle
  generator byte-match. (Design D1.)
- **Stage-1 registration only.** Add `undead` to `ts-ported-ids.ts` and import it
  in `games/index.ts` so the TS impl serves it for owner smoke-testing. The
  `TS_PORTED` flag + `puzzles/undead.c` deletion happen **only on owner
  acceptance**, per the two-stage parity gate.

## Impact

- **Affected specs:** new `undead` capability (ADDED requirements: Game interface;
  desc codec; the mirror-maze path tracer; the difficulty-graded solver + unique
  generator; monster/pencil/clue moves + cursor; mirror/monster/count/hint
  rendering; the pencil-mark UX + the three preferences; live error overlays;
  mistake-checking).
- **Affected code:** new `src/native/games/undead/*`; one line each in
  `ts-ported-ids.ts` and `games/index.ts`; `puzzles/auxiliary/undead-trace.c` +
  its `cliprogram()` line (deleted with `undead.c` at acceptance). No change to
  `undead.c` until owner acceptance (stage 2).

## Out of scope

- An explained `hint()` is a **separate** change (`add-undead-hint`). Undead's
  graded deductive solver makes it a Palisade-bar candidate (narrate *why* a
  sightline forces a monster), but per the hint-authoring guide that is its own
  parity-gated change.
- Printing (`game_print`) — no TS replacement fork-wide.
- Hand-entered fixed-monster puzzles (Janko-style `aVaVaG…` descs): the codec and
  solver SHALL accept them (fixed cells honoured), but the internal generator does
  not emit them, matching upstream.
