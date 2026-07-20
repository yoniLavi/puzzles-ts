# Design — add-loopy-ts-port

## Context

The last game. Everything it stands on is already in place: `grid.ts` at all 18
tilings (changes 1 and 2), `loopgen.ts` (Pearl), `runDeductionFixpoint`,
`retryLimit`, the render-scenario harness. What remains is Loopy itself.

Two surveys of `loopy.c` informed this design — one of the solver and generator,
one of the UI, input, rendering and plumbing. Their findings are recorded as
decisions below rather than left to be rediscovered mid-port.

## Decisions

### D1 — Degenerate Penrose patches: retry with a fresh description

`add-aperiodic-tilings` found that a small Penrose patch can come out **empty**
(the seed triangle lands outside the bounding box, so the BFS never runs).
Upstream aborts on it — `dsf_new(0)` — and it is reachable from Loopy's Custom
dialog, because `loopy.c:713-717` accepts 3×3 for both variants. `grid.ts` now
raises `GridTrimmedAwayError` instead. Loopy must decide what to do.

**Decision: catch `GridTrimmedAwayError` around grid construction in the
generator and retry with a fresh grid description, bounded by `retryLimit`.
Leave the minimum sizes alone.**

Four reasons, in the order they matter:

1. **The failure is per-seed, not per-size.** Raising the Penrose minima would
   forbid sizes that work for the great majority of seeds — punishing every
   player for a rare draw. Retry costs one extra draw on the rare seed and
   nothing on the rest.
2. **It costs nothing in fidelity, because there is no C behaviour to diverge
   from.** C *aborts* on exactly the seeds we would retry. So byte-agreement is
   preserved on every input where the C produces any output at all, and
   divergence is confined to inputs where the C's behaviour is undefined. This
   is the cheapest possible use of the owner's licence to abandon byte-parity:
   it is not really being spent.
3. **It is what this repo already does.** `engine/retry-limit.ts` says so
   directly: *"Where the algorithm already has a natural recovery path, prefer
   recovering into it and let an outer `retryLimit` bound the recovery;
   `games/net`'s `shuffle` reshuffles on a stalled tie rather than throwing, for
   exactly this reason."* A degenerate patch is precisely a rare-but-legal seed a
   player might hit — the case that doctrine names as wrong to convert into a
   crash.
4. **Determinism, and therefore shared game IDs, are preserved.** The retry is
   driven by the same RNG stream, so a given seed yields the same sequence of
   attempts every run. A `params#seed` ID still reproduces its board.

Rejected alternatives:

- **Raise the per-type minima** (the obvious fix). Rejected by (1): it treats a
  seed-dependent failure as a size-dependent one, so it is simultaneously too
  strict (forbids working sizes) and not obviously sufficient (nothing proves
  some larger size cannot also fail on some seed).
- **Let it propagate.** Rejected: it converts a rare draw into a broken
  "New game" for the player, which is exactly the outcome (3) forbids.
- **Special-case Penrose.** Rejected: catch the error, not the tiling. Any
  aperiodic generator could in principle produce a degenerate patch, and a
  predicate on "which tiling is this" would need revisiting if one ever did.

The bound exists to catch a porting divergence (a generator that *never*
succeeds), not to paper over one: exhaustion throws `RetryLimitExceeded` rather
than returning a fallback board, so no seed that used to converge can quietly
start producing a different desc.

**Where it goes matters.** `new_game_desc` already has a retry loop — upstream's
`goto newboard_please` — but that loop re-runs `generate_loop` and `remove_clues`
over an **already-built grid**; `grid_new_desc` is called once, *outside* it. A
degenerate patch fails at grid construction, before that loop is entered, so the
existing loop cannot recover from it.

So this is a **new outer loop** wrapping description generation *and* grid
construction, with the existing clue-generation retry nested inside it
unchanged:

```
outer (bounded):  gridNewDesc → gridNew        ← catches GridTrimmedAwayError
  inner (bounded): generateLoop → addFullClues → gate on a unique solution
```

Both loops get their own `retryLimit`, and the nesting order is not negotiable —
inverting it would re-derive the grid on every failed clue attempt, changing the
RNG stream and diverging from the C on seeds where it currently agrees.

### D2 — Byte-parity policy for this port, given the owner's licence

The owner has explicitly said (2026-07-20) to decide by what is best for the TS
implementation and most consistent with the other ports, and that abandoning C
byte-compatibility is acceptable where keeping it makes things worse.

**The policy this change adopts: keep byte-agreement as the default, because it
is the verification mechanism, not because fidelity is a goal in itself — and
spend the licence wherever keeping it would cost real TS quality.**

The distinction matters. Byte-agreement with the C is how every port in this
repo has been *verified*: the desc depends on the solver's verdict on every
intermediate board, so one differential assertion validates the generator, the
solver and the codec at once. Discarding it discards the strongest tool
available for a 3,900-line game. So it is kept by default — but as an oracle, not
as a commandment.

Where it would genuinely hurt, it goes. The survey should be read with that in
mind; the working rule for each of Loopy's known traps is in D3.

### D3 — The three known traps, and what each actually costs

Recorded by change 1's survey as "byte-parity traps, two of them upstream bugs a
clean port would silently fix". Assessed against D2's policy:

1. **`face_setall_identical` sets `retval = false` and never reassigns it**, so
   it always reports "no progress" even when it changed the board.

   **Survey verdict: reachable, and behaviourally significant — keep it.** The
   guards are `yes + 1 == clue` and `no + 1 == N - clue`, both ordinary
   satisfiable states rather than contradictions, and the deduction it makes is
   *sound* (two provably-identical lines with room for only one more YES must
   both be NO), so it never writes a wrong line. But the lost return value is
   only *sometimes* masked by the edge-dsf propagation loop that follows: when
   the flip-dsf canonical is one of the two edges just set, `linedsf_deductions`
   returns `DIFF_MAX` **despite having mutated the board**. `solve_game_rec` then
   does not reset `i = 0`, so it never re-runs `trivial_deductions` on the lines
   just written, and can exit `SOLVER_INCOMPLETE` early.

   The solver is therefore **strictly weaker than intended — and that weakness
   is baked into which puzzles upstream generates**, because
   `game_has_unique_soln` gates every clue removal, the board-retry loop and the
   too-easy rejection. "Fixing" it produces different, generally sparser puzzles
   from the same seed and breaks every seed-level differential.

   Cost to preserve: **one line and a comment.** Keep it, loudly — a linter's
   "value is never reassigned" hint will otherwise tempt exactly the wrong
   cleanup. Worth a regression test asserting it returns `false` *even when it
   mutates*.

2. **`parity_deductions` receives `(clue - yes) % 2`, negative when
   `clue < yes`.** C's truncating `%` yields `-1`, which is truthy, so the XOR
   always gives `LINE_YES`. **TS's `%` truncates identically**, so the literal
   port and the idiomatic port are *the same code* — the trap is only "do not
   apply the hygiene fix `((x % 2) + 2) % 2`". Preserving it costs **nothing at
   all**. **Keep, with a comment**, because a future reader will otherwise
   correct it on sight.

   **Survey verdict: unreachable on any board the game constructs.** `clue < yes`
   means the face already has more YES edges than its clue permits — an
   already-contradictory board. Three things stand in the way: `trivial_deductions`
   detects exactly this condition (`loopy.c:2229-2232`) and returns
   `SOLVER_MISTAKE`; it is solver index 0 at `DIFF_EASY`, so it always runs
   first, and *any* progress by *any* rung resets `i = 0` and forces it to
   re-verify; and every deduction in the file is sound, so on a board admitting
   at least one solution no face can ever exceed its clue. The generator cannot
   produce such a board (`add_full_clues` derives clues from a real loop;
   `remove_clues` only ever erases), and gameplay cannot either — `solve_game`
   builds its solver state from the *pristine* puzzle, not the player's board.
   The only door is a hand-typed malformed game ID, where the deductions are
   transient garbage on a board already heading for `SOLVER_MISTAKE`.

   So: a real latent bug, but dead code. **Keep it as a `number`, with a comment
   recording this analysis** — the licence is not needed.

3. **Two deliberate `switch` fallthroughs in `interpret_move`** (non-stylus
   YES/NO fall into the `'u'` case). TS's `noFallthroughCasesInSwitch` is on, so
   this cannot be transliterated — but the fix is to write the shared branch
   explicitly, which is *clearer* than the C. **Keep the behaviour, drop the
   spelling.**

So: the licence is available, and on present evidence trap 2 is the only one
that might need it. That is worth stating plainly rather than leaving the
impression that fidelity was expensive here.

### D3a — The dline index convention is the highest-risk coupling; test it *first*

A **dline** is a pair of edges adjacent around a common dot — equivalently a
(dot, face) corner — indexed as `2 * edge.index + (edge.dot1 === dot ? 1 : 0)`,
giving `2 × numEdges` slots holding two bits ("at least one YES", "at most one
YES").

Both index formulas depend on `grid.ts` reproducing `grid_make_consistent`'s
**ordering** conventions exactly. `dlineIndexFromDot(d, i)` means "the pair
`(d.edges[i], d.edges[(i+1) % order])` **clockwise around the dot**".
`dlineIndexFromFace(f, i)` means "the pair starting at `f.edges[i]`,
**anticlockwise around the face**", and relies on the interleaving convention
that **the common dot of that pair is exactly `f.dots[i]`**.

**If those orderings are off, nothing crashes and nothing asserts.** Every dline
deduction silently indexes the wrong pair and the solver quietly gets weaker —
which, because the generator is solver-gated, means different puzzles, not a
visible fault. This is the worst failure shape in the port: silent, diffuse, and
attributable to any of 18 tilings.

**Therefore: write the invariant test before writing the solver.** For every one
of the 18 tilings, assert that the two formulas agree — for each face `f` and
index `i`, `dlineIndexFromFace(f, i)` equals `dlineIndexFromDot(f.dots[i], j)`
for the corresponding `j`. That is exactly the property upstream's
`DEBUG_DLINES` printf blocks existed to eyeball, and it is cheap to assert
mechanically.

Encouraging prior evidence: the change-1/2 differential already compares the
per-dot edge and face rings **index-exactly** against the C, so the orderings are
verified. This test pins the *consumer's* assumption about them, which is a
different and equally necessary thing.

### D3b — Where the solver benefits from TS rather than merely surviving it

Three places the idiomatic shape is genuinely better, worth doing deliberately
rather than transliterating:

- **`MAX_FACE_SIZE 14` evaporates.** It exists so `maxs`/`mins` can be stack
  arrays (`int[14][14]`), and 14 is *tight* — it exists to accommodate the
  14-edged Hat and Spectre faces. In TS, hoist one reusable scratch buffer sized
  to the grid's true maximum face order, computed once when the solver state is
  built, and index it `[j * N + k]`. Keep the assert as a sanity check on
  `grid.ts`'s output.
- **`dlines` and `linedsf` are legitimately `null` at low difficulties**
  (`dlines` only from `DIFF_NORMAL`, `linedsf` only from `DIFF_HARD`). Model them
  as `Uint8Array | null` / `FlipDsf | null` and let the compiler enforce the
  difficulty guards. That is a real safety win the C cannot have.
- **`dupSolverState` is needed exactly once** — the defensive copy at the top of
  `solveGameRec` — because there is no backtracking. Keep it (it preserves the
  "solving does not mutate the caller's state" contract `gameHasUniqueSoln`
  relies on), but as a `clone()` method, and delete `freeSolverState` entirely.

Also: `lines` values are **load-bearing arithmetic** (`YES=0, UNKNOWN=1, NO=2`,
with `OPP(x) = 2 - x`). Do not model them as a string union; a numeric union over
a `Uint8Array` plus an `opp()` helper is the right shape.

### D3c — Memoise `validateDesc`'s face count

`validate_desc` builds an **entire grid** just to learn `numFaces`
(`loopy.c:796-797`, where upstream flags the inefficiency itself). For Penrose,
hats and spectres that is now a full aperiodic generation plus a trim — on every
description validation, including the assert at the end of every `newDesc`.

Memoise `numFaces` per `(type, w, h, gridDesc)`. Behaviour-identical, and it
removes a cost that upstream tolerated only because its aperiodic grids were
built far less often than ours will be.

### D4 — Both grid orderings survive; the mapping is Loopy's

`grid.ts` owns the `GRIDGEN_LIST` ordering as its `GridType` union. Loopy has its
**own** enum whose order differs and **is frozen into saved game IDs**, with
upstream commenting at length that nothing may be inserted except at the end.

Carried over from change 1's D9: **do not collapse the two.** The Loopy-side
ordering and the mapping table belong to the game. The per-type *minimum* sizes
(`amin`/`omin`) live there too — geometry has no opinion on them, and
`gridValidateParams` deliberately implements only the maximum-size guards.

### D5 — Move model: a discriminated union of ops, not a move string

Upstream encodes moves as a string that `execute_move` parses. Every recent port
in this repo (Pearl, Tracks, Map, Rect) instead models the move as a
discriminated union of ops, which the type-checker covers exhaustively and which
`interpretMove` builds directly.

Do the same here. The move string is a serialisation detail of a C program that
had no other way to express a variant; it is not part of the game's meaning, and
the save format is ours.

### D5a — Loopy genuinely uses `MOD_STYLUS`, and that is what the fallthroughs are for

The two `interpret_move` fallthroughs are not sloppiness — they implement
**stylus mode**, and the port must set `wantsStylusModifier: true` (the midend
otherwise strips the bit).

With a mouse, each button is a 2-state toggle between its own state and
`UNKNOWN`. With a stylus — no right button available — each button becomes a
3-cycle, so a single tap can reach every state: left goes
`UNKNOWN → YES → NO → UNKNOWN`, right goes `UNKNOWN → NO → YES → UNKNOWN`.

Write it as an explicit `nextLineState(button, old, stylus)` table (TS's
`noFallthroughCasesInSwitch` forbids the transliteration anyway, and the table is
clearer). **Keep a comment naming the stylus rationale** — without it the
asymmetry reads as a bug and will be "fixed".

### D6a — Drop upstream's incremental-redraw machinery; keep its diff key and phase order

Roughly 200 lines of Loopy's UI half — `REDRAW_OBJECTS_LIMIT`, `edge_bbox`,
`dot_bbox`, `face_text_bbox`, `boxes_intersect`, the clip/`draw_update` dance —
exist to repaint sub-rectangles rather than the board. Upstream's stated reason
(`loopy.c:3473-3477`) is an artefact of drawing over an existing frame: *"if you
try to draw an antialiased diagonal line over itself, you get a slightly thicker
antialiased diagonal line, which looks rather ugly after a while."*

That rationale does not apply to a renderer that clears and repaints. **Port the
parts that carry meaning and drop the parts that carry only performance:**

- **Keep the diff key** — per edge `lineErrors[i] ? DS_LINE_ERROR : lines[i]`,
  per face `clueError`/`clueSatisfied`. This is what decides *whether* to redraw.
- **Keep the five-phase colour ordering** (`FAINT, LINEUNKNOWN, FOREGROUND,
  HIGHLIGHT, MISTAKE`), which is a real z-order: mistakes must paint over
  everything. Bucket edges by colour once and draw five buckets, rather than
  upstream's O(5·E) scan with an early return per edge.
- **Drop** the bboxes, the 16-object limit and the clipping.

This is squarely within the project's stated byte-parity scope: display code
targets neat visuals and clean code, not fidelity.

**Border geometry, settled:** `puzzles/cmake/platforms/webapp.cmake:44` defines
`NARROW_BORDERS`, so the arm this fork compiles is
`BORDER(tilesize) = DOT_RADIUS(tilesize)` — clamped to 1–3 px — **not**
`tilesize / 2` (16 px at the preferred tile size). That is a very visible
difference, and it is the same narrow geometry Pearl uses. Checked rather than
assumed, because both arms are in the source and only one is ours.

**Good news that makes this cheap: there is no per-tiling drawing code at all.**
Faces are never filled, edges are always straight `dot1→dot2` segments, dots are
always circles. Every tiling difference comes out of `grid.ts`'s geometry, so the
renderer is far simpler than "18 tilings" suggests.

### D6b — Fix the clue-position cache invalidation (a latent upstream bug)

`ds->textx/texty` memoises each clue's **screen** position, computed from
`gridFindIncentre` through `gridToScreen`. Screen coordinates depend on
`tilesize` — but upstream never invalidates the cache on resize, because
`game_set_size` is only ever called before the first redraw in its frontends.

This project's `ResizeController` calls `size()` on every layout perturbation.
An uninvalidated cache would draw clues at stale positions after a resize. This
is exactly the class of bug that cost Flip three iterations (`fix-flip-canvas-reshape`).

**Invalidate the position cache in `setTileSize`.** Note the *incentre* itself is
tile-size-independent and cached on the face by `grid.ts`; only the screen
projection needs recomputing.

### D6c — Make the derived colours luminance-aware, and say so

`COL_LINEUNKNOWN` and `COL_FAINT` are both derived as `background × 0.9`.
On a dark background that is *darker* than the background, so faint lines
vanish. Upstream concedes this without fixing it (`loopy.c:1046-1049`: *"Except
if the background is pretty dark already; then it ought to be a bit lighter. Oy
vey."*).

This fork ships a dark mode. Compute the factor from background luminance —
lighten on dark backgrounds, darken on light ones — and **record the divergence
in the code**, as Pearl does for its `paletteOverrides`. Display-only, so no
fidelity cost.

### D6d — `canFormatAsText` is param-dependent, which the interface is not

`game_can_format_as_text_now` returns **false for every non-square grid type**
(the text format assumes a square lattice, and asserts it). This repo's `Game`
interface has a static `canFormatAsText: boolean`.

Resolve during implementation, cheapest option first: if the midend tolerates a
`textFormat` that returns `null` for unsupported params, use that and keep the
flag static. Only if it does not should the interface gain a
`canFormatAsTextNow?(params)` hook — and per the `PointerAction` precedent, do
not add a hook without an adopter. Whichever way it goes, record it.

### D6e — Collapse the macro-generated parallel arrays

`GRIDLIST` expands into four parallel C arrays (`gridnames[]`, `grid_types[]`,
`grid_size_limits[]`, `GRID_CONFIGS`); `DIFFLIST` into three. The macro exists
because C has no better way to keep them in step.

TS does: one `as const` table of objects per list, with the choices string, the
encode char and the min-size error messages all *derived* from it. The array
**index is the wire format** (D4), so carry upstream's "do not insert except at
the end" warning onto the table.

Two quirks to keep while doing so: preset titles are formatted `h` before `w`
(so the 12×10 triangular preset displays as "10x12"), and the preset list is a
**two-level menu** with a "More..." submenu — unusual in this collection, and
the app shell needs to render it.

### D6 — Differential: all 18 grid types, byte-match on desc

A new `puzzles/auxiliary/loopy-trace.c` on the established pattern: for each
`(grid type, size, difficulty, seed)`, dump the generated desc, and assert both
that the TS `newDesc` reproduces it byte-for-byte **and** that the TS solver
grades the C's board at exactly the recorded difficulty.

This is the assertion that validates the whole port at once — the desc depends
on the solver's verdict on every intermediate board, so a single divergence
anywhere in 3,900 lines fails it.

Matrix requirement: **every one of the 18 grid types appears**, because this
change is also the first real exercise of changes 1 and 2. Both of those shipped
without a user-visible surface and were accepted on the explicit basis that
there was nothing to acceptance-test; their handoffs both say the first real
acceptance test of the tilings is Loopy. Skew the matrix accordingly — breadth
across tilings matters more here than depth per tiling.

Penrose fixtures must avoid the seeds and sizes that abort the C (see D1 and
`add-aperiodic-tilings`' findings). That is a limitation of the *oracle*, not of
the port: the TS handles those cases, and D1's retry is unit-tested rather than
differential-tested.

## Risks

- **Size.** 3,900 lines, the largest single game in the collection, and the
  first to be grid-generic across 18 tilings. Mitigated by D6 and by the
  parallel-agent pattern that worked in changes 1 and 2 (exclusive file
  ownership, one shared dispatch edit written up front, a live differential from
  minute one).
- **The tilings are unproven in anger.** Changes 1 and 2 are differential-clean
  but have never rendered. A tiling bug will present as a Loopy bug. Budget for
  that: when something looks wrong in one tiling only, suspect the tiling.
- **Stage 2 is a very large deletion** (~14,300 lines) and is irreversible in
  the same commit. It stays gated on owner acceptance, per the parity-gate
  doctrine — register the game and let it be smoke-tested on the TS path first,
  flip `TS_PORTED` and delete the C only after.
- **No hint ships here**, so Loopy's first release is less capable than Palisade
  or Dominosa. That is the established sequencing and not a regression, but it
  should be said out loud rather than discovered.

## Findings during implementation

Seven things the design got wrong, or could not have known without reading the
app layer. Recorded here rather than left to be rediscovered.

### F1 — D1 was right in shape but wrong in one detail: one Penrose configuration is *impossible*, not unlucky

D1 assumed every degenerate patch is **seed-dependent**, and reasoned from that
to "retry, never raise the minima". Measuring it — 200 descriptions per
configuration, across all four aperiodic tilings, at every size from each type's
minimum to minimum + 5 — showed that is almost entirely true, and exactly one
exception:

- Success rates for generable configurations run from **~20% to ~98%**, and
  retrying converges quickly in every case. D1's reasoning holds for all of these.
- **Penrose kite/dart at width 3 never succeeds, at any height** (0/200 for each
  of 3×3 … 3×8). Retrying cannot rescue an impossible configuration; it only
  converts an abort into a slow error.

Note the asymmetry is real and would have been easy to get wrong: it is the
**width** specifically, and 4×3 … 8×3 succeed roughly half the time. So the fix
is *not* an `amin` bump (which would forbid those working sizes) but a width
bound, in `validateParams`, where the Custom dialog can show the player a reason
instead of failing on "New game". Upstream accepts these params and then aborts,
so this diverges only where the C has no defined behaviour — playbook rule (1).

Consequently `buildLoopyGrid`'s bound is deliberately **small** (100, not the
house default 10,000): with a worst generable success rate of ~20%, 100 attempts
fail with probability ~2e-10, while any *other* impossible configuration that
ever appears reports in milliseconds rather than tens of seconds.

### F2 — The generator needed a second recovery D1 did not anticipate

Even on a well-formed patch, the inner `newboard_please` loop can fail to find a
board that is uniquely solvable at the requested difficulty **and** not solvable
one rung easier. Upstream concedes this in a comment — *"this can loop for ever
if the params are suitably unfavourable"* — and simply hangs.

Measured at the smallest legal Penrose sizes, this is a property of the
**patch**, not the params: Penrose kite/dart 4×4 at Normal needed 25 patches;
the same size at Hard succeeded on the first. So `newDesc` retries with a fresh
patch, bounded, for the tilings whose descriptions consume randomness — and
propagates for the deterministic tilings, where a fresh draw is the same grid
and exhaustion genuinely means the params admit no puzzle.

This cannot diverge from a terminating C run: the inner budget stays at the
house default, so any board upstream *would* have found is still found before a
patch is abandoned. It engages only where upstream hangs.

One case remains unrescued — Penrose rhombs 3×3 at Normal, where 25 patches ×
200 attempts found nothing, and which is plausibly genuinely impossible. It
raises `RetryLimitExceeded` after a few seconds, where upstream hangs for ever.
That is the outcome `retry-limit.ts` doctrine asks for and it is left as is.

### F3 — **D6c is withdrawn: the app already owns dark mode**

D6c called for luminance-aware derivation of `COL_LINEUNKNOWN`/`COL_FAINT`,
reasoning that upstream's `background × 0.9` is *darker* than the background and
so vanishes in this fork's dark mode. **The premise is false for this app.**

`src/puzzle/puzzle-view.ts` passes **pure white** as `defaultBackground` in dark
mode and adapts the returned palette afterwards in OKLCH (with per-puzzle
`darkMode.paletteOverrides` in `augmentation.ts`), and its comment says exactly
why:

> *"It doesn't work well for dark background colors. Puzzles often generate
> colors by multiplying the background by a factor < 1.0. This works for light
> backgrounds, but generates near-blacks for dark ones. Instead, invert a dark
> background to generate a light palette, and reverse that later."*

So `colours()` never receives a dark background, the luminance test is dead
code, and a second adaptation inside the game would fight the layer that owns
the concern. Loopy's palette is therefore **identical to upstream's**, and the
reason is recorded in `render.ts`.

Worth generalising: a display-side divergence justified by "this fork ships a
dark mode" should first check whether `puzzle-view.ts` has already handled it.

### F4 — D6d resolved by widening `Game.textFormat`, with no new hook

`game_can_format_as_text_now(params)` is param-dependent (square grids only);
the `Game` interface's `canFormatAsText` is static. D6d listed options cheapest
first. The cheapest works: `Midend.formatAsText` already returns
`string | undefined` and the share dialog already treats an absent rendering as
"no text panel", so `Game.textFormat` was widened to return `string | undefined`
and Loopy returns `undefined` for the seventeen non-square tilings. No
`canFormatAsTextNow?(params)` hook was added — per the `PointerAction`
precedent, it would have had one adopter and a wider surface.

### F5 — Loopy does **not** fit the shared `runDeductionFixpoint`

Both handoffs asserted that Loopy's four rungs "fit the shared
`runDeductionFixpoint` runner". Reading the loop closely, they do not, and using
it would have been a silent behaviour change:

- The shared runner restarts from rung 0 on any firing and reports a grade of
  "highest rung that fired". Loopy instead runs with a difficulty *cap* and asks
  whether the board came out solved.
- More importantly, `solve_game_rec` carries a `(thresholdDiff, thresholdIndex)`
  pair the shared runner has no notion of. Each rung returns the *lowest* rung
  that could notice what it did, and the loop skips cheap rungs that provably
  cannot use the new information.

That began as a speed optimisation, but because the generator is solver-gated it
decides **which puzzles exist**. It is ported exactly; the reasoning is recorded
in `solver.ts`'s module doc so the "why not use the shared runner?" question is
answered where it will be asked.

### F6 — Two factual errors in the task list, corrected in passing

- Task 4.1 says "`FACE_COLOUR(null)` is white, which is what makes boundary
  clues come out right". It is **black** (`loopgen.h:14-16`) — and that is what
  makes boundary clues right: a white face at the edge of the patch sees a
  colour transition across its outer edges and is clued for them.
- Task 3.6 is right that `face_setall_identical` always returns `false`, and the
  regression test asserts it *even when it mutates*; but note the reachability
  analysis in D3.1 is what justifies keeping it, and that analysis is now
  restated in the function's own doc comment rather than only here.

### F7 — The two-level preset menu renders as a labelled section (task 2.5)

Task 2.5 asked to confirm the app shell renders a nested preset menu, and to
treat a failure as a real finding rather than quietly flattening it. It renders:
`Puzzle.getPresets(true)` flattens submenus while keeping the submenu node, and
`puzzle-type-menu.ts` turns that node into a divider plus an `<h3>` heading
followed by its entries. So "More..." appears as a titled group rather than a
nested flyout — a faithful rendering of the intent, and the nesting is kept.

### F8 — A pre-existing TS-engine repaint bug, half fixed and half handed off

Dev-verification (task 8.4) surfaced a **blank board on first paint**, and it is
worth writing down carefully because the first instinct — "Loopy doesn't render"
— was wrong twice over.

**What was observed.** Deep-linking to a non-default type
(`/loopy?type=5x4t9dh`) left the canvas empty indefinitely, while the *same*
params chosen from the Type menu painted immediately. Loopy's own rendering was
never at fault: `redraw` produces the right ops for all 18 tilings in-process
(verified at both the preferred and a large tile size, with every drawn
coordinate inside `computeSize`'s bounds), and 16 of the 18 tilings painted fine
on the same route.

**Two things confirmed it was not Loopy's.** The same failure reproduces on
**Pearl** — shipped and owner-accepted since 2026-07 — via `/pearl?type=12x8dt`;
and it does **not** reproduce on a C/WASM game (`/bricks?type=10x10dn`). That
pins it to the TS engine's adapter rather than to any game or to the app shell
generally.

**Root cause found and fixed (one of them).** `TsWorkerPuzzle.redraw()` is gated
on `paletteReady`, and *silently drops* any repaint requested before the palette
is installed. The midend requests one on the initial game transition, which is a
race the game loses whenever generation is fast — and nothing re-issued it,
because `setDrawingPalette` only repainted when it *replaced* an existing
palette (`setPalette` returns true only on replacement), never on the first
install. One branch in `worker-adapter.ts` now repaints on first install.
Verified: Pearl's deep link paints correctly after the fix.

**Still open, and handed off.** Loopy's dodecagonal and kagome cases (both
`5x4`, i.e. `w ≠ h`) remain blank on that route after the fix, so there is a
**second, independent cause**. The evidence so far: it correlates with a
non-square board; the board *is* generated and merely unpainted (opening any
menu paints it instantly); no console error appears. A plausible second
mechanism — `resizeDrawing` clears the canvas and drops the drawstate without
repainting — was implemented and **reverted**, because it did not fix the
symptom and shipping an unverified guess is worse than shipping a known gap.

This is **not a Loopy parity shortfall** (it predates this change, reproduces on
another game, and does not affect the normal in-app path), but it is a real
user-visible bug in shipped code and should get its own change. It is the
highest-value item in `NEXT-STEPS.md` for that reason.
