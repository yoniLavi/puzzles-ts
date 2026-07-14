# Design — add-netslide-hint

## Context

Netslide is a sliding-permutation puzzle: the board is a grid of Net wire pieces,
you slide whole rows and columns (toroidally, one step at a time), and you win
when every piece is connected to the powered centre. It has **no solver** — the
generator saves the unshuffled grid as `aux` and `solve` replays it.

So a hint has to *plan*: find a short sequence of slides from here to a finished
board, and explain each one. That is structurally the problem Sixteen already
solves, with three differences that are the substance of this change:

| | Sixteen | Netslide |
| --- | --- | --- |
| Piece identity | every tile is a distinct number, so its home is *given* | pieces are wire masks, and **many are identical** — the home assignment must be *chosen* |
| Slidable lines | every row and column | every row and column **except the centre ones** |
| Slide distance | any distance in one move ("full slide") | **±1 only** |
| Goal | each tile at its numbered home | every piece powered from the centre |

## Decisions

### D1 — The hint plans against `aux`, and refuses honestly without it

The target board is the generator's unshuffled grid (`aux`), which the midend
already passes to `hint(state, aux, ui)` — the same value it passes to `solve`.
Where there is no `aux` (a `params:desc` id, or a loaded save), the hint returns
`{ ok: false, error: "Solution not known for this puzzle" }`, exactly as `solve`
does today. That is faithful, honest, and consistent: a player who cannot Solve a
board cannot Hint it either, and the two fail with the same sentence.

**Rejected: reconstruct the target from the board.** In principle the finished
grid is recoverable without `aux` — the pieces must form a spanning tree rooted at
the immovable centre, and the barriers were chosen never to cross a solution wire,
so they constrain it heavily. But that is a genuine jigsaw/constraint solve, it is
a *new solver* for a game upstream deliberately gave none, and it would be the
largest part of this change by far while being invisible to the player in the
common case (a freshly generated game always has its `aux`). If loaded-save hints
are later wanted, this is the thing to build, and it should be its own change.

**Reachability is not a worry.** Slides are invertible and the board was produced
*from* `aux` by legal slides, so `aux` is always reachable from the current
position. The plan always exists; the only question is whether the search finds a
short one (D4).

### D2 — Reduce Netslide to Sixteen by *choosing* a home for each piece

Sixteen's planner works because each tile knows where it belongs. Netslide's
pieces are wire masks with duplicates — a board typically has several identical
elbows — so "where does this piece belong?" has many answers, and picking badly
makes the plan needlessly long.

Resolve it *up front*: label the current pieces by their cell, and compute a
**mask-respecting assignment** of pieces to target cells (each piece assigned to a
cell whose `aux` mask matches it) minimising the total toroidal distance. The
planner downstream then sees exactly Sixteen's problem — labelled pieces, each
with a home cell — and needs to know nothing about wires.

Implementation: the grids are small (`≤ 5×5` in the presets, and the assignment is
per-mask-group, so each group is tiny). A min-cost bipartite assignment per mask
group is cheap; a greedy nearest-first with a deterministic tie-break is likely
sufficient and is the first thing to try. **Whatever is chosen must be a pure
deterministic function of `(board, aux)`** — see D5.

**The goal test stays `isComplete`, not `equals(aux)`.** Any arrangement that
powers every tile wins, and the player may reach one that isn't `aux`. The plan
*aims* at the assignment, but the hint must recognise a won board (and a board
one move from won) however it got there, or it will keep issuing moves after the
game is over.

### D3 — Extract `engine/slide-planner.ts`; Sixteen is its first consumer

This is the abstraction the owner asked for, and it is worth doing because
Sixteen's planner is *already* written against an `Int32Array` of values and
toroidal slides — the game-specific parts are small and identifiable:

**Moves into the engine** (unchanged in behaviour):
- the bucket-queue A* forward search with its lazy node allocation;
- the **no-progress gate** — engage the exact search only at a strict local
  minimum, the fix that took mid-game hints from ~3s to ~0.2s;
- the **exact bidirectional BFS** fallback for local-minimum endgames (two swapped
  pairs) that the heuristic cannot see past;
- the **partial-plan** behaviour — a search that improved on the start but didn't
  reach the goal returns the path to its best node, and the next request
  recomputes;
- the toroidal distance / slide-application primitives.

**Stays per-game** (the parameters):
- `legalMoves(state)` — Sixteen: every line, any distance. Netslide: every line
  *but the centre row and centre column*, distance ±1 only.
- `homes: Int32Array` — Sixteen: the tile's own number. Netslide: D2's assignment.
- `goalReached(pieces)` — Sixteen: every tile home. Netslide: `isComplete`.
- the heuristic's scaling, since a Netslide slide moves a line by one step while a
  Sixteen slide can move it any distance; the admissible divisor differs.
- all narration and rendering.

**The escape hatch.** The extraction is worth doing only if it stays *legible*. If
parameterising the planner turns it into a callback thicket — in particular if the
heuristic scaling and the move generator cannot be cleanly separated — then
**abandon the extraction**, keep Sixteen exactly as it is, give Netslide its own
planner, and share only `hint-vocab.ts`. That is a worse outcome but not a bad
one, and it is much better than a bad abstraction that makes two games hard to
change. Decide this *after* the first honest attempt, and record which way it
went.

**Sixteen must not regress.** The refactor is behaviour-preserving by
construction. It is guarded by Sixteen's existing hint tests, its render snapshot,
`hint-resume.test.ts`, and its `__lastHintEngagedFallback()` diagnostic — which
exists precisely to assert the no-progress gate still gates (and is a
load-independent proxy, per playbook §5.2, never an elapsed-time assertion).

### D4 — Search feasibility is the main technical risk

Netslide slides only **±1**, so a permutation that Sixteen reaches in one move can
take several here: plans are longer and the search is deeper than anything the
planner has faced. The mitigations are already in the design rather than bolted on:

- The heuristic is a sum of toroidal distances scaled by how many pieces one slide
  can help at once — a slide of a line moves every piece in it, so a single move
  can reduce many pieces' distance by one.
- A **partial plan is a fine outcome** (D3): the plan runs out, the player is
  closer, and the next request recomputes. The hint never has to solve the whole
  board in one search.
- The exact fallback is bounded and gated behind the no-progress test.

If the forward search turns out to be too weak on 5×5 to make useful progress,
that is a finding, not a failure — the answer is a better heuristic (e.g. counting
pieces already in a *correct* line), not a bigger budget. Heavy tests must be
seed-deterministic with explicit timeouts and must never assert elapsed time
(playbook §5.2).

### D5 — Recompute-stability is a hard requirement, not a nicety

This is the Inertia lesson, and Netslide is *more* exposed to it than Inertia was,
because it has **two** heuristic choices that could flip between recomputes: the
home assignment (D2) and the planner's path. A plan is recomputed whenever the
player goes their own way, so a hint that sends the player to build the top-left
corner, then — one move later, from a freshly-chosen assignment — the bottom-right,
for ever, is a *worse* experience than no hint at all.

Requirements:
- The home assignment MUST be a pure deterministic function of `(board, aux)`
  with an explicit tie-break, so the same board always yields the same subgoal.
- The narration MUST hold a **stable subgoal** — "placing this piece" — across the
  legs of its journey, and mark it on the board (Inertia rings its target gem),
  since Netslide, like Inertia, has no name for the thing it is working on.
- **Never "cache the plan" to paper over instability** — that hides the bug rather
  than fixing it. The fix is a choice that is stable by construction.
- Netslide joins **`hint-resume.test.ts`**, the cross-game guard.

### D6 — Narration: lead with what is provable, then home-vs-helper

Per the hint quality bar, every sentence is a claim, and a hint that only says
*what* to do fails the bar. Netslide's narration has real content:

- **The provable fact, and the game's actual insight:** the centre tile can never
  move — the row and the column through it are both frozen — so the network is
  built *around* it. A corollary worth saying when it bites: a piece in the centre
  row can only be moved by sliding its column (and vice versa), so it has a single
  degree of freedom and is the hardest kind of piece to place.
- **Home vs helper:** narrate each move by the consequence it actually has —
  "this puts the corner piece in its final place" versus "this brings it into the
  column that can drop it home" (the latter using the existing shared
  `HINT_SETTING_UP` / `workingOn` vocabulary that Fifteen and Sixteen already
  share). This is the upgrade `AGENTS.md` flags as aspirational for
  Fifteen/Sixteen; doing it here in the shared vocabulary makes lifting those two
  a much smaller job later — but that lift is **not** in this change's scope.
- **One journey, one hint:** a subgoal that needs a row slide and then a column
  slide is one multi-leg journey (`continuesPrevious`), not two hints.
- **Claim only what is checked.** Do not say a piece "can't be reached any other
  way" or "must go here" unless the code has verified it. Netslide's target is one
  valid solution, not necessarily the only one (D2), so the narration says "this
  piece belongs here", never "this is the only place it can go".

### D7 — Rendering

Follow Sixteen's hint visuals, which the bar already settled: the piece being
placed highlighted in `COL_HINT`, its destination cell bordered, the slide arrow
to press drawn in `COL_HINT`, and the *ultimate* destination previewed distinctly
from an intermediate leg. Netslide's palette is index-for-index with the C enum,
so hint colours are **appended past it** (the game has no dark-mode
`paletteOverrides`, so appended indices are safe — playbook §3.3). The hint
overlay must be in the render cache's diff key or it will silently fail to repaint
(playbook §3.2, the bug Towers shipped).
