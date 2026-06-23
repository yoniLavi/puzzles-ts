# Design: Keen hint

This is the Towers/Unequal hint re-applied to the third Latin-family game. The
shared recording machinery in `engine/latin.ts` is unchanged; only the
game-specific pieces differ. Read `docs/porting/hint-authoring.md` §9 first.

## Decisions

### D1 — Record the cage user-solver; one firing = one `group` (return-per-firing)

The generic Latin layers (`place`/`elim`/`set`/`forcing`) already record. Keen's
three cage user-solvers all funnel through one routine, `solverCommon`, which for
each cage enumerates the digit layouts consistent with its clue and prunes the
cube. Thread `solver.recorder` through the two pruning sites:

- **EASY/NORMAL** (`diff < DIFF_HARD`): the per-square loop rules a digit out of a
  cage cell because no consistent layout uses it there → a `cage` reason.
- **HARD**: the cross-line loop rules a required digit out of the rest of a
  row/column outside the cage → a `cageLine` reason.

Each cage loops over *every* box and (on the non-recording generate path)
accumulates across all of them — so, exactly like Towers' `lowerBound` block, a
recording pass that didn't stop would lump several cages' eliminations under one
`group`, and a hint step would narrate one cage while struck marks bled in from
another. Fix: on the recording path, `return ret` after the first box (EASY/NORMAL)
or first line (HARD) that changes the cube, gated on the recorder so the generate
path stays byte-identical. (The HARD branch already returned after one cross-box
hit for diagnostics; the recording return is finer — per line — so one `cageLine`
group is one digit-out-of-one-line firing.)

### D2 — No extreme-clue / facing specials; basic-Latin opening kept

Keen, like Towers, has no note-free forced-placement specials (no facing clue, no
extreme-clue line fill), so its plan opens (after a lazy `pencilAll` populate) on
cage eliminations. It keeps the **basic Latin** row/column dup sweep that Unequal
introduced — not because Keen has givens (it has none), but because a player can
place a digit with auto-pencil *off*, leaving that digit live in its row/column
notes; the recording solver seeds its cube from the placed grid and culls those
during `alloc` (before recording is enabled), so they are never in the recorded
script. The basic-Latin sweep teaches them honestly and re-derives from the current
filled cells each recompute (resume-safe). On a fresh populated board with no
placements it finds nothing, so it never interferes with the empty-start walk.

### D3 — Cage narration named by an operation goal phrase

A cage elimination's premise is the cage's arithmetic clue, so the narration names
it: a per-operation goal phrase (`sum to V` for `+`, `multiply to V` for `×`,
`differ by V` for `−`, `have a ratio of V` for `÷`) read off the packed clue. The
`cage` (NORMAL) conclusion is per cell — "No way to make this cage {goal} puts
{values} in this cell, so we must cross out {values}" — with all cells of one cage
firing linked as one `continuesPrevious` journey (one cage = one journey). The
`cageLine` (HARD) conclusion is per struck value — "Every way to fill this cage
puts a {n} in this {row/column}, so a {n} elsewhere in it is ruled out".

### D4 — Reuse the existing first-class-notes machinery

`pencilStrike`, the auto-pencil/sticky/fill-all UX, and `findMistakes`
note-mistake detection all shipped with the base port. The hint adds no move type
and no `findMistakes` change.

## Alternatives rejected

- **Per-cage single step striking every cell at once** (one step, many cells):
  rejected — the narration would have to say "in these cells" and a multi-cell
  `COL_HINT` placement-fill would wash out the struck candidates. Splitting one
  cage firing into a per-cell journey (each cell its own step, linked
  `continuesPrevious`) keeps each step's narration about "this cell" and each
  target a single highlighted cell, matching Unequal's per-cell clue strikes.
- **Skipping the HARD `cageLine` recording**: rejected — hard+ boards are graded
  solvable using the HARD cross-line deduction, so the recording solver must make
  the same deductions or the plan stalls (the resume guarantee would fail).
- **Recording given placements during `alloc`**: N/A — Keen has no givens; the
  basic-Latin sweep on the planner side covers player placements without touching
  the shared `latin.ts`.
