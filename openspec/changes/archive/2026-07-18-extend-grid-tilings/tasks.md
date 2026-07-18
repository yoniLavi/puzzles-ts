# Tasks — extend-grid-tilings

## 1. Differential harness first

The differential is the mitigation for this change's main risk (transcription
volume), so it goes in before the transcription, not after.

- [x] 1.1 Write `puzzles/auxiliary/grid-trace.c` — for each `(type, w, h)` on
      argv, dump `tileSize`, bounding box, every dot (`index, x, y`), every edge
      (`index, dot1, dot2, face1, face2`, `-1` for the exterior) and every face
      (`index, order, dots[], edges[]`) as JSON.
- [x] 1.2 Add its `cliprogram()` line to `puzzles/CMakeLists.txt`; build native
      (`cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0 && make grid-trace`).
- [x] 1.3 Generate `src/native/engine/__fixtures__/grid-c-reference.json` over
      the matrix: all 14 periodic types at minimum legal size, a mid size and a
      non-square size; triangular additionally in both desc modes.
- [x] 1.4 Write `src/native/engine/grid-differential.test.ts` asserting exact
      equality of the full incidence dump. It fails wholesale until §2 lands —
      that is intended.

## 2. The 13 periodic tilings

Port against the C reference one at a time, running the differential after each
so a failure names one tiling. Order is easiest-first to establish the shared
shape before the long ones.

- [x] 2.1 `GridType` enum/union in `GRIDGEN_LIST` order + generator dispatch.
- [x] 2.2 honeycomb
- [x] 2.3 snub-square
- [x] 2.4 Cairo — note the `(x+y)%2` parity and the `y>0`/`x>0` emission guards.
- [x] 2.5 octagonal
- [x] 2.6 kites
- [x] 2.7 dodecagonal
- [x] 2.8 great-hexagonal — six face kinds with boundary guards.
- [x] 2.9 Kagome
- [x] 2.10 great-dodecagonal
- [x] 2.11 compass-dodecagonal
- [x] 2.12 floret — **`Math.trunc` on all four integer divisions** (design D5);
      negative basis-vector components make this the one place `/` silently
      diverges. Keep upstream's deliberate skipped cell.
- [x] 2.13 great-great-dodecagonal — 12 face kinds, the longest generator.
- [x] 2.14 triangular — **both** algorithms, selected by the version desc
      (design D6); the legacy branch leaves ragged "ears".
- [x] 2.15 Comment `makeConsistent`'s `Map.get`-vs-`del234` divergence
      (design D9 risk) now that far more tilings exercise it.

## 3. Size, hit-test, incentre, validation

- [x] 3.1 `gridComputeSize` for the 14 periodic types (pure integer).
- [x] 3.2 `gridValidateParams` — maximum-size overflow guards only; per-type
      minima belong to the game (design D9).
- [x] 3.3 `gridNearestEdge` — integer eligibility test, **strict `<`** on the
      distance comparison (design D4).
- [x] 3.4 `gridFindIncentre` — faithful port, lazy + cached. Assert the
      *property* (point inside face, inscribed radius within tolerance), never
      exact float coordinates (design D3).

## 4. Behavioural tests

- [x] 4.1 Tier-1 `src/native/engine/grid.test.ts`: for every periodic tiling —
      incidence completeness (every face's edges join consecutive dots; every
      edge has 1–2 faces; every dot ring complete), determinism across two
      builds, and no fractional dot coordinates.
- [x] 4.2 Euler-characteristic property test per tiling
      (`V - E + F = 1` for a simply-connected planar patch) — cheap, and catches
      a whole class of incidence errors the dump comparison would only catch
      against a fixture.
- [x] 4.3 `gridNearestEdge` tests incl. the exact-tie lowest-index case.
- [x] 4.4 `gridFindIncentre` property tests over concave faces.
- [x] 4.5 Confirm **Pearl's differential is still green** — `gridNewSquare` and
      `makeConsistent` must be behaviour-identical (design D9 risk / this
      change's regression bar).

## 5. Close out

- [x] 5.1 Full gate green (`tsc -b --noEmit` → biome → `vitest run` →
      `vite build`).
- [x] 5.2 `openspec validate extend-grid-tilings --strict`.
- [x] 5.3 Update `docs/porting/game-port-playbook.md` §2.1 — `grid.ts` is no
      longer "square tiling only"; record what remains for change 2.
- [x] 5.4 Owner acceptance, then commit (port + archive together).
      **Accepted 2026-07-18 on the explicit basis that there is nothing to
      acceptance-test** — this change has no user-visible surface (no game
      consumes the new tilings until `add-loopy-ts-port`). The owner declined
      hands-on acceptance as too far in the weeds and delegated it. Recorded
      so no future reader assumes this was playtested: its assurance comes
      from the index-exact C differential and the gate, not from a human
      driving it. **The first real acceptance test of this code is Loopy
      itself**, where these tilings finally render.

Note: `puzzles/grid.c` and `grid-trace.c` are **retained** at the end of this
change — `grid.c` is still Loopy's dependency, and the trace harness is reused
by change 2. Both go in change 3's stage 2.
