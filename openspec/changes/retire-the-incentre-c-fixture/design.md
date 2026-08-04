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
line with the implementation. `r_TS / r_best > 0.95` is a bar C's answer never
had to clear — and the two defects it caught in `probe-shared-hint-machinery`
(measuring room to an edge's *infinite line* rather than to the edge; never
starting a candidate subset at a vertex) both sailed through the C comparison
for as long as it has existed.

## D2 — The cost, measured, and three ways to pay it

A full-resolution sweep over every face the fixture covers is **8,277,778
lattice points** across 1,864 faces (largest single face 33,127 points).
Extrapolating from `grid-geometry.test.ts`'s existing sweep (~1 M points in
~465 ms of test time) that is roughly **4 seconds** — too much to add to the
gate silently, and the reason this is a change rather than an edit.

Options, for the implementing session to choose and record:

1. **Coarsen the lattice** to step 2 or 3 and widen the tolerance to match
   (a step-*k* sweep can under-report the true best by up to the radius change
   over `k/√2` units). Cheapest; keeps every face.
2. **Sweep coarse, then refine locally** around the best point found. Nearly
   exact, still cheap, more code.
3. **Cover every tiling but sample faces within it** — the per-tiling *shape
   family* is what varies, and a tiling's faces repeat. Keeps full resolution;
   must state the sampling and log what it dropped (`repo-layout`: no silent
   caps).
4. **Gate the full sweep behind `itSlow`** (`src/engine/testing/slow.ts`) and
   keep a cheap version in the default run.

Option 3 combined with 1 is the current guess; measure before committing.

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
