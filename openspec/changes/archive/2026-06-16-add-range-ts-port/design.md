# Design: Port Range to TypeScript

Range (Kurodoko / Kuromasu) is a small, self-contained logic game. This
note records the decisions that aren't a mechanical transcription of
`range.c`.

## D1 — Grid representation: one `Int8Array` with signed sentinels

Upstream stores the whole board in one `puzzle_size *grid` (signed char):
positive values are clue numbers, and the negatives `BLACK = -2`,
`WHITE = -1`, `EMPTY = 0` are the three non-clue cell states (WHITE is the
user's "dot" pencil-mark; EMPTY is undecided). We keep this exact encoding in
an `Int8Array` rather than splitting clues from marks, because the solver,
`runLength`, `findErrors`, and the desc codec all read clues and marks
through the same array and the same `> 0` / sentinel tests. Splitting them
would force every one of those to consult two structures. Clue cells are
identified by `grid[i] > 0` and are never written by a move (`interpretMove`
returns `null` on a clue cell, matching upstream `if (cell > 0) return NULL`).

A clue value and `EMPTY` can both be small non-negatives only at the boundary
`0`: a clue is always `>= 1` (a run length is at least 1), so `0` is
unambiguously EMPTY. No separate clue mask is needed.

## D2 — `runLength` colour masks ported as exact integers

`runLength(r,c,dr,dc,mask)` walks a ray counting cells whose state matches
`mask`, with a special rule for clue cells. The C masks use `MASK(n) = 1 <<
(n+2)` so that `BLACK/WHITE/EMPTY` (−2/−1/0) map to bits 0/1/2. A clue cell
(`grid > 0`) is counted iff `mask` carries **any** bit above bit 2
(`mask & ~(MASK(BLACK)|MASK(WHITE)|MASK(EMPTY))`), i.e. iff the mask was
built to include "positive" values. We port the masks as the same integer
expressions (`~(1 | 4)`, `MASK(EMPTY) = 4`, …) and test clue cells with the
same high-bit check. The shifts only ever apply to states in {−2,−1,0} on the
hot path (`MASK(grid)` is 1/2/4), so 32-bit JS bitwise ops are exact; no large
shift is ever evaluated. This faithfulness matters — the not-too-big rule's
arithmetic depends on the precise white/empty/beyond/space partition these
masks produce.

## D3 — Move model: a list of cell-sets, not a string

Upstream encodes moves as strings: an optional `S` (solve/cheat) prefix
followed by zero-or-more `"{B|W|E},r,c"` cell-sets (a single click emits one;
a shift-cursor stroke can emit two; Solve emits the whole solution). The
idiomatic TS move is the structured equivalent:

```ts
type RangeCellValue = "black" | "white" | "empty";
interface RangeMove {
  solve?: boolean;                                  // upstream "S": sets cheated + solved
  sets: { r: number; c: number; value: RangeCellValue }[];
}
```

`executeMove` applies each set (throwing on out-of-bounds or a clue cell),
then — unless `solve` is set — recomputes `wasSolved = !findErrors(state)`.
This covers single clicks, the shift-cursor double-set, and Solve uniformly,
is JSON/structured-clone-safe (default `serialiseMove`), and lets
`hintKeepTrack` stay unused (no hint this change).

## D4 — `findErrors` is the solved-check *and* the live-error overlay

Range is unusual: it highlights rule violations **as you play**, in
`game_redraw`, by calling `find_errors(state, report)` every frame and
colouring offending cells red. This is upstream behaviour, not the fork's
`findMistakes` divergence, so we keep it: `redraw` runs `findErrors` into a
per-cell boolean array and reddens those cells. The same `findErrors` with no
report is the boolean solved-check (`wasSolved = !findErrors`) that
`executeMove` uses. The three checks it performs — no black cell adjacent to
another black; each clue's `h + v - 1` visible-run equals its number; all
white cells one connected component (via `dsf`) — are exactly upstream's.

`findErrors` flags *current rule violations*. It does **not** catch a black
that is merely wrong relative to the unique solution but not yet
rule-violating. That stronger check is `findMistakes` (D5).

## D5 — `findMistakes`: contradiction with the re-solved unique solution

For Check & Save we add the optional `findMistakes` hook (absent upstream).
It re-solves the puzzle from its initial clues with full recursion (the
solver is complete for valid Range boards), giving the canonical
black/white assignment, then flags every player-marked non-clue cell that
contradicts it: a cell the player painted `BLACK` that is white in the
solution, or `WHITE`-dotted that is black. EMPTY cells are never mistakes
(undecided). This is ~20 lines over the Solve path and gives Check & Save
genuine value beyond the live rule-violation display, which can't see a
not-yet-contradictory wrong guess.

The initial clue board for re-solving is reconstructed by stripping the
player's marks (keep `grid[i] > 0`, set everything else to EMPTY) — the
clues are immutable, so this recovers the puzzle as dealt.

## D6 — Recursion depth

Two algorithms recurse on board size: the generator's white-region
flood-fill count and the solver's biconnected-component DFS (lowpoint
cut-vertex detection). Both have depth bounded by the white-region size. The
four presets top out at 16×11 = 176 cells; the simple flood-fills are written
iteratively, and the cut-vertex DFS is kept recursive because an explicit
stack obscures the lowpoint algorithm and 176 frames is trivial. Custom
boards far larger than the presets would already be impractically slow to
generate in C; if a real need appears, the DFS converts to an explicit stack
without changing behaviour. Noted, not pre-optimised.

## D7 — No hint this change

Upstream's `'h'` key returns one next deduced move with no explanation. A
fork-grade hint (Palisade exemplar) must narrate *why* the move is forced —
which of the four reasoning rules fired and its premises ("this clue already
sees `n` white cells, so the next cell in this direction must be black").
That is a real hint-design task on top of the solver, deferred as a natural
follow-up exactly as Mosaic deferred its 3×3-neighbourhood hint. Wiring the
bare one-move hint now would ship a sub-bar hint we'd have to redo.
