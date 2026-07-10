# Change: Fix the puzzle-canvas sizing race (board loads too small)

## Why

The puzzle board intermittently renders **stuck at a too-small size** on load, and only a
manual browser-window resize snaps it to the correct size. In development it shows up
constantly: editing a Lit component triggers a **full page reload** (Lit custom elements
can't hot-swap — confirmed `page reload …` in the Vite log, not an HMR update), so every
"make a change" re-runs the load race and the board shrinks. It surfaced during owner review
of the reference-panel work but is **pre-existing and affects every game** — reproduced on a
plain first load with nothing else on screen.

## What Changes

- Make the puzzle canvas **reliably fill its available space on load** without needing a
  manual window resize — i.e. recompute the size once the async worker has attached the
  canvas and the layout has settled, rather than trusting the single first (racy) measurement.
- Keep it a pure sizing-lifecycle fix: no change to game rendering, the `size()` contract, or
  the worker protocol beyond calling the existing recompute at the right moment.
- Add a regression guard (an in-process check, or a Playwright smoke) that a freshly-loaded
  board reaches its expected size **without** a synthetic resize event.

## Impact

- Affected specs: `canvas-sizing` (ADDED: the board sizes correctly on load).
- Affected code: `src/puzzle/puzzle-view.ts` (the `ResizeController` + `resize()` +
  `getAvailableCanvasSize()` lifecycle; possibly `puzzle-view-interactive.ts`,
  `createCanvas`). No engine/worker-protocol change expected.
- Risk: core sizing code shared by **all** games — the fix must not introduce a resize loop or
  regress the existing resize-on-window-change / maxScale behaviour. This is why it is its own
  change, not bundled into a feature.
