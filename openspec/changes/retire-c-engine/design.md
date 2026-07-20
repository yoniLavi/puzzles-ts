# Design — retire-c-engine

## Context

The migration is functionally complete: every catalogued game runs on the TS
engine (`src/native/engine/` + `src/native/games/`), and the runtime never
enters the C/WASM path. What remains is *removing* the C engine and its scaffold
— a large but mechanical teardown whose only real risk is that two things the
app still needs are currently produced by the very build being removed.

This is deliberately its own change (not folded into any game port) because it
is architectural: the decisions below are about build topology and the worker,
not about any game.

## D1 — What is genuinely orphaned, verified against the build (not assumed)

After Loopy, `add-loopy-ts-port` already dropped the Loopy grid subtree
(grid/loopgen/penrose/hat/spectre) but **kept `tree234.c` on purpose**, because
`latin.c` still uses it and `latin.c` was out of that change's scope. Both are
now runtime-dead and retire here, together.

Do not delete from a remembered list — **re-derive the orphan set against the
current build** (`grep` includers, check the `core_obj`/`common` source lists,
build after each removal). The expected set: `tree234.c`, `latin.c`, `combi.c`,
`dsf.c`, `findloop.c`, `sort.c`, `midend.c`, `drawing.c`, `misc.c`, `malloc.c`,
`tdq.c`, `ps.c`, `draw-poly.c`, `version.c`, the random stack, the null
frontends, and `webapp.cpp`. Two traps:

- **`matching.c` is both a core source and an auxiliary program** — check both
  roles before removing it.
- **`divvy.c` is already gone** (deleted when Separate shipped, 2026-07-04). The
  old "separate blocker" note is stale; verify, don't re-introduce it.

## D2 — Catalog and manual generation must outlive the Emscripten build (the real risk)

`scripts/build-emcc.sh` copies `catalog.json` out of the cmake build and runs
halibut over `puzzles.but` to produce the in-app manual HTML. The app depends on
**both**, and both currently ride on the toolchain being removed. So the
teardown is not pure deletion:

- **`catalog.json`** — today unioned from the wasm-built games plus the
  `ts_ported_names` list. With no wasm games it is *entirely* the TS list, so it
  can be generated directly from the TS catalog metadata (the same data
  `ts-ported-ids.ts` and the per-game registrations already hold) by a small
  script or vite plugin, with no cmake.
- **The manual** — halibut over `puzzles.but` is independent of Emscripten
  (halibut is its own brew tool). Keep the halibut invocation, drop only the
  wasm compilation around it. `puzzles.but` and `/puzzles/html` stay.

**Sequence the removal so these two are re-homed first**, then remove the
Emscripten build. Verify by building the app and loading a game + the help pages
with no `build:wasm` having run.

## D3 — Decide the Web Worker's fate

The worker exists because WASM was heavy and blocked the main thread. Pure-TS
games may not need it. Options:

- **Keep it** — lowest-risk; the Comlink surface and `TsWorkerPuzzle` already
  run there, and heavy generators (Loopy Hard, Solo) still benefit from being
  off the main thread. **Recommended for this change**: retiring the C engine
  and moving the game off-thread are separable concerns, and doing both at once
  widens the blast radius.
- **Remove it** — simplifies the app but must prove no generator janks the main
  thread. Defer to a follow-up if wanted.

Record the choice; default to keeping the worker so this change stays a *removal
of dead C*, not a threading rearchitecture.

## D4 — The worker dispatch collapses to one implementation

`src/puzzle/worker.ts` currently constructs either `WorkerPuzzle` (C/WASM, line
107) or the TS engine via `createTsEngine` (line 506), behind the shared
`PuzzleEngineSurface`. With no C games, `WorkerPuzzle`, `assertWasmBridgesCoherent`
and the WASM-instantiation path are all dead. The seam collapses to always
constructing the TS engine. The **shared `PuzzleEngineSurface` interface can
stay** (it is harmless and keeps the app-facing type stable), or be inlined — a
judgement call at implementation time; keeping it is lower-risk.

## Risks

- **Build wiring (D2)** is the whole risk. A missed catalog/manual dependency
  makes the app un-buildable or help-less. Mitigate by re-homing generation
  first and building the app with no wasm present before deleting the toolchain.
- **Over-deletion (D1)** — deleting a `.c` a remaining unit still links breaks
  the (now much smaller) build; re-derive the orphan set, build incrementally.
- **Scope creep (D3)** — folding a worker-removal or a threading change in here
  widens a mechanical teardown into a rearchitecture. Keep them separate.
