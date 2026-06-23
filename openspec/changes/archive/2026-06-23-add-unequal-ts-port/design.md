# Design: Unequal TS port

Context: migration-order port #20, the first Latin-square-family game after
Towers. Reuses the shared `engine/latin.ts` framework. The Towers port
(`src/native/games/towers/`) is the structural exemplar; this document records
only the Unequal-specific decisions and the long-tail-risk stances.

## D1 — Reuse `engine/latin.ts` unchanged; Unequal is the second consumer

Unequal's C solver calls `latin_solver_main(solver, maxdiff, diff_simple=LATIN,
diff_set_0=SET, diff_set_1=EXTREME, diff_forcing=EXTREME, diff_recursive=
RECURSIVE, usersolvers, valid, ctx, clone_ctx, free_ctx)`. This maps directly
onto `latinSolver(grid, o, cfg)` with:

| `cfg` field | Unequal value |
| --- | --- |
| `diffSimple` | `DIFF_LATIN` (0) |
| `diffSet0` | `DIFF_SET` (2) |
| `diffSet1` | `DIFF_EXTREME` (3) |
| `diffForcing` | `DIFF_EXTREME` (3) |
| `diffRecursive` | `DIFF_RECURSIVE` (4) |
| `usersolvers` | `[null, solverEasy, solverSet, null, null]` |
| `valid` | `unequalValid` |

Note Unequal has **five** difficulty levels (Trivial/Easy/Tricky/Extreme/
Recursive), where Towers had four — the framework loop `for i in 0..maxdiff`
already handles any count, applying `usersolvers[i]` plus the generic deduction
keyed to that index. `DIFF_LATIN` (0) is pure Latin (just `diffSimple`);
`DIFF_EASY` (1) adds `solverEasy`. **No framework change is required.**

`clone_ctx` in C rebuilds the link list from the (immutable) state flags — i.e.
it produces a structurally identical ctx. The Unequal solver context (mode +
flags + precomputed links) never mutates during solving, so we **share one ctx**
and omit `cfg.ctxNew` (exactly as Towers does). This is behaviour-identical to
the C clone, not a divergence.

The one framework touch is a small **additive** output: `latinSolver` gains an
optional `cubeOut?: Uint8Array` config field that receives the final candidate
cube (upstream `memcpy(state->hints, solver.cube, …)`). Unequal's greedy
clue-assembly grades each candidate clue by the *remaining possibilities* of its
cell (`gg_best_clue` reads `state->hints`), so the generator needs the cube; no
existing caller is affected (the field is omitted everywhere else). Assembly runs
strictly below `DIFF_RECURSIVE`, so the cube reflects the top-level fixpoint and
the copy happens at the non-recursive exit.

## D2 — Two modes are one game, dispatched in the solver/renderer/codec

`MODE_UNEQUAL` (greater-than) and `MODE_ADJACENT` (differ-by-1 bars) share the
desc format, state shape, UI, and generation skeleton; they differ in:

- **Solver**: `solverEasy` → `solverLinks` (Unequal) vs `solverAdjacent`
  (Adjacent); `solverSet` → `0` (Unequal — no extra set rule) vs
  `solverAdjacentSet` (Adjacent). `unequalValid` checks links vs adjacency.
- **Generator**: Adjacent mode pre-seeds *all* adjacency flags from the solution
  (`addAdjacentFlags`) and never adds/removes flag clues — only numbers are
  stripped. Unequal mode adds/removes both number and inequality clues.
- **Renderer**: `drawGt` polygons vs `drawAdjs` bars in the inter-cell gaps.
- **Codec**: identical (`URDL` flags per cell); the cross-check in `validateDesc`
  differs (Adjacent: a flag implies the reciprocal flag on the neighbour;
  Unequal: a `>` forbids the reciprocal `>`).

Carried as a `mode: "unequal" | "adjacent"` discriminant on params/state, not two
games — matching upstream's single `unequal.c`.

## D3 — The "spent" clue flag is Unequal's clue-strike, in the gaps

Upstream lets the player grey out a gt-sign / adjacency-bar they have "used"
(`F_SPENT_*`, set by `ADJ_TO_SPENT(F_ADJ_*) = F_ADJ_* << 9`). This is the
analogue of Towers' `cluesDone`, but the clues live in the *gaps between cells*,
not the outer ring. So:

- **State** carries a mutable `spent` flag-bitmap per cell (the `F_SPENT_*` bits),
  cloned per move; the immutable adjacency clues live in `clueFlags`.
- **`interpretMove`** maps a click in the gap region (`> TILE_SIZE` past a cell's
  origin in x or y) to the clue it borders, emitting a `spent` move that XORs the
  appropriate `F_SPENT_*` bit; a shift/ctrl-cursor toggles the clue between the
  current cell and the neighbour the arrow points to (upstream's `self`/neighbour
  logic, faithfully ported).
- **`render.ts`** colours a gap clue `COL_ERROR` (rule currently violated) >
  `COL_SPENT` (struck) > normal, exactly as the C `COLOUR(direction)` macro.

A flag *error* (`F_ERROR_*`) is computed live by `checkNumAdj`, mirrored into the
draw flags, never stored in canonical state — same as Towers' `errtmp`.

## D4 — `findMistakes` + note-mistakes (the Check & Save contract)

Unequal is uniquely solvable, so it ships `findMistakes` (a solvable game without
it silently saves a wrong board — the playbook's §3.5 gap). Re-solve from the
immutable givens + clues to the unique solution; flag every filled player cell
whose number contradicts it (`"cell"`), and every empty cell whose **non-empty**
pencil notes have crossed out its solution value (`"note"`) — the cross-game
note-mistake convention (Towers exemplar). The solution is derived from the
placed givens only, never the notes. Both render as the red inset overlay (§3.2:
the overlay is tracked in the diff key via a `drawnWrong` sidecar so Check & Save
repaints it even when the cell's tile is otherwise unchanged).

## D5 — Pencil-mark UX inherited from Towers

Unequal is a pencil-mark game, so it carries the full §3.7 note-taking UX:
`canMarkAll: true` (handles `M`/`m` → `pencilAll`), sticky pencil mode +
keep-highlight + auto-pencil preferences via the `prefs` hook, and the
CapsLock-style pencil-mode corner indicator. Unequal's grid has no tower
protrusion, so — unlike Towers' clue-ring corner — there is no inherently
cache-safe indicator cell; we follow the playbook's alternative and repaint the
indicator region explicitly. The first-cut indicator cell is the top-left cell's
pencil-highlight wedge area; if a cache-safe encoding is cleaner in practice, the
implementation may instead repaint a fixed corner at the end of `redraw`
(decision deferred to implementation, both are spec-conformant). The pencil-mode
body colour is a palette index appended past the upstream enum — safe because
Unequal has no dark-mode `paletteOverrides`.

## D6 — Generator is greedy-assemble + strip, not Towers' clue-derive

Unlike Towers (derive every clue from the full grid, then remove), Unequal
**assembles** clues onto a blank board: repeatedly `gg_best_clue` (the clue whose
cell has the most remaining possibilities, tie-broken by fewest existing clues)
until the graded solver solves it, then `gg_strip`s redundant clues. The scratch
ordering matters for RNG-faithfulness: upstream shuffles the **numeric** clue
codes (`4 mod 5`) and the **inequality** clue codes (`0..3 mod 5`) *separately*
(`shuffle(scratch, lscratch/5)` then `shuffle(scratch+lscratch/5, 4*lscratch/5)`)
— reproduce both, in order, over `random.ts`. The clue code is
`loc*5 + which` (`which` 4 = number, 0–3 = a direction). Port verbatim for a
byte-match desc.

`game_assemble` caps difficulty at `DIFF_RECURSIVE-1` (never use a guessing
solver during assembly — a wrong guess would confuse `gg_place_clue`). The outer
`MAXTRIES = 50` regenerate-if-too-easy loop, and the "drop a difficulty level
after MAXTRIES" fallback, are ported faithfully, wrapped in a generous
throw-on-exceeded backstop (playbook §4.6) so a porting slip fails loudly instead
of hanging.

## D7 — Differential: gated byte-match, no advisory script

`random.ts` is bit-identical and the whole generation path is RNG-faithful, so a
faithful port reproduces the C desc **exactly** for the same seed — the strongest
bar (playbook §4.3). Gate `unequal-differential.test.ts` against a frozen C trace
across both modes × each difficulty (assert `newUnequalDesc(p, seed).desc ===
fixture.desc`), plus solver-agreement (decode each C board, solver grades it at
the recorded difficulty). No advisory `scripts/diff-unequal.test.ts` is committed:
the trace binary's seeds are the fixture seeds, so a live run would only re-read
the fixture the gated test already reads — no extra signal (the same call Towers
made, design D9). Recover from git history if the C oracle is rebuilt.

The trace harness `puzzles/auxiliary/unequal-trace.c` `#include`s `../unequal.c`
to reach its `static` generator (the `STANDALONE_SOLVER` trick), built **pure-C**
(`-DUSE_TS_RANDOM=0`, §4.2 gotcha), and prints `{seed, params, desc, difficulty}`
JSON. Deleted with `unequal.c` at acceptance.

## D8 — Long-tail-risk stances (checked against `unequal.c`)

- **`midend_supersede_game_desc`**: not used. The desc is fixed clues + givens
  and never changes mid-game. No hook needed.
- **Undo via state-string equality**: not used. Every move is a definite cell
  set, pencil toggle, or clue-spent toggle; completion is locally decidable via
  `check_complete`. `interpretMove` returns `null`/`UI_UPDATE` directly.
- **`#ifdef EDITOR` move letters**: none. The only non-digit input letters are
  `M`/`m` (mark-all, kept) and `H`/`h` (upstream's one-step auto-solver hint —
  **not** ported here; the explained hint is the separate `add-unequal-hint`
  change). Upstream's `H` move letter and `solver_hint` are intentionally not
  wired into TS input.
- **`printing.c`**: out of scope fork-wide.

## D9 — Orders above 9

Upstream supports `order` up to 32, entering `11`+ as letters (`n2c`/`c2n` map
`A`–`Z`). The codec and entry are ported faithfully so a hand-typed high-order id
loads, but the presets and practical play target `order ≤ 7`. Grid sizes that big
are an upstream solver-speed concern, not a port concern.
