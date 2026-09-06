# unify-the-raised-tile-bevel — tasks

Scaffolded 2026-09-05 with its survey already run — see the proposal, whose
numbers are measured. **Ready; there is no exploration step.**

The six: **fifteen, sixteen, mines, inertia, sokoban, pegs.** Twiddle is
excluded on inspection and the proposal says why.

## 1. Extract, moving no pixels — its own commit

Do this first and alone. It is provably a no-op, and keeping it separate is what
makes the *second* commit's snapshot churn reviewable.

- [x] 1.1 `drawRaisedBevel(dr, bounds, highlight, lowlight)` in
      `engine/draw.ts`, beside `drawRecessedBorder` — same file, same idea,
      opposite direction. Takes **`BevelBounds`**, the type the recessed helper
      already uses, because each game's tile body differs legitimately (Inertia
      and Sokoban inset by one to leave a grid line) and a rect makes that a
      caller's fact.
      **Signature note:** the sketch above passed `hw`, and the implementation
      does not. The two triangles do not depend on it — `hw` sizes the *inner
      fill*, which 1.2 keeps with the game — so taking it would have been an
      unused parameter.
- [x] 1.2 Each game keeps its own `highlightWidth` and its own inner fill. Only
      the two triangles moved.
- [x] 1.3 **Pegs is deferred to task 2, not converted here** — and so are
      Fifteen and Sixteen. See the finding below: the six do not agree on
      *vertex order within the polygon*, so a single helper cannot be byte-clean
      for all of them. Task 1 converts the three that match its order (mines,
      inertia, sokoban) and leaves the three whose recording would move to the
      commit where moving is allowed. Pegs additionally draws
      highlight-then-lowlight and bevels *outside* the cell.
- [x] 1.4 **Every render snapshot byte-clean** for the three converted — and
      verified as evidence rather than assumed: deforming the shared bevel fails
      four tests across all three games, so the unchanged snapshots mean the
      extraction is a no-op rather than that nothing is watching.

### Finding from task 1: the six disagree on vertex order, not just thickness

The proposal measured the *geometry* (two bevel rects, both correct for their
own tile) and the *thickness* (four formulas). It did not measure the **vertex
order inside each polygon**, and the six split 3–2–1:

| Highlight triangle's vertices, in order | Games |
| --- | --- |
| `(left,top) (right,top) (left,bottom)` | mines, inertia, sokoban |
| `(left,top) (left,bottom) (right,top)` | fifteen, sixteen |
| bevels *outside* the cell, highlight drawn first | pegs |

Winding is irrelevant to a filled polygon, so all three orders paint the same
pixels — but the **recording** is not the pixels, and a tier-2.5 snapshot
records the points array. So "changes no draw call" is achievable for at most
one group. Task 1 takes the largest and leaves the rest to task 2, which keeps
the reviewable-diff property C2 exists for.

## 2. Unify the thickness — the visual change, its own commit

- [ ] 2.0 **Convert fifteen, sixteen and pegs** to the helper. Their recordings
      move by a vertex reorder (and, for pegs, a draw-order swap that shifts the
      shared-diagonal hairline). Both are invisible in the painted frame and
      both re-baseline a snapshot, which is why they live here.
- [ ] 2.1 Pick one formula. The measured spread is in the proposal's table;
      `max(1, floor(ts / N))` is the shape, and the open question is `N`. The
      three in use are 10 (heavy: 3px at ts=32), 16 (2px) and 20 (light: 1px).
      **Recommendation: `max(1, floor(ts / 16))`** — it is the middle of the
      three, it keeps a bevel visible at every tile size the midend can select,
      and it moves Fifteen and Sixteen (whose 1px border at their preferred
      ts=48 is the thinnest in the collection) toward the weight the rest of
      the collection already reads as "raised".
- [ ] 2.2 The `max(1, …)` floor is not optional: without it the inner rect
      covers the triangles completely and the bevel vanishes rather than
      thinning. Inertia, Sokoban and Pegs lack it today.
- [ ] 2.3 Snapshots re-baseline here, and that is expected. **Review the diff by
      the color-work rule**: every changed line explainable by the declared
      change, and nothing else in it. A changed *coordinate* is in budget; a
      changed op, color or order is not.
- [ ] 2.4 Run the app on all six and look at them. Bevel weight is exactly the
      kind of thing a snapshot records faithfully and a person judges.

## 3. Guard and document

- [ ] 3.1 A source scan, the reverse direction: no game draws a
      `COL_LOWLIGHT`/`COL_HIGHLIGHT` triangle pair outside the helper. Key on
      the **shape**, and expect it to catch Twiddle — then *classify* rather
      than narrow the scan, which is this repo's standing instrument rule.
      Twiddle's exclusion is a named allowance with the reason in the test.
- [ ] 3.2 Prove the guard fails: point one game's call elsewhere, watch it name
      that game, restore.
- [ ] 3.3 `ts-engine` delta: `ADDED`, worded from the existing recessed-border
      requirement, which is its sibling and its template.
- [ ] 3.4 `docs/games/rendering.md` and `docs/games/engine-catalog.md`.

## Standing constraints

- [ ] C1 Twiddle is not bent into this. Four rotatable trapezoids with per-edge
      cursor colors is a different shape; forcing it through a two-triangle
      helper is the contortion AGENTS.md forbids.
- [ ] C2 Task 1 and task 2 stay separate commits. A no-op extraction whose
      snapshots must not move, and a deliberate visual change whose snapshots
      must move, cannot be reviewed as one diff.
