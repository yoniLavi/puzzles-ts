# Tasks — Untangle TS port

Depends on `improve-port-tooling` landing first (the `describeDescDifferential`
helper + enriched scaffolder). Start with `scripts/new-game-port.sh untangle`.

## 0. Owner pre-decision
- [ ] 0.1 Confirm the prefs defaults with the owner (design D7): crossed-edge
  highlight ON (doubles as mistake feedback), snap OFF, vertex-numbers OFF, no prefs
  UI. Adjust before coding if the owner wants different.

## 1. State + crossing primitive (`state.ts`)
- [ ] 1.1 `RationalPoint {x,y,d}`, `Edge {a,b}` (a<b), `UntangleParams {n}`,
  immutable `UntangleState` (shared frozen `edges` + `edgeSet:Set<number>` packed
  `a*n+b`, per-move `pts`, derived `crosses`/`completed`, `usedSolve`).
- [ ] 1.2 `cross(a1,a2,b1,b2): boolean` — exact integer segment intersection
  (BigInt accumulator only), incl. collinear-overlap + endpoint-on-segment (D4).
- [ ] 1.3 `findCrossings(pts, edges): { crosses, completed }` over non-adjacent edge
  pairs; `cloneState` (copies only `pts`); `decodeGame(desc, n)` parsing `a-b,...`.
- [ ] 1.4 Tier-1 tests: `cross()` hand-built cases (crossing / collinear-overlap /
  endpoint-on / parallel-disjoint); `findCrossings`/`completed`.

## 2. Generator (`generator.ts`)
- [ ] 2.1 Phase A: scatter on shuffled `COORDLIMIT(n)²` grid; greedy
  lowest-degree-first non-crossing edge add, degree cap 4, planar by construction (D3).
- [ ] 2.2 Phase B: `make_circle` + permutation re-roll until ≥1 crossing.
- [ ] 2.3 `encodeGraph` (edges-only sorted desc) + `aux` (solved layout) emission;
  `newDesc(params, rng): { desc, aux }`.
- [ ] 2.4 Tier-1: generated graphs planar, all degree ≤4, ≥1 starting crossing.

## 3. Game glue (`index.ts`)
- [ ] 3.1 Params/presets/validate/encode/decode (`{n}`); `newState` (build shared
  edges from desc + initial circle layout); `newUi`; `changedState` (clear
  drag/cursor on transition).
- [ ] 3.2 `interpretMove`: mouse drag (down/drag/release, off-window cancel),
  keyboard quadrant nav + select-to-drag + arrow-nudge + Tab-cycle (D5). Return
  `UI_UPDATE` for in-progress drag / no-op, the `place` Move on commit.
- [ ] 3.3 `executeMove` (apply points, recompute crossings, throw on malformed);
  `status` (solved iff `completed`).
- [ ] 3.4 `solve` (decode `aux`, 8-symmetry closest-fit, all-vertex `solving:true`
  move); `animLength`/`flashLength`. NO `hint`/`findMistakes` (crossings are the
  mistakes). `canFormatAsText=false` (editor-only text format excluded).
- [ ] 3.5 `colours`, `computeSize`, `setTileSize`, `registerGame`.
- [ ] 3.6 Tier-1: drag `executeMove` round-trip; 8-symmetry solve lands
  crossing-free; **save→moves→load reproduces `pts` exactly** (the
  move-log-replaces-supersede guarantee).

## 4. Render (`render.ts`)
- [ ] 4.1 `DrawState` (tilesize, last bg/drag/cursor, `x[]/y[]`); recompute
  positions → changed-anything early-out → full repaint (D6).
- [ ] 4.2 Edges (red when crossed + highlight pref), vertices z-ordered with
  drag/cursor/neighbour colours, drag live-follow from `ui.newpoint`, `mix`
  interpolation, win flash.
- [ ] 4.3 Tier-2.5 `renderScenario`: assert edge/point/crossed-red/drag-highlight
  ops + snapshot a tangled frame and a mid-drag frame.

## 5. Differential
- [ ] 5.1 Transient `puzzles/auxiliary/untangle-trace.c` (`#include "../untangle.c"`)
  emitting `{seed, n, desc}` JSON; build pure-C (`-DUSE_TS_RANDOM=0`).
- [ ] 5.2 Gated `untangle-differential.test.ts` via `describeDescDifferential`
  (desc byte-match) + every board planar+solvable; frozen fixture committed.

## 6. Parity gate — stage 1 (register + dev-verify)
- [ ] 6.1 Register in `src/native/games/index.ts` + `ts-ported-ids.ts`.
- [ ] 6.2 `npm run dev` + Playwright smoke: renders tangled graph + TS badge;
  drag a vertex (live-follow, crossings recolour), drop, keyboard nav + select-drag,
  Solve animates to crossing-free + win flash; 0 console errors.
- [ ] 6.3 Full gate green (tsc/biome/vitest/vite build).

## 7. Parity gate — stage 2 (owner acceptance → C deletion)
- [ ] 7.1 Owner acceptance across presets (6/10/15/20/25), mouse + keyboard + touch.
- [ ] 7.2 Add `TS_PORTED` to the untangle `puzzle(...)` in `puzzles/CMakeLists.txt`;
  delete `puzzles/untangle.c` + `puzzles/auxiliary/untangle-trace.c` + its
  CMakeLists line; clean `npm run build:wasm` (verify no untangle.wasm, untangle
  still in catalog).
- [ ] 7.3 Two icon PNGs via `?screenshot` capture.
- [ ] 7.4 Correct the AGENTS.md long-tail note (Untangle is move-log-handled, not a
  supersede_desc game).
- [ ] 7.5 `openspec validate --strict`; archive.

## 8. Validation
- [ ] 8.1 `npm run gate` green.
- [ ] 8.2 `openspec validate add-untangle-ts-port --strict` passes.
