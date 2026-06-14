## Context

The `GameDrawing` interface (the long-stable upstream `drawing_api`, in TS) is
just an API: the production canvas `Drawing` implements it, and tier-2 tests
implement ad-hoc *recording* doubles over it. The friction I hit verifying the
Palisade hint was entirely browser-harness friction (OffscreenCanvas,
right-click events, mid-plan navigation), not rendering complexity. This is
**agentic development** — there is no human eyeballing screenshots — so the
target is an in-process render an *agent* can assert on and snapshot, reaching
the exact frame via the real `Midend`.

## Goals / Non-Goals

- Goals: (1) reach any production frame (post-N-moves, hint shown, mistakes
  shown) in-process via the real `Midend`, replaying `Move`s not pointer events;
  (2) capture the render deterministically; (3) verify via `toMatchSnapshot` +
  targeted op assertions, no human in the loop.
- Non-Goals: human eyeballing; committed images; pixel-exact parity with the
  browser canvas (font metrics differ — assert structure/colour/geometry, not
  antialiased glyphs); replacing Playwright for genuine integration/real-canvas
  smoke.

## Decisions

### D1 — Snapshot the captured draw record (text), via `toMatchSnapshot`

The primary artifact is a **normalised draw record**: an ordered list of
`{ op, ...args, colour }` entries the recording `GameDrawing` captures, with
colours resolved through the game's `colours(defaultBackground)` palette to a
stable label/`rgb()`. `expect(record).toMatchSnapshot()` gives a deterministic,
**text** snapshot — a render regression is a reviewable diff (an agent reviews
it; `vitest -u` re-baselines an intended change). Targeted assertions
(`record.some(o => o.op === 'rect' && o.colour === COL_HINT_SIBLING && …)` ) sit
alongside for the specific guarantees a snapshot alone wouldn't pin. Chosen over
committed `.svg`/`.png` because the **owner's call is agentic, no-eyeball**:
text snapshots are what an agent reviews and what `vitest` manages natively.

### D2 — Drive through the real `Midend`

The scenario driver builds a `Midend(game)`, `newGameFromId(params:desc)`,
replays a move list via the midend (so the hint/mistake/flash/animation
lifecycle is the real one), optionally calls `hint()` / `findMistakes()`, then
runs `redraw` against the recording drawing. Driving the real midend — not a
hand-built state — guarantees the captured frame is the one that ships. Reaching
a no-wall hint step (the thing that defeated the Playwright harness) is just
replaying its prefix `Move`s + `hint()`.

### D3 — Determinism

Fixed tile size (the game's `preferredTileSize`); integer-rounded coordinates;
colour values resolved to stable labels; draw-order element ordering; no
`Date`/`Math.random` (seeds passed in). A snapshot changes only when the render
changes — the point.

### D4 — Optional SVG serialiser (not required by the test flow)

A thin `toSvg(record)` can emit a z-ordered SVG (last-drawn-on-top, so occlusion
matches the canvas) for the rare case an agent or human wants to actually see
the composited frame. It is a convenience over the same record, not part of the
required assertion/snapshot path; the harness ships and is useful without it.

## Risks / Trade-offs

- Snapshot churn on intentional render changes → expected and healthy; the diff
  is reviewable and `vitest -u` re-baselines. Pair every snapshot with a few
  targeted assertions so a meaningful guarantee survives a careless `-u`.
- A flat op record shows draw *calls*, not the composited pixel result
  (occlusion) → targeted assertions name the op that matters; the optional SVG
  (D4) gives the composited view if ever needed.

## Migration Plan

Additive. Land the recording drawing + scenario driver + Palisade seed snapshots;
adopt for new render code going forward. Existing ad-hoc tier-2 doubles stay
valid; migrate them to the shared recorder opportunistically. No production or
build change.

## Open Questions

- ~~Golden storage (committed `.svg` vs `toMatchSnapshot`)~~ — **decided**:
  `toMatchSnapshot` (agentic, no-eyeball; owner's call).
