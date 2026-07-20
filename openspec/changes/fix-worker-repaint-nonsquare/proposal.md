# fix-worker-repaint-nonsquare

## Why

A board can fail to appear on first load. `TsWorkerPuzzle.redraw()` is gated on
`paletteReady` and **silently drops** any repaint requested before the palette
is installed; the midend requests one on the initial game transition, which is a
race the game loses whenever generation is fast. Deep-linking to a game (a
`?type=` URL, or an in-app "new game" whose params differ) can leave the canvas
blank until some unrelated event (opening a menu, a window resize) happens to
force a repaint.

This was found during Loopy dev-verification (`add-loopy-ts-port` design F8). It
is an **engine bug, not a game bug** — it reproduces on Pearl (shipped since
2026-07) and never on a C/WASM game, which pins it to the TS worker adapter. It
predates Loopy and affects every TS-ported game.

**Half of it is already fixed** (in the Loopy commit): the first palette install
now repaints, with a regression test in `worker-adapter.test.ts`. But a
**second, independent cause remains**: a *non-square* board reached by deep link
(`/loopy?type=5x4t9dh`, `?type=5x4t14dh`) still stays blank, while the same
params chosen from the Type menu paint immediately. The board *is* generated —
opening any menu paints it — so a repaint is being dropped on a resize/first-frame
path specific to `w ≠ h`. The mechanism is not yet identified; a candidate fix
(repaint inside `resizeDrawing`) was tried and reverted because it did not fix
the symptom.

This change finds and fixes the second cause, and hardens the invariant — "the
first frame always paints, regardless of the palette-install / resize ordering"
— as a spec requirement and a regression test, so this whole class cannot
silently return.

## What Changes

- **Diagnose the second cause.** Instrument the `size → canvasCleared → redraw`
  sequence for a *non-square* board reached by deep link and compare against a
  square one and against the in-app menu path (which works). The difference is
  almost certainly an ordering/interleaving of `Midend.size`,
  `resizeDrawing`/`canvasCleared`, and the first `redraw` that leaves the last
  canvas-touching operation a clear rather than a paint — specific to a board
  whose aspect ratio differs from the layout slot (so it gets a second resize
  after the first paint).
- **Fix it** at the adapter/midend seam, without reintroducing framework
  overpaint (the "engine emits no pixels of its own" invariant stays).
- **Regression test** the deep-link, non-square, fast-generation case in-process
  (extend `worker-adapter.test.ts`), driving the real ordering so a dropped
  first-frame paint fails the suite.
- **Spec the invariant** so "the first frame paints regardless of ordering"
  becomes a stated `ts-engine` requirement, not folklore.

## Impact

- Affected specs: `ts-engine` (a new requirement hardening first-frame repaint).
- Affected code: `src/native/engine/worker-adapter.ts`, possibly `midend.ts`'s
  `size`/`canvasCleared` sequencing, and `worker-adapter.test.ts`.
- Small, focused, and user-visible (blank boards on deep links). Low risk if the
  fix stays at the adapter seam and does not reintroduce engine-emitted pixels.
