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

- [x] 2.0 **Converted fifteen, sixteen and pegs.** Their recordings move by a
      vertex reorder (and, for pegs, a draw-order swap that shifts the
      shared-diagonal hairline). Both are invisible in the painted frame and
      both re-baseline a snapshot, which is why they live here.
- [x] 2.1 Picked one formula. The measured spread is in the proposal's table;
      `max(1, floor(ts / N))` is the shape, and the open question is `N`. The
      three in use are 10 (heavy: 3px at ts=32), 16 (2px) and 20 (light: 1px).
      **Recommendation: `max(1, floor(ts / 16))`** — it is the middle of the
      three, it keeps a bevel visible at every tile size the midend can select,
      and it moves Fifteen and Sixteen (whose 1px border at their preferred
      ts=48 is the thinnest in the collection) toward the weight the rest of
      the collection already reads as "raised".
      **Taken as recommended**, and it ships as `raisedBevelWidth` in
      `engine/draw.ts` so the formula has one home rather than six. Net effect:
      fifteen and sixteen get heavier (2px → 3px at their ts=48), mines,
      inertia and sokoban get one step lighter, pegs is unchanged except for
      gaining the floor.
- [x] 2.2 The `max(1, …)` floor is not optional: without it the inner rect
      covers the triangles completely and the bevel vanishes rather than
      thinning. Inertia, Sokoban and Pegs lacked it; all six have it now.
- [x] 2.3 Snapshots re-baselined, and reviewed by the color-work rule
      **mechanically rather than by eye**: of every changed line in the four
      moved snapshots, the count that is *not* a `w`/`h`/`x`/`y` value is
      **zero**, and insertions equal deletions (440/440), so no op was added,
      removed, recolored or reordered.
- [x] 2.4 **Ran the app on all six.** Fifteen and Sixteen read as distinctly
      raised where their 2px border had been faint; Mines, Inertia and Sokoban
      still read as raised one step lighter; Pegs' board relief is unchanged to
      the eye despite the draw-order swap. Two targeted assertions had hard-coded
      the old width (`hw = 2` in fifteen's render test, `TS / 20` in sixteen's);
      both now read `raisedBevelWidth`, so they cannot go stale again — the
      "write the query, not its answer" rule applied to a test constant.

## 3. Guard and document

- [x] 3.1 `src/engine/raised-bevel.test.ts` — a source scan, the reverse
      direction: no adjacent `drawPolygon` pair filled with the bare
      `COL_LOWLIGHT` and `COL_HIGHLIGHT` constants. Carries a vacuity number
      (sources read ≥ 200, and `drawRaisedBevel` seen at least once).
      **The scan does *not* catch Twiddle, and that is correct rather than an
      exemption:** its trapezoid fills are ternaries carrying a per-edge cursor
      color, so the key cannot match them and should not. What the key *does*
      also catch is three lone `COL_LOWLIGHT` triangles (mathrax, salad,
      seismic) — pencil-mode corner markers, a different thing — so the test
      **classifies** them in a third assertion rather than narrowing the key,
      per the standing instrument rule.
- [x] 3.2 **Proved it fails**: restoring Sokoban's hand-rolled pair turns both
      the offender list and the lone-triangle list red, each naming sokoban.
      Restored.
- [x] 3.3 `ts-engine` delta: `ADDED`, worded from the recessed-border
      requirement. Three scenarios — the helper's use, Twiddle keeping its own,
      and the no-re-derivation scan with its vacuity clause.
- [x] 3.4 `docs/games/rendering.md` gains "Sharing a *primitive* is a different,
      smaller move" (with the three lessons); `docs/games/engine-catalog.md`'s
      `draw.ts` entry gains both new helpers, the promoted-from-N pattern, and
      the warning that an unchanged snapshot is not evidence on its own.

## Standing constraints

- [x] C1 Twiddle is not bent into this, and it did not even need an exemption:
      its per-edge cursor colors mean the guard's key cannot match it. A
      normative scenario in the `ts-engine` delta records why.
- [x] C2 Task 1 and task 2 are separate commits, and the split earned its keep —
      task 1 landed with every snapshot unmoved, which is what made task 2's
      440 changed lines reviewable as *only* coordinates.

## Findings

- **The survey missed vertex order**, and it decided the shape of the work: the
  six wrote the highlight triangle's three vertices in three different orders,
  which is invisible in the frame and visible in a recording. Task 1 could
  therefore only be byte-clean for the largest group (3 of 6).
- **Two tests had the old thickness written into them** as `2` and `TS / 20`.
  Both now call `raisedBevelWidth`. A constant restated in a test is the same
  hazard as a count restated in prose.
- **The `max(1, …)` floor mattered more than the divisor.** Three of the six had
  dropped it, so their bevel *disappeared* rather than thinning below ts ≈ 10 —
  not reachable on a real viewport, but the kind of latent cliff that is free to
  remove while the code is open.
