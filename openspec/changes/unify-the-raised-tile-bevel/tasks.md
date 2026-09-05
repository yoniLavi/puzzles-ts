# unify-the-raised-tile-bevel — tasks

Scaffolded 2026-09-05 with its survey already run — see the proposal, whose
numbers are measured. **Ready; there is no exploration step.**

The six: **fifteen, sixteen, mines, inertia, sokoban, pegs.** Twiddle is
excluded on inspection and the proposal says why.

## 1. Extract, moving no pixels — its own commit

Do this first and alone. It is provably a no-op, and keeping it separate is what
makes the *second* commit's snapshot churn reviewable.

- [ ] 1.1 `drawRaisedBevel(dr, rect, hw, highlight, lowlight)` in
      `engine/draw.ts`, beside `drawRecessedBorder` — same file, same idea,
      opposite direction. Take a **rect**, because each game's tile body differs
      legitimately (Inertia and Sokoban inset by one to leave a grid line) and a
      rect makes that a caller's fact rather than a parameterized difference.
- [ ] 1.2 Each game keeps its own `highlightWidth` **for now** and passes it in,
      and keeps its own inner fill. Only the two triangles move.
- [ ] 1.3 Decide Pegs' draw order deliberately (proposal, "Not in scope"): it
      draws highlight-then-lowlight where the others reverse, and the two share
      their diagonal. If the helper fixes an order, Pegs' hairline moves and
      that belongs in task 2's visual budget, not here.
- [ ] 1.4 **Every render snapshot byte-clean.** This step either changes no draw
      call or it is wrong; do not `-u`.

## 2. Unify the thickness — the visual change, its own commit

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
