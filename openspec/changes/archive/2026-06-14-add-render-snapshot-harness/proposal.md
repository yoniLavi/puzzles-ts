# Change: In-process render snapshot + scenario harness

## Why

A core reason for the TS port was to make **rendering** testable without a
browser — and without a human in the loop. We're halfway there: tier-2 tests
drive `redraw` against a *recording* `GameDrawing` double and assert draw
*calls*. But the doubles are ad-hoc per test, capture only partial args, and
there's no shared way to reach a specific production frame (post-N-moves, hint
shown, mistakes shown). So verifying a real frame — e.g. the Palisade
`equivalentEdges` hint (action edge blue, sibling orange, region shaded) — still
meant driving the live app, which is slow and flaky: OffscreenCanvas blocks
`getImageData`, right-click marks don't register in the Playwright harness, and
stopping on a mid-plan hint step needs Auto-Hint timing. None of that friction
is inherent to the rendering; it's all browser-harness friction the port was
meant to remove. The fix is in-process, agent-checkable rendering: precise
assertions + regression snapshots, no eyeballs required.

## What Changes

- Add a **shared, deterministic recording `GameDrawing`** that captures every
  draw call with all arguments (rect/line/text/polygon/circle + clip/colour)
  into a normalised, stable record — the reusable basis for both targeted
  assertions and snapshots.
- Add a **`Midend`-backed scenario driver**: given a game, params, a
  description, an optional move list, and flags to show the active hint or
  mistakes, drive a real `Midend` to the target frame (replaying `Move`s
  directly — no pointer events) and return the captured render. This removes the
  exact friction from the hint session: no worker/OffscreenCanvas, no
  right-click-mark problem, no timing to stop on a mid-plan step.
- Verify via **`toMatchSnapshot`** (text, deterministic — a render regression is
  a snapshot diff the agent reviews) **plus targeted assertions** on specific
  ops (e.g. "a `COL_HINT_SIBLING` rect on the sibling edge"). No human eyeball,
  no committed image.
- Optional: a thin **SVG serialiser** of the same record (a faithful,
  z-ordered view) for the rare case pixels need inspecting — not part of the
  required test flow.
- Seed it: convert the Palisade hint cases I just verified by hand (notably the
  `equivalentEdges` frame) into snapshot + assertion tests, proving the harness
  reaches that exact state in-process.

## Impact

- Affected specs: `repo-layout` (ADDED requirement: in-process render
  snapshot/scenario harness, complementing the existing three tiers).
- Affected code: new `src/native/engine/testing/{recording-drawing,render-scenario}.ts`
  (+ optional `svg-drawing.ts`) and seed tests (Palisade hint frames). No
  runtime/bundle impact — dev/test-only.
- Reduces (does not remove) Playwright's role: it stays for genuine
  full-integration and real-canvas smoke; per-frame visual correctness moves
  in-process and agent-checkable.
