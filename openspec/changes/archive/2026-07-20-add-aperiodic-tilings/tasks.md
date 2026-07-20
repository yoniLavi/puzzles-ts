# Tasks — add-aperiodic-tilings

## 1. Prerequisites shared by all four tilings

These block every tiling, so they land first and get their own tests.

- [x] 1.1 `src/native/engine/n-times-root-k.ts` — exact `round(n·√k)` per
      `misc.c:569` (design D7). Port the bitwise algorithm; **do not** substitute
      `Math.round(n * Math.sqrt(k))`. Sign is symmetric about zero and `n === 0`
      must return `+0` (not `-0` — see D8). Drop C's `INT_MIN` overflow dance.
- [x] 1.2 Unit-test it: property `|result − n*√k| <= 0.5` over a wide range for
      `k ∈ {3, 5}`, exactness on negatives, and `Object.is(nTimesRootK(0, k), 0)`.
- [x] 1.3 Drop `readonly` from `GridDot.index` / `GridFace.index` in
      `grid-core.ts` and document that trimming is the only other writer
      (design D6a).
- [x] 1.4 `gridTrimVigorously` — the `succ`/`pred` adjacency index, **not** a
      dense matrix (design D6). Throw on an empty result (D6b); keep the
      "no landlocked component" sentinel nullable, never `-1`.
- [x] 1.5 Tier-1 tests for trimming: a hand-built ragged grid trims to its
      landlocked core; a disconnected input keeps only the largest component
      (tie → lowest root index); indices are compacted densely and in order;
      an all-coastal input throws.

## 2. Desc dispatch and params validation

New surface — none of this exists in TS yet (design D14).

- [x] 2.1 `gridNewDesc(type, w, h, rng)` — the only RNG-bearing entry point.
      Triangular returns `"0"`; the other 12 periodic types return null.
- [x] 2.2 `gridValidateDesc(type, w, h, desc)`; pull triangular's validator out
      of `gridNewTriangular` to stand alone.
- [x] 2.3 Assert `gridValidateDesc(...) === null` on entry to `gridNew`, matching
      the C's treatment of an invalid desc as a programming error.
- [x] 2.4 `gridValidateParams` — remove the throw-for-non-periodic guard, extend
      `OBJECT_BOUND` with penrose 36 / hats 6 / spectres 49 (design D14a), and
      reconcile the error-string divergence deliberately.
- [x] 2.5 `gridComputeSize` for the four aperiodic types: both penrose variants
      `100·w × 100·h`, hats `56·w × 48·h`, spectres `56·w × 56·h`. Record that
      hats' reported extent deliberately does **not** match its built bbox.

## 3. Differential harness (before the transcription, not after)

Same ordering rationale as change 1: the differential is the mitigation for
transcription risk, so it goes in first and fails loudly until §4–6 land.

- [x] 3.1 Extend `puzzles/auxiliary/grid-trace.c`'s fixture matrix with the four
      aperiodic types. It already accepts `<type> <w> <h> [desc]` — extend, do
      not replace (change 1 retained it for exactly this).
- [x] 3.2 **Part A fixture (geometry, RNG-free)** — record C-generated descs plus
      the full incidence dump for each, at minimum size, a mid size and a
      non-square size (design D1).
- [x] 3.3 **Part B fixture (RNG fidelity)** — record `(seed) → desc string` for a
      spread of seeds per type. Tiny fixture; a failure names the draw order.
- [x] 3.4 Wire both into `grid-differential.test.ts`.

## 4. hat (design D13 — first, to establish the table approach)

- [x] 4.1 Table-extraction script + generated `tilings/hat-tables.ts` as flat
      `Int8Array`s with upstream's index arithmetic (design D3). Script checked
      in beside its output; header comment points at both it and `hatgen.c`.
- [x] 4.2 Verify the extraction: element counts per table, and the `{-1,…}`
      sentinel counts, against the survey's figures.
- [x] 4.3 The 14-state serpentine kite enumerator. Initialise `lastIndex` /
      `lastStep` explicitly (C reads them uninitialised).
- [x] 4.4 `stepCoordsKitemap` — assert `kite/hat/meta >= 0` before indexing (a
      latent-UB guard the C leaves to invariant); sentinel test on `.kite` only.
- [x] 4.5 `stepCoordsMetamap` + the orbit-cycle termination check. Copy-on-write
      coords make upstream's mandatory-copy aliasing constraint fall out.
- [x] 4.6 The unbounded `for (depth = 2;;)` under `retry-limit.ts` (design D5).
- [x] 4.7 `(v.x*2 + v.y)/3` via `Math.trunc`, plus a dev assert on the
      `2x + y ≡ 0 (mod 3)` invariant.
- [x] 4.8 Reflection handling (hat #3 of an H metatile): swap left/right before
      the walk, reverse the vertex list after, so faces reach
      `TilingBuilder.face()` clockwise.
- [x] 4.9 `hatTilingRandomise` / `ParamsInvalid` / `Generate`, and the desc
      round-trip. Transcribe `starting_hats`' `PROB_P`-for-`TT_T` verbatim
      (design D2). Guard the `size_t` underflow and keep the `ncoords < 3`
      early return ahead of the descending loop.
- [x] 4.10 `gridNewHats` — variable `nvertices`, no irrational scaling, **no
      recentring**. Differential green for hats, parts A and B.

## 5. spectre

- [x] 5.1 Table extraction by **compile-and-print** (design D3.2): a throwaway C
      program walking `hexdata[]` to JSON, then a generated
      `tilings/spectre-tables.ts`. Preserve the `HEX_LETTERS` ordinal order
      `G D J L X P S F Y` — it indexes everything.
- [x] 5.2 Verify: `hexedges`/`specedges` partitions are contiguous and
      total-covering; all `hexin_*` entries are internal; `specin_S` has exactly
      4 non-internal entries.
- [x] 5.3 `Point`/`Coord` arithmetic in ℤ[√3]; `coordSign` keeps JS doubles —
      **no `| 0`, no `Math.imul`** (design D11), with the reasoning in a comment.
- [x] 5.4 `spectrectxStep` ↔ `spectrectxStepHex` mutual recursion. **`while
      (!m.internal)`, not `if`** — wrong only on S-hexes, so the differential is
      the only thing that catches it.
- [x] 5.5 `chooseePoss` — draw unconditionally even for single-entry tables
      (`poss_J`, `poss_L`); `PROB_*` integers verbatim (design D2).
- [x] 5.6 `extendCoords` with the lazy `randomNew("dummy")` fallback — created at
      the same call site, shared thereafter (design D4).
- [x] 5.7 Desc round-trip incl. the writer's `coords[0] = index`,
      `coords[i] = c[i-1].index` off-by-one shift, and the length guard.
- [x] 5.8 Drop the 3-colouring sidecar (design D12).
- [x] 5.9 `gridNewSpectres` — order-14 faces incl. the collinear double-edge
      vertex, `nTimesRootK(·, 3)` with parts scaled separately, `Math.trunc`
      recentring. Differential green for spectres, parts A and B.
- [x] 5.10 **Targeted `"dummy"`-path test**: replay a desc at a larger `w`/`h`
      than it was generated for, and assert the grid matches C. No ordinary
      fixture reaches this path (design D4).

## 6. penrose

- [x] 6.1 `Letter` string-literal union + the `transition` (60 leaves) and
      `transitionIn` (36 leaves) maps, hand-transcribed and exhaustively typed
      (design D3.3). Throw on an out-of-range edge rather than mimicking C's
      no-`default` fallthrough. `EDGEEND = 3*edge + 1 + end`.
- [x] 6.2 `Point`/`Coord` arithmetic in ℤ[√5]; `pointRot`'s `%` matches JS —
      comment it so nobody "fixes" it to a floor-mod.
- [x] 6.3 `stepRecurse` — the carry-propagation recursion, with an assert (not a
      cap; it ascends rather than loops).
- [x] 6.4 BFS: visited set as a `Map` keyed on the first two vertices' coeffs;
      queue as an **array with a cursor**, never `shift()` (design D10).
- [x] 6.5 The half-tile pairing: `edge === siblingEdge && !tri.reported &&
      !found.reported`, sibling edge **recomputed** for `found` (the halves may
      be different letters). Preserve the 4-corner winding — do not sort.
- [x] 6.6 `penroseChooseRandom` (weights 63245986 / 39088169, verbatim), the
      draw order `startingTile → startVertex → orientation`, and the lazy
      `randomNew("dummy")` fallback.
- [x] 6.7 Keep the no-op-callback BFS in `randomise` — it is **not** dead code;
      it grows the prototype to the depth the desc records.
- [x] 6.8 Desc round-trip; make `validParents` total rather than relying on
      call-order; length guard; **reject a `'G'` desc with an explicit legacy
      error** (design D9).
- [x] 6.9 `gridNewPenroseP2Kite` / `P3Thick` — preserve the x/y transpose *and*
      the `api_size` unit crossing verbatim; `nTimesRootK(·, 5)`, parts scaled
      separately; `Math.trunc` recentring. Differential green for both penrose
      types, parts A and B.

## 7. Behavioural tests

- [x] 7.1 Tier-1 per aperiodic tiling: incidence completeness, determinism
      across two builds from the same desc, no fractional dot coordinates.
- [x] 7.2 **Structural (`Object.is`) comparison, not `===`**, on dot coordinates
      — change 1's addendum shows negative zero is invisible to every other
      check (design D8).
- [x] 7.3 Euler characteristic per tiling after trimming.
- [x] 7.4 Round-trip property: `gridNewDesc` → `gridValidateDesc` accepts →
      `gridNew` builds, for many seeds per type.
- [x] 7.5 Desc rejection: malformed, empty, 1-char (the underflow case), bad
      letters, and `'G'`.
- [x] 7.6 Confirm **the 14 periodic tilings and Pearl stay green** — this
      change's regression bar.

## 8. Close out

- [x] 8.1 Full gate green (`tsc -b --noEmit` → biome → `vitest run` →
      `vite build`).
- [x] 8.2 `openspec validate add-aperiodic-tilings --strict`.
- [x] 8.3 Update `docs/porting/game-port-playbook.md` §2.1 — `grid.ts` is
      complete at all 18 tilings; record what remains for change 3.
- [x] 8.4 Write `NEXT-STEPS.md` for `add-loopy-ts-port`, carrying forward what
      this change surfaced (change 1's handoff is the model, and it worked).
- [x] 8.5 Owner acceptance, then commit (port + archive together). **Accepted
      2026-07-20 on the same explicit basis as change 1: there is nothing to
      acceptance-test, because no game renders an aperiodic tiling until Loopy
      lands. Assurance is the index-exact C differential (23 fixtures, 231
      assertions over both RNG fidelity and geometry) plus the gate — not a
      human driving it. The first real acceptance test of this code is Loopy.**

Note: `puzzles/{grid,penrose,penrose-legacy,hat,spectre}.c` and `grid-trace.c`
are all **retained** at the end of this change — `grid.c` is still Loopy's
dependency and the harness is still needed. They go in change 3's stage 2.
