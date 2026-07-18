# Design — extend-grid-tilings

## Context

`src/native/engine/grid.ts` is the TS port of upstream `grid.c` (Lambros
Lambrou's general planar-graph grid code). It landed with Pearl carrying only
what Pearl used: the four incidence structures, `makeConsistent`, and
`gridNewSquare`. Loopy needs the rest.

Two surveys of the C informed this design; their findings are recorded as the
decisions below rather than left to be rediscovered mid-port.

## Decisions

### D1 — Split the Loopy work at the RNG boundary, not by line count

Three changes, split so that **this one is fully deterministic**: a periodic
grid is a pure function of `(type, width, height)`. Nothing here consumes
`random.ts`, produces a desc, or depends on a seed.

That makes the differential trivial to state and total: dump every dot, edge and
face from C and from TS for a matrix of `(type, size)` and compare. No seed
plumbing, no solver-verdict indirection, no fixture RNG state. By contrast the
aperiodic tilings (change 2) are RNG-bearing and desc-round-tripping, and Loopy
(change 3) has the usual solver-gated generator whose desc depends on every
draw. Keeping those out means a failure here has exactly one possible cause:
wrong geometry.

Rejected: one change covering everything (~14,300 lines of C in a single
reviewable unit, with a differential that can't isolate a geometry bug from a
generator bug), and a two-change split folding the aperiodic tilings in here
(which would drag RNG, descs and ~3,500 lines of lookup tables across the
deterministic boundary that makes this change cheap to verify).

### D2 — Keep 13 hand-written generators; do not invent a tiling DSL

Every periodic generator in `grid.c` has the same shape: nested `for y / for x`,
emit K faces per cell at integer offsets from a cell origin, dedup shared corner
dots, `makeConsistent`. It is tempting to factor that into a declarative
table — "this tiling emits a hexagon at `(3a·x, 2b·y + (x&1)·b)`" — and drive
all 13 from one loop.

**Decline.** The per-cell face sets are not uniform: several tilings emit a
*variable* number of faces per cell guarded by edge conditions
(`greathexagonal` has six face kinds with boundary guards; `cairo` emits a
horizontal pentagon only when `y > 0` and a vertical one only when `x > 0`;
`snubsquare` and `cairo` branch on `(x+y)%2`; `floret` deliberately skips one
cell for appearance). A DSL general enough to express all of that is a
worse-behaved thing than 13 straight-line functions, and it would obscure
exactly the coordinate arithmetic the differential is checking. This is
transcription work with typo risk, and the mitigation for typo risk is the
differential, not an abstraction.

This is the "refactor as you go" guardrail applied honestly: the shared shape is
real but shallow (dedup + `makeConsistent`, already shared), and the varying
part is the whole content.

### D3 — `gridFindIncentre`: port faithfully, but do not gate tests on floats

`grid_find_incentre` is ~460 lines of float geometry: for each 3-subset of a
face's combined edge+vertex set it solves a 3×3 linear system (or a quadratic,
or a circumcentre), then vets by point-in-polygon and minimum distance. It has
exact float comparisons at branch points (`det == 0`, `disc >= 0`,
`fabs(eq[0]) < fabs(eq[1])`).

Its **sole consumer is clue-digit placement** (`loopy.c:3269 face_text_pos`),
it is lazy (`has_incentre` guard) and cached per face. Per this project's
byte-parity scope policy, display code targets neat visuals and clean code, not
byte-fidelity — so:

- Port the algorithm faithfully (it is the *right* answer for "where does a
  digit fit in this polygon", and a centroid is visibly wrong for the concave
  and highly non-convex faces several of these tilings produce).
- **Do not** assert exact incentre coordinates in the differential. Assert
  instead the property that matters: the returned point lies inside the face,
  and the largest inscribed circle at that point is within a small tolerance of
  C's. A one-pixel divergence is invisible and must not fail a gate.

### D4 — `gridNearestEdge`: preserve `<`, not `<=`

The hit-test's eligibility test (the acute-angle check) is exact integer
arithmetic on squared lengths; only the perpendicular distance and the final
`dist < best_distance` comparison are `double`. There is no tiebreak, so on an
exact tie the **lowest-index edge wins by iteration order**. Preserve the strict
`<`; flipping it to `<=` silently changes which edge a click on a vertex
toggles.

Sensitivity is low (an edge would have to be within ~1 ULP of a tie) and the
blast radius is bounded — worst case a click toggles a different adjacent edge.
It affects gameplay but never the desc, generation or solving.

### D5 — C truncating division must become `Math.trunc`, not `/`

`floret` computes its basis vectors through four C integer divisions
(`4*px/5`, `(6*px+3*qx)/2`, `(4*py-5*qy)/2`) on values that include **negative**
coordinates (`p = (75,-26)`, `r = (-15,78)`). C truncates toward zero; TS `/`
does not truncate at all. Every one of these happens to be exact in the
constants upstream uses, but a port must still write `Math.trunc` — because the
"no floating-point arithmetic here!" invariant at `grid.c:1404` is load-bearing:
dot dedup is by *exact* coordinate equality, so a coordinate off by one
fractional unit silently produces duplicate dots and a structurally broken grid
rather than a visible error.

Same rule applies to `hat.c:834`'s `/3` in change 2.

### D6 — Triangular's desc is a version flag, and belongs in this change

`GRID_TRIANGULAR` is the one periodic tiling with a desc, but it is **not
random**: `grid_new_desc` returns the literal `"0"`, and it selects between two
algorithms — absent/`NULL` gives the legacy generator (which leaves ragged
"ears"), `"0"` gives the current ear-trimmed one. Since it consumes no RNG it
stays on the deterministic side of D1's boundary and is implemented here, both
branches (old shared game IDs select the legacy one).

The full `gridNewDesc`/`gridValidateDesc` *dispatch* still lands in change 2
alongside the aperiodic descs; this change implements the triangular arm and the
"all other types reject a non-null desc" rule.

### D7 — Differential: dump the full incidence, per tiling, per size

A new `puzzles/auxiliary/grid-trace.c` emits, for each `(type, w, h)` in a
matrix: `tileSize`, the bounding box, and every dot (`index, x, y`), edge
(`index, dot1, dot2, face1, face2` with `-1` for the exterior) and face
(`index, order, dots[], edges[]`). `grid-differential.test.ts` builds the same
grids in TS and asserts exact equality of all of it.

This is a **byte-match** differential in the project's sense and it is unusually
strong here: dot *indices* are assigned in first-encounter order driven by the
generator's own loop, so index-exact agreement proves the emission order
matches, not merely the resulting shape. A transposed coordinate or a swapped
face-corner order shows up immediately.

Matrix: all 14 periodic types at their minimum legal size, at a mid size, and at
a non-square size; triangular additionally in both desc modes.

### D8 — `gridTrimVigorously` is deferred to change 2, and will not use a dense matrix

It is called only from the four aperiodic generators, so it is out of scope
here. Noting the finding now so it is not rediscovered: it allocates an
`O(numDots²)` dense `int` matrix mapping ordered dot pairs to faces, which for a
10×10 spectre patch is millions of entries. Change 2 must implement it as a
`Map` keyed on the ordered dot-index pair.

### D9 — Two grid enum orderings must both survive

Loopy has its **own** grid enum (`LOOPY_GRID_*`, `loopy.c:276-294`) whose order
differs from `grid.h`'s `GRIDGEN_LIST`, mapped through `grid_types[]`. Loopy's
order is frozen in saved game IDs and upstream comments at length that nothing
may be inserted except at the end.

`grid.ts` owns the `GRIDGEN_LIST` order (a `GridType` union/enum); the
Loopy-side ordering and the mapping table belong to the game in change 3. This
change must not collapse the two into one.

Related: the per-type **minimum** sizes are *not* in `grid.c` at all — they live
in Loopy's `GRIDLIST` as `amin`/`omin` (both dimensions ≥ `amin`; at least one
≥ `omin`). `gridValidateParams` here ports only the maximum-size overflow
guards; the minima are change 3's.

## Risks

- **Transcription volume.** `greatgreatdodecagonal` alone emits 12 face kinds.
  Mitigated entirely by D7 — a typo in any coordinate fails the differential
  loudly and points at the tiling.
- **`makeConsistent` reuse.** It currently uses `Map.get` where C uses `del234`
  (C *removes* the edge on match, so a hypothetical third face sharing a dot
  pair would allocate a new edge; TS would overwrite `face2`). Unreachable for
  planar grids, but the new tilings exercise far more of it than the square did,
  so this gets a comment rather than remaining a latent surprise.
- **Pearl regression.** `gridNewSquare` and `makeConsistent` must not change
  behaviour. Pearl's existing byte-match differential is the bar and must stay
  green.

## Addendum — what the implementation actually surfaced

Recorded after the fact, because in two of three cases the *predicted* trap was
harmless and an unpredicted one nearly shipped.

### The `Math.trunc` trap (D5) did not bite; negative zero did

D5 warned that floret's C integer divisions must become `Math.trunc`. With
upstream's constants every one of those quotients is exact (`4·75/5 = 60`,
`(6·75+3·60)/2 = 315`, `(4·−26−5·52)/2 = −182`), so a naive `/` would have
passed the differential. The rule stays — it is what protects a future tweak to
`FLORET_PX`/`FLORET_PY` — but it was not the defect.

**What actually broke floret was negative zero.** `cy = (4·py − 5·qy)·y` at
`y = 0` is `−364 · 0`, which in IEEE-754 is `−0` where C's integer multiply
gives `0`. It survives `===`, and it survives the dot-dedup key (`` `${-0}` ``
stringifies to `"0"`), so the grid produced was *structurally perfect* — every
face, edge and incidence correct. Only `Object.is(-0, 0) === false` exposed it,
via the differential's structural comparison. Three of floret's 21 assertions
failed on nothing but a sign bit.

Generalisation, now in the playbook: **any generator with a signed scale factor
multiplied by a zero index has this hazard, and it is invisible to every check
except a structural one.** The aperiodic tilings (change 2) use signed basis
vectors throughout. Fix is `|| 0`.

This is the argument for D7's full structural dump over targeted assertions: a
test suite that checked counts, Euler characteristic and spot-checked
coordinates would have passed.

### Rounding in `gridFindIncentre` is truncation, not round-half-up

C's `f->ix = xbest + 0.5` is a `double`→`int` assignment — **truncation toward
zero**. The idiomatic TS transcription `Math.floor(v + 0.5)` is wrong: the two
differ by one unit at negative coordinates, which grid coordinates genuinely
reach (honeycomb's leftmost corner is at `x = −30`). Correct port is
`Math.trunc(v + 0.5)`.

### D3 was the right call, with evidence

Across all 1864 faces of the fixture matrix, the worst incentre **radius**
difference between TS and C was `0.000000`; the worst **point** difference was
1.0 unit, on four fixtures (snubsquare ×3, greathexagonal 4×5,
greatgreatdodecagonal 3×5). Zero radius difference at nonzero point difference
is the signature of upstream's own documented parallel-edge continuum: on
rectangular and parallelogram faces a whole *segment* of points is equally
optimal and the two implementations pick different ends of it.

So it is not porting error, and asserting exact coordinates would have failed
for a non-reason. If Loopy's clue digits ever look off-centre in a
rectangular-faced tiling, upstream's continuum comment is the place to look, not
this port.

### Upstream asymmetries that read as sloppiness and are not

`greatgreatdodecagonal` gives near-identical faces deliberately different
boundary guards — "square on top right" uses `y && x < width-1`, "square on top
left" uses `x && y`, but "square above" uses the three-clause staggered form
`y && (x < width-1 || !(y%2)) && (x > 0 || y%2)`. None reduces to the others;
together they are what makes the patch boundary ragged in upstream's specific
way. Likewise `greatdodecagonal` writes `y && (x || y % 2)` where its siblings
write `x > 0 || y % 2` — same semantics, different spelling, transcribed as-is.

And floret's `else if (y && y == height-1 && width > 1) continue;`, which reads
as a cosmetic "skip an ugly rosette", is **load-bearing**: being a `continue` it
shifts every subsequent face *and dot* index, so it is part of the observable
contract.
