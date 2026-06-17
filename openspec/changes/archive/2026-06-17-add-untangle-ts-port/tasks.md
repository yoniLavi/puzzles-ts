# Tasks — Untangle TS port

Depends on `improve-port-tooling` landing first (the `describeDescDifferential`
helper + enriched scaffolder). Start with `scripts/new-game-port.sh untangle`.

## 0. Owner pre-decision
- [x] 0.1 Owner chose (2026-06-17) to **build the real engine prefs hook** (not
  fixed defaults). Shipped defaults via `newUi`: crossed-edge highlight ON, snap
  OFF, vertex-style Circles; all three togglable in the existing prefs form.

## 0b. Engine preferences hook (ts-engine delta — design D10)
- [x] 0b.1 `Game` interface: optional declarative `prefs?: GamePref<Ui>[]`
  (discriminated `boolean`/`choices`, `get`/`set` over `Ui`).
- [x] 0b.2 `EngineCore` + `Midend`: `getPreferencesConfig`/`getPreferences`/
  `setPreferences`; `prefValues` retention + `applyPrefs()` after each `newUi` in
  `startFrom`; repaint on `setPreferences` (drops the drawstate so a pref-only
  change isn't skipped by a game's render early-out — found in dev-verify).
- [x] 0b.3 `TsWorkerPuzzle`: delegate the three methods to the engine (replace
  stubs); leave binary save/load prefs no-op.
- [x] 0b.4 Tier-1 midend tests (`midend-prefs.test.ts`): prefs config shape,
  get/set round-trip, value coercion (choice index, boolean), survives a new game,
  empty for a no-prefs game, repaints on change.

## 0c. Engine aux-for-Solve retention (ts-engine delta — found in dev-verify)
- [x] 0c.1 `Midend` retains `aux` from `newDesc` (via `startFrom(desc, aux)`) on
  `newGame`/`#seed`; clears it for `:desc` and loaded saves; passes it to
  `game.solve(orig, curr, aux)`. (Untangle's Solve is the first aux-dependent
  solver; without this it was a silent no-op.)
- [x] 0c.2 Tests: midend Solve solves a generated Untangle board (status
  `solved-with-help`) and refuses on a loaded game.

## 1. State + crossing primitive (`state.ts`)
- [x] 1.1 `RationalPoint {x,y,d}`, `Edge {a,b}` (a<b), `UntangleParams {n}`,
  immutable `UntangleState` (shared frozen `edges` + `edgeSet:Set<number>` packed
  `a*n+b`, per-move `pts`, derived `crosses`/`completed`, `usedSolve`).
- [x] 1.2 `cross(a1,a2,b1,b2): boolean` — exact integer segment intersection
  (BigInt accumulator only), incl. collinear-overlap + endpoint-on-segment (D4).
- [x] 1.3 `findCrossings(pts, edges): { crosses, completed }` over non-adjacent edge
  pairs; `cloneState` (copies only `pts`); `decodeGame(desc, n)` parsing `a-b,...`.
- [x] 1.4 Tier-1 tests: `cross()` hand-built cases (crossing / collinear-overlap /
  endpoint-on / parallel-disjoint); `findCrossings`/`completed`.

## 2. Generator (`generator.ts`)
- [x] 2.1 Phase A: scatter on shuffled `COORDLIMIT(n)²` grid; greedy
  lowest-degree-first non-crossing edge add, degree cap 4, planar by construction (D3).
- [x] 2.2 Phase B: `make_circle` + permutation re-roll until ≥1 crossing.
- [x] 2.3 `encodeGraph` (edges-only sorted desc) + `aux` (solved layout) emission;
  `newDesc(params, rng): { desc, aux }`.
- [x] 2.4 Tier-1: generated graphs planar, all degree ≤4, ≥1 starting crossing.

## 3. Game glue (`index.ts`)
- [x] 3.1 Params/presets/validate/encode/decode (`{n}`); `newState` (build shared
  edges from desc + initial circle layout); `newUi`; `changedState` (clear
  drag/cursor on transition).
- [x] 3.2 `interpretMove`: mouse drag (down/drag/release, off-window cancel),
  keyboard quadrant nav + select-to-drag + arrow-nudge + Tab-cycle (D5). Return
  `UI_UPDATE` for in-progress drag / no-op, the `place` Move on commit.
- [x] 3.3 `executeMove` (apply points, recompute crossings, throw on malformed);
  `status` (solved iff `completed`).
- [x] 3.4 `solve` (decode `aux`, 8-symmetry closest-fit, all-vertex `solving:true`
  move); `animLength`/`flashLength`. NO `hint`/`findMistakes` (crossings are the
  mistakes). `canFormatAsText=false` (editor-only text format excluded).
- [x] 3.5 `colours`, `computeSize`, `setTileSize`, the `prefs` spec
  (snap-to-grid/show-crossed-edges/vertex-style, defaults via `newUi`),
  `registerGame`.
- [x] 3.6 Tier-1: drag `executeMove` round-trip; 8-symmetry solve lands
  crossing-free; **save→moves→load reproduces `pts` exactly** (the
  move-log-replaces-supersede guarantee).

## 4. Render (`render.ts`)
- [x] 4.1 `DrawState` (tilesize, last bg/drag/cursor, `x[]/y[]`); recompute
  positions → changed-anything early-out → full repaint (D6).
- [x] 4.2 Edges (red when crossed + highlight pref), vertices z-ordered with
  drag/cursor/neighbour colours, drag live-follow from `ui.newpoint`, `mix`
  interpolation, win flash.
- [x] 4.3 Tier-2.5 `renderScenario`: assert edge/point/crossed-red/drag-highlight
  ops + snapshot a tangled frame and a mid-drag frame.

## 5. Differential
- [x] 5.1 Transient `puzzles/auxiliary/untangle-trace.c` (`#include "../untangle.c"`)
  emitting `{seed, n, desc}` JSON; build pure-C (`-DUSE_TS_RANDOM=0`).
- [x] 5.2 Gated `untangle-differential.test.ts` via `describeDescDifferential`
  (desc byte-match) + every board planar+solvable; frozen fixture committed.

## 6. Parity gate — stage 1 (register + dev-verify)
- [x] 6.1 Register in `src/native/games/index.ts` + `ts-ported-ids.ts`.
- [x] 6.2 `npm run dev` + Playwright smoke: renders tangled graph + TS badge;
  drag a vertex (live-follow, crossings recolour), drop, keyboard nav + select-drag,
  Solve animates to crossing-free + win flash; 0 console errors.
- [x] 6.3 Full gate green (tsc/biome/vitest/vite build).

## 7. Parity gate — stage 2 (owner acceptance → C deletion)
- [x] 7.1 Owner accepted 2026-06-17 (mouse drag, Solve, prefs, border/clamp/colour
  touchups all dev-verified; owner: "Fabulous … please commit").
- [x] 7.2 Added `TS_PORTED` to the untangle `puzzle(...)` in `puzzles/CMakeLists.txt`
  (and removed the dead `grapheditor` GTK editor line); deleted `puzzles/untangle.c`
  + `puzzles/auxiliary/untangle-trace.c` + its CMakeLists line; clean
  `npm run build:wasm` (verify no untangle.wasm, untangle still in catalog).
- [x] 7.3 Icon PNGs — Untangle is an existing catalog game; `untangle-{64,128}d8.png`
  already committed (asset-integrity test green). No capture needed.
- [x] 7.4 Corrected the AGENTS.md long-tail note (Untangle is move-log-handled, not a
  supersede_desc game).
- [ ] 7.5 `openspec validate --strict`; archive.

## 8. Validation
- [ ] 8.1 `npm run gate` green.
- [ ] 8.2 `openspec validate add-untangle-ts-port --strict` passes.
