# Design

## Context

`audit-guessing-tier-names` design D9 settled that a **Tactic** — a bounded chain
of forced consequences — keeps its middle tier, and that its hint owes the player
a walk rather than a compressed claim. Seven games ship a Tactic and none walks
it. This change is that debt.

The proposal assumed the walk was a delivery change: emit the chain as a
`continuesPrevious` journey, since the machinery exists and Sixteen uses it.
**That assumption is wrong**, and the session of 2026-08-12 established what
replaces it.

## D1 — A what-if walk has no shape in the engine, and that is the whole problem

Every journey in the collection is **a sequence of real moves**: Sixteen's
slides, Undead's per-cell strikes, Spokes' saturated-hub lines. The player
performs each leg.

A Tactic's chain is not that. Its middle legs are the forced consequences of a
hypothesis *that is about to be refuted*, so they are cells the player must
**not** play:

> suppose red → then this must be blue → then that red → **which seals the ringed
> tile off from its own colour. Impossible, so the first cell is blue.**

Only the last leg is a move. And `HintStep.move` is **required**, so a
"watch this" leg cannot be expressed.

Three options were weighed:

| | cost | what the player gets |
| --- | --- | --- |
| **Repeat the final move on every leg** | none | `hintKeepTrack` completes the journey at leg 1, so a player stepping manually never sees the walk — it would exist only under Auto-Hint |
| **Display-only leg** (`move?: Move`) | midend step-advance, `executeHint` and `hintKeepTrack` all assume a move exists; permanent widening of a contract 29 games' types live under | one inference at a time, board state accumulating — exactly D9's bar |
| **Enrich one step** | none; Clusters already renders every forced cell | the whole argument at once, with the board carrying the middle |

## D2 — Owner decision (2026-08-12): enrich one step, and draw the path

The question the owner put is the one that decides it: *does the walk exist to
stop the player holding a hypothesis in their head?* If so, a display-only leg is
the only honest answer. **The owner's answer was that holding a hypothesis is
fine** — what is not fine is holding the *chain*.

That is a materially weaker requirement and one enriched step meets it, because
the board already carries the chain: Clusters marks every forced cell with the
colour the hypothesis gives it. What was missing was the **order** and the
**link to the contradiction** — the reader could see five marked cells but not
which came first or where it ended.

So: **one step, plus an arrow path from the hypothesis through each forced
consequence to the break.** The narration names the two ends and the *count* of
what lies between, and lets the arrows carry the middle:

> *"Suppose this cell were red. Follow the arrows: 4 more cells are forced, and
> then the ringed tile could no longer touch two of its own colour — impossible.
> So it must be blue."*

This is deliberately **not** "the walk bar, met". It is the bar, revised, on the
grounds that the pedagogic claim behind the stricter version was not one the
owner wanted to make. Record it that way rather than as a victory — a future
reader who finds `PENDING_WALK` retired should be able to see that the list was
retired by a decision and not by seven implementations.

**Consequences for the change's shape:** the engine contract is untouched, so
this is per-game narration and rendering only. `HintStep.move` stays required.
The Latin family still needs its chain recorded (`latin.ts` `forcing()` throws
the BFS path away), because there is no path to draw without it — that part of
the proposal survives intact.

## D3 — The prototype, and what it is worth

Built and rendered on 2026-08-12; kept as
[`reference/arrow-prototype.patch`](./reference/arrow-prototype.patch) with a
sample frame at [`reference/arrow-prototype.svg`](./reference/arrow-prototype.svg)
(10x10 Tricky, seed 1, a 4-link chain). Reverted rather than committed, because
the finding in D4 has to be settled first.

What it does, and what to keep from it when this change is implemented for real:

- `COL_HINT_PATH` (index 11), drawn in **`ORANGE`, the danger ring's own
  colour** rather than a fourth hue — the path and the ring are one argument
  ("start here, and this is where it ends"), and a colour of its own would
  claim they were separate roles.
- The arrows are drawn in **a pass after the tile loop**, because they cross
  tile boundaries, and are redrawn on every frame a chain is displayed rather
  than diffed: they are a handful of lines, and a tile repainting under one
  would otherwise cut it in half. Dropping the hint clears the sidecar, which
  stales every path tile, so the repaint erases them.
- **Consecutive links are not necessarily adjacent.** `chainToContradiction`
  re-scans the board row-major after each forcing, so a leg can jump across the
  grid. The prototype draws the jump. That is a true fact about the deduction
  and the picture is allowed to say it — reordering the chain into a spatial
  path would be a lie. Whether long jumps read acceptably is the main thing to
  look at when reviewing the frame.

## D4 — Found while prototyping: Clusters' hint target was invisible — **fixed, 2026-08-12**

`COL_HINT` resolves to `HINT_ACTION`, which **is** `BLUE`
(`engine/colour/palette.ts:175`). Clusters' `COL_1` — its blue *tile* — is also
`BLUE` (`clusters/render.ts:74`). They are the same value.

`drawTile` fills the hint target with `COL_HINT`, on the stated reasoning that
"the hint target and a chain's what-if cells are always empty cells, so their
highlight takes the fill (nothing underneath to hide)". The consequence is that
**the hypothesis cell is painted the exact colour of a placed blue tile**. In the
sample frame it is indistinguishable from its neighbours, and the arrows appear
to start from nowhere.

Two things make this worse than a collision:

1. **It is not merely invisible, it is wrong half the time.** The target is
   filled blue whatever colour the deduction concludes. On a firing that
   concludes *red*, the board says blue and the sentence says red.
2. **`scripts/checks/colour-collide.test.ts` exists for exactly this** — it was
   written after Subsets collapsed three hint roles into one blue — and it is
   advisory, so nothing failed. Re-run it and read the Clusters section before
   deciding the fix; the report is the instrument, not the guess.

This was a pre-existing defect independent of the arrows, and it was **fixed
before this change starts** rather than carried as its task 0 — it is a live
rendering bug on `main`, not a cost of the arrows.

**The fix: `COL_HINT` is `PURPLE` in Clusters.** The collide report was read
first, as the method requires, and it named the pair (`COL_1 = COL_HINT`)
exactly. The usual resolution — cross-game role wins, local role yields
(`add-sticks-hint`) — is unavailable here: the local role is a **rule of the
game**, one of the two colours the player paints, named to them by
`help/games/clusters.md`. So the hint role takes the substitute this repo already
reaches for when blue is spoken for (Sticks' and Subsets' cursors). Verified:
the pair is gone from the report, no new pair appeared, the dark-scheme check is
unchanged, and the snapshot diff is **two ops, one per frame, an `rgb` value
each** — no op added, moved or removed.

**The transferable half is why nothing caught it.** `clusters-hint.test.ts`
asserted `op.colour === COL_HINT` — a **palette index**, not a colour. That
assertion is satisfied no matter what the index resolves to, so it stayed green
through the entire period the target was painted the same blue as a placed tile.
It is this repo's recurring shape — *the assertion names a proxy for the property*
— and `colour-collide.test.ts` is the non-proxy instrument, but it is advisory,
so it reported the pair for months and failed nothing. The game now carries a
direct assertion that **no hint role resolves to a colour the board already
uses**, and that the three hint roles are distinct from each other.

## Open Questions

- Do the numbered ordinals earn their place alongside the arrows, or is the
  arrow order enough? The prototype omits them; a long jump may need them.
- Does the Latin family's chain — 3–12 links with a **case split on the origin
  cell** — survive the same treatment? A path drawn through a case split is two
  paths, and D9's own note says a final leg that does not follow from its stated
  premises is a defect. Clusters has no case split, so it is the easy one, and
  the six Latin games are where this design will actually be tested.
