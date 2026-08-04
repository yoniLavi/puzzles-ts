# Design — retire-the-incentre-c-fixture

## The survey, in full

Run 2026-08-04 at the owner's request. Recorded here so it is not re-run.

### There is no C reliance

| checked | result |
| --- | --- |
| `.c` / `.h` / `.but` / `CMakeLists.txt` / `.cmake` anywhere in-tree | **2 files**, both the deliberate reading copies in `openspec/changes/add-{path,numgame}-ts-port/reference/`, each with a README saying it cannot be compiled |
| npm scripts touching a C toolchain | **none** — `dev`, `build`, `check`, `test*`, `diff`, `gate`, `metrics`, `mutation`, `probe` |
| vite plugins / build inputs requiring a C artefact | **none**; the catalog is committed source |
| dead recipes instructing a reader to run a C build | **none** — `retire-c-era-leftovers` removed all 37 |

### What actually exists, and the verdict on each

| artefact | what it records | verdict |
| --- | --- | --- |
| 50 × `src/games/*/…-c-reference.json` + their `*-differential.test.ts` | which boards a solver-gated generator produces for a seed — a fact about upstream's algorithm with no closed form | **KEEP.** `AGENTS.md` migration order step 2 names them the net for the refactoring phase; the byte-parity release kept them deliberately. |
| `grid-c-reference.json` (616 KB) | dot/edge/face incidence *in emission order* for the periodic tilings | **KEEP.** A true byte-match, and the stated mitigation for 13 hand-transcribed generators (`extend-grid-tilings` D7). Index-exact agreement proves emission order, which nothing else does. |
| `grid-aperiodic-c-reference.json` (297 KB) | the same for the aperiodic tilings | **KEEP**, same reason. |
| `random/__fixtures__/corpus.json` | the bit-identical RNG stream | **KEEP.** Explicit in `AGENTS.md`: retained so future shared game IDs reproduce across builds. |
| `grid-incentre-c-reference.json` (36 KB) | where another implementation drew a clue digit | **RETIRE** — see below. |
| 153 provenance comments naming a `puzzles/*.c` | where a port came from | **KEEP.** Upstream exists; the derivation is still true; `retire-c-era-leftovers` settled this. |

The dividing line is not "was this recorded from C". It is **can the fact be
derived**. A generator's output cannot: there is no independent way to say which
board upstream's minimisation loop lands on, so the recording *is* the
specification. The largest circle that fits inside a polygon can: it is a
definition, and a lattice sweep computes it.

This is the same question `retire-native-directory` asked of `combi`'s corpus,
and the same answer, with the refinement that change added — ask it of *every*
fact the fixture asserts, not just the headline one. Hence D3 below.

## D1 — Why the C comparison is weaker than it looks

`grid-incentre.test.ts` asserts, per face: (a) the TS point is strictly inside
its face, and (b) `|r_TS − r_C| ≤ 1`.

(a) needs no fixture — it is a property of the TS output alone.

(b) is a **peer comparison**. It is green whenever the two implementations agree,
including when they are both wrong, and it cannot be tightened: the test file
says so itself, in the reasoning for `RADIUS_TOLERANCE = 1` and in the note that
pinning the drift "would be exactly the float gate D3 says not to build".

The replacement inverts that. `bestByBruteForce` computes the best inscribed
radius any integer point of the face admits, from the vertex ring, sharing no
line with the implementation — a bar C's answer never had to clear.

Two bounds are asserted per face rather than one, because they fail differently:
an **absolute** shortfall of at most 0.71 (the half-unit-per-axis the rounding
step can cost, so it is derived rather than fitted) catches a point nudged off
the optimum, and a **relative** floor of 0.9 catches a search that settled
somewhere else entirely. The absolute bound is the one that matters here: it is
what D5's regression trips, at 1.229.

*Corrected during implementation.* This section originally claimed both defects
`probe-shared-hint-machinery` found would have sailed through the C comparison
and be caught by the replacement. Only the first is: measuring room to an edge's
*infinite line* rather than to the edge fails two tilings in the new sweep. The
second — never starting a candidate subset at a vertex — is caught by neither
comparison, and chasing that down is D6, which found the test that was supposed
to cover it does not.

## D2 — The cost, measured: **none of the four mitigations is needed**

*Resolved by measurement, 2026-08-04. The estimate below was wrong by ~3.5×, in
the expensive direction; the mitigations it motivated are all dropped.*

The estimate was ~4 s, extrapolated from `grid-geometry.test.ts`'s existing sweep
at ~1 M points per 465 ms of *test file* time — which is the error: that 465 ms
is the file's whole runtime, most of it import and transform, not lattice work.

Timed directly, the full-resolution step-1 sweep over the fixture's 44 grids
(8,277,778 points, 1,864 faces) is **1,153 ms**. Extending it to all eighteen
tilings — the fourteen periodic ones at the same three sizes each, plus the four
aperiodic, which the fixture never covered — is 8,408,262 points over 1,816
faces in **1,271 ms**. (Fewer faces for more points: the aperiodic patches have
large faces, and Penrose runs at 4×4 rather than 3×3.)

So the sweep runs at **full resolution over every face of every tiling**, and
options 1–4 are all declined:

1. *Coarsen the lattice* — declined. A step-2 sweep costs 265 ms rather than
   1,153 ms, but it under-reports the true best (worst ratio moves 0.941 → 0.974
   purely because the yardstick got weaker), so it buys 0.9 s by making the
   measurement less true. That is the wrong trade for the one assertion this
   file exists to make.
2. *Coarse-then-refine* — declined, unnecessary at this cost.
3. *Sample faces within a tiling* — declined; there is nothing to buy. It would
   also have needed a "here is what I dropped" log under the no-silent-caps rule.
4. *Gate behind `itSlow`* — declined. A check the gate does not run is a check
   that rots, and 1.3 s does not warrant it.

**Actual gate cost.** `grid-incentre.test.ts` goes from 171 ms to 2.5 s of test
time (+2.3 s); `grid-geometry.test.ts` is unchanged. The full suite is ~60 s, so
this is under +4%, and it is the price of the file's only real assertion.

### What the measurement found on the way — see D5

The sweep's first run reported a worst shortfall of **1.229 units** where
rounding alone can cost at most 0.707, which is what led to D5. Once that was
fixed the worst shortfall over all 1,816 faces is **0.053**.

## D3 — What else the fixture asserts, checked before deleting it

Per `retire-native-directory`'s rule, the question is not whether the *headline*
fact is derivable but whether **every** fact the fixture carries is. Two others
ride along:

- **`expect(g.faces).toHaveLength(f.incentres.length)`** — a per-tiling face
  count. Already asserted far more strongly by `grid-differential.test.ts`,
  which compares the whole face list in emission order. Not lost; but the
  replacement should still assert a face count from the grid so the sweep cannot
  silently iterate zero faces (the "how many things did I look at?" guard this
  repo has now needed five times).
- **The fixture list doubles as the set of `(type, w, h, desc)` cases swept.**
  Deleting it deletes that list. The replacement must enumerate tilings from
  `GRID_TYPES` (or the barrel's own list) rather than from a fixture — which is
  better, because a newly added tiling then joins the sweep automatically
  instead of being silently uncovered.

## D4 — The dead skip scaffold

The fixture loop carries a `skip()` path for "a tiling whose TS generator has
not landed yet", plus a `reports which tilings were skipped` test whose only
assertion is `expect(Array.isArray(skipped)).toBe(true)`. Every generator landed
with Loopy (2026-07-20), so the branch is unreachable and the reporting test
asserts a tautology. Both go with the fixture. Enumerating from `GRID_TYPES`
(D3) means an unimplemented tiling would now fail loudly, which is the correct
behaviour and no longer a risk.

## D5 — What the yardstick found on its first run: the rounding was C's, and C's is wrong

*Added during implementation. Owner-approved to land in this change rather than
as a follow-up.*

The sweep's first run reported a worst shortfall of **1.229 units** of inscribed
radius against the best the integer lattice admits. That number should have been
impossible. `bestByBruteForce` searches the *same integer lattice* the answer is
quantised onto, the inscribed radius is 1-Lipschitz in the point, and rounding
moves a point by at most 1/√2 ≈ 0.707 — so if the search finds the continuous
optimum, the shortfall cannot exceed 0.707. Something was moving the point
further than rounding can.

It was the store:

```ts
f.ix = Math.trunc(xBest + 0.5);   // "Round to nearest", said the comment
```

That is round-to-nearest **only for a positive coordinate**. `Math.trunc`
truncates toward zero, so at `xBest = -134.98` it yields `-134` where the nearest
integer is `-135` — a whole unit, per axis, √2 in displacement. And grid
coordinates are negative over most of a board: the tilings are built around the
origin and then re-centred. So this was not an edge case; it misplaced nearly
every clue digit on seventeen of the eighteen tilings.

The comment named the motive correctly ("matching the C's double->int
assignment, which truncates toward zero") and then mislabelled the result. The
trap is real and worth naming: **`+ 0.5` reads as rounding, and the reader stops
there.** The rest of the sentence is the part that matters.

Swapping in `Math.round` drops the worst shortfall from **1.229 → 0.053** and the
worst ratio from 0.941 → 0.998, over all 1,816 faces. So the candidate search is
essentially exact, and the entire measured shortfall was this one line.

**Why it landed here rather than as a follow-up.** It is one line; the incentre
is display-only and was never byte-parity surface (`AGENTS.md`, "Display code was
never in scope", 2026-07-04); and the comment's own stated reason — *"there is no
reason to diverge"* — is precisely the constraint the owner released on
2026-08-01. Leaving it would also have forced this change to ship a fitted bound
of ~1.5 whose entire magnitude was one deliberate wart, instead of the derived
0.71 the file now asserts.

**Blast radius, checked rather than assumed.** The only consumer is
`loopy/render.ts`. `loopy-render-scenario.test.ts.snap` does **not** move,
because its scenario is the square tiling, whose coordinates are entirely
non-negative — the one tiling where the two expressions agree. So no committed
snapshot covers the seventeen tilings this visibly improves; that is a coverage
gap this change notes rather than closes, and the new sweep is what stands in
for it.

The probe case at `feedback-probe-cases.mjs` anchored on the old line and was
re-pointed at the *regression* rather than at a coarser mutation: it now restores
`Math.trunc(xBest + 0.5)` and asks whether the module's own tests notice. They
do, twice — the sweep's absolute bound, and a new negative-coordinate case in
`grid-geometry.test.ts`.

## D6 — A test that passed for the wrong reason, found by task 1.3

Task 1.3 asked for proof that the new sweep catches the two defects the C
comparison had not. Result, honestly:

- **Distance measured to an edge's infinite line rather than to the segment** —
  caught. Two of the sweep's tilings fail.
- **3-subset enumeration restricted to subsets containing an edge** — *not*
  caught by the sweep, which is what `grid-geometry.test.ts` predicts ("No
  periodic tiling needs it"). It was supposed to be caught by that file's frozen
  8-gon, named `considers the candidate points held in place by three vertices`.
  **It is not.**

The enumeration indexes edges `0..order-1` and vertices `order..2*order-1`, so
restricting the outer loop to `i < order` is exactly "the subset must contain an
edge" — vertices sort after every edge — which is the mutation that test's
comment describes. Under it, the frozen 8-gon's answer is **bit-identical**:
point `(28, -13)`, ratio 1.000. What the test actually catches is the probe
corpus's stronger `i + 2 < order`, which additionally drops subsets led by the
*last two edges*, and on that shape the supporting trio is led by a late **edge**,
not by three vertices.

So the test works and the probe stays at 14/14 — but its name and comment
asserted a mechanism it does not exercise, which would have let a reader conclude
the all-vertices arm was covered. It is covered by nothing.

Re-running the comment's own experiment settles what to do: over 400 members of
the `awkwardPolygon` family, removing the all-vertices arm changes the answer on
**2**, by at most 1% of the achievable radius — and on one of the two the answer
gets slightly *better*. There is no shape here worth freezing for it. So the test
is renamed to what it pins, and the arm is recorded as unpinned with that
measurement, rather than left looking covered. (The earlier "5 of 400, widest
margin" provenance note measured a different restriction.)

This is the sixth time this repo has found an assertion aimed at a neighbour of
the thing it named — after `grid.test.ts`'s `d.edges.length === d.order`,
`touch-input.test.ts`'s catalog-vs-registry count, the silently-empty
`import.meta.glob`, and both halves of `retire-the-upstream-help-tree`'s
`help/manual` grep. The recurring tell is the same: **the assertion was never run
against the defect it claims to catch.**

## D7 — The wider C-remnant sweep the owner asked for, and its one live find

Run alongside this change. `retire-c-era-leftovers` (2026-08-03) had already
taken the dead recipes and false present-tense claims, and the sweep confirms
that: every `puzzles/*.c` mention left in `src/` is *provenance* (where a port
came from, which is still true and still the only surviving answer), and the two
deliberate keeps — `PuzzleEngineSurface` with one implementer, the registry with
no fallback to switch to — both already carry their reason at the site.

Three finds, all now fixed:

1. **`savePreferences` / `loadPreferences` — a complete dead chain, and worse
   than dead.** `Puzzle.savePreferences()` is a public main-thread API →
   Comlink → `TsWorkerPuzzle.savePreferences()` → returns an empty
   `Uint8Array` by design. Nothing calls it. It existed only to mirror
   upstream's `midend_serialise_prefs` across the C/WASM boundary, and the
   `ts-engine` spec explicitly permitted the no-op ("MAY remain a no-op on the
   TS path") at a time when the other implementation was real. With that gone,
   what is left is a method that *silently returns nothing* rather than
   refusing — the exact shape `retire-c-era-leftovers` called out, where the
   mechanism is gone but the guard still tells the next reader it works.
   Deleted from all three files; the spec requirement now forbids it and says
   an import/export feature should choose its own format.

2. **`AGENTS.md` contradicting itself about `src/assets/`.** One line says
   "Nothing under `src/assets/` is generated"; nineteen lines later the layout
   list says "(`icons/` committed, `manual/` generated)". `src/assets/manual/`
   went with `retire-the-upstream-help-tree`. The same paragraph also ended
   "Everything under `build/` is gitignored too", and `build/` went with
   `prune-dead-toolchain-leftovers`. Both corrected.

3. The rounding (D5), which is a C remnant in the strictest sense: not a
   mention of the C, but a line of C behaviour reproduced past the point where
   anything wanted it.
