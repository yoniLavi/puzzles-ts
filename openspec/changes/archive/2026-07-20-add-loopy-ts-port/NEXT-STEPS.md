# After Loopy — the collection is fully TS, and the C engine is now retirable

`add-loopy-ts-port` was the last game. **Every `puzzle(...)` in
`puzzles/CMakeLists.txt` now carries `TS_PORTED`** (only `nullgame`, the
built-in placeholder, does not — it is not a game). No game is served by WASM
any more.

This note hands off to the two changes that remain.

## Change: `retire-c-engine`

This was deliberately kept separate from the per-game ports (proposal, "Impact")
because it is an architectural change, not a game port. It removes the C engine
*machinery* now that nothing consumes it as a runtime:

- **The orphaned leaf sources still compiled into `common`/`core_obj`.** After
  Loopy, the ones with no remaining consumer are `tree234.c` and `latin.c`
  (`latin.c` uses `tree234.c`; nothing else uses either — every latin-family
  game is ported). `matching.c` is a core source *and* an auxiliary program;
  check it before dropping. **`tree234.c` was left in place by
  `add-loopy-ts-port` on purpose** — its task 9.2 named it for deletion, but
  `latin.c` still uses it and `latin.c` is your problem, not Loopy's, so
  deleting it there would have broken the core build. Retire the `latin.c` +
  `tree234.c` pair together here.
- **`webapp.cpp`** — the Embind adapter between the C games and the TS worker.
  With no C game it has nothing to adapt.
- **The Emscripten build** — `scripts/build-emcc.sh`, `webapp.cmake`, the whole
  `build:wasm` path, and the `src/assets/puzzles/*.wasm` outputs. Note the *app*
  still needs `catalog.json` and the manual HTML that `build:wasm` currently
  generates; whatever replaces the build must keep producing those, or move
  their generation out of the Emscripten path first.
- **The worker's WASM path** — `WorkerPuzzle`, the `createTsEngine` dispatch
  seam's C branch, `assertWasmBridgesCoherent`, and the `USE_TS_LEAVES` /
  `VITE_USE_TS_LEAVES` umbrella + all per-module `USE_TS_*` flags. These exist
  only to gate C-internal leaf bridges that no longer have a C side.
- **Re-evaluate whether the Web Worker survives at all** (flagged in the
  `ts-migration` spec). It exists for heavy WASM; pure-TS games may not need the
  thread. This is the natural moment to decide.

Sizing note: this is a *large* deletion but a mechanical one — the risk is in
the build wiring (catalog/manual generation, the coherence check, the worker
dispatch), not in logic. Do it with the app running so a broken asset path
surfaces immediately.

## Blocker on `divvy.c` — read before deleting leaves

`divvy.c` is **not** orphaned and must survive `retire-c-engine`: the unfinished,
non-catalogued `separate` puzzle (`puzzles/unfinished/`? — verify its location)
is its last C consumer. The owner wants to take `separate` on soon (either drop
it, or port it reusing Solo's `divvy.ts`). Until then, `divvy.c` stays. See
[[project-divvy-separate-blocker]] in memory. Do not sweep it up with the other
leaves.

## A real bug found during Loopy dev-verification — worth its own small change

`add-loopy-ts-port` design F8: the TS engine's `TsWorkerPuzzle` silently drops
any repaint requested before the palette is installed, so a board can fail to
appear. **One cause was fixed** (the first palette install now repaints —
`worker-adapter.ts`, with a regression test in `worker-adapter.test.ts`). **A
second, independent cause remains**: a non-square board reached by deep link
(`/loopy?type=5x4t9dh`, `?type=5x4t14dh`) stays blank — the board *is*
generated (opening any menu paints it), so a repaint is being dropped on some
resize/first-frame path specific to `w ≠ h`. It reproduces on Pearl too and not
on C/WASM games, so it is an engine bug, not a Loopy one — but it is user-facing
and predates this change. A candidate fix (repaint inside `resizeDrawing`) was
tried and reverted because it did not fix the symptom; the mechanism is still
unidentified. Reproduce with the app running, instrument the
`size → canvasCleared → redraw` sequence for a non-square board, and compare
against a square one.

## What this change leaves in the tree (all fine, all owned elsewhere)

- `puzzles/tree234.c` + `tree234.h` (→ `retire-c-engine`, with `latin.c`)
- `puzzles/latin.c` + `latin.h` (→ `retire-c-engine`)
- `puzzles/divvy.c` (→ blocked on `separate`, see above)
- `puzzles/webapp.cpp`, the Emscripten build, the worker WASM path,
  `USE_TS_LEAVES` (→ `retire-c-engine`)
- `puzzles/LICENCE` (stays permanently — MIT obligation)
