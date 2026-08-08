# Design

## Context

The shipped drag rendering drew two pixel-following arrows (pointer +
mirror) after the tile loop, unclipped, invalidated one tile, and
`drawUpdate`-ed the whole canvas per pointer move. Owner screenshot
2026-08-08 shows the consequence: arrow trails across every crossed
tile, a fan of stale mirror frames, and a trail below the board that
survives until the draw state is rebuilt.

## Decisions

- **D1 — Discrete snapped preview, not a repaired continuous one.**
  Owner preference (2026-08-08), modelled on Inertia's swipe-aim: `Ui`
  carries a snapped drop target (`targetX/targetY`, raw — may be
  off-grid), recomputed per event; `interpretMove` returns `null` when
  the target tile is unchanged, `UI_UPDATE` when it moves. This is
  also what makes the bug structurally unreproducible: a snapped arrow
  shares the committed arrow's geometry, so it fits inside its tile.
  A repaired continuous arrow (blitter save/restore, upstream's shape)
  was considered and declined: it keeps per-mousemove repaints and a
  sprite crossing tile boundaries for no player benefit over the
  snap — and the doctrine reserves blitters for exactly the sprites
  that cannot be cell-folded (`rendering.md` § "A cursor is usually a
  cache key, not a blitter"). Display divergence from upstream is in
  scope by standing policy (display code was never parity-bound).
- **D2 — Preview is a cache sidecar plane, not a key bit.** The Int32
  key is full (bits 0–11 flags, 12–29 dots, 30 mistake). A per-tile
  `preview` Int8Array (0 none / 1 mirror ghost / 2 target) joins
  `dx`/`dy` and `wrongEdges` in the cache-miss comparison, so a tile
  the preview leaves repaints clean by construction — the same
  mechanism that erases it also proves it (the tier-2 tests assert the
  repaint of the vacated pair).
- **D3 — One legality predicate, shared.** `okToAddAssocWithOpposite`
  (extracted to `moves.ts` with `add/removeAssocWithOpposite`) answers
  "would a release here commit?" for three callers: the renderer (show
  or hide the preview), `dropDrag` (emit the assoc op at all), and
  `executeMove` (via `addAssocWithOpposite`). Preview, release and
  state change cannot disagree. The renderer evaluates it against the
  current state every redraw with the `cols` it already computes, so a
  mid-drag undo cannot leave a stale promise. Side effect of the
  `dropDrag` tightening: no more history entries that change nothing.
- **D4 — Release commits the previewed target.** The stored snapped
  target, not the release pixel. They differ only when the pointer
  jumps between the last drag event and the release — touch
  lift-jitter — and what the player saw is what release should do.
  Press initialises the target from the press pixel, so the
  no-drag-events right-click path behaves exactly as before (a click
  on a vertex dot still associates its lower-right tile + mirror, the
  upstream quirk).
- **D5 — Preview colour is `COL_CURSOR`, target outline included.**
  A preview must not look like a commit (`rendering.md` § "A press
  preview must not look like a commit"); the cursor colour is the
  game's existing transient-UI colour and the arrow path already
  supported it. Both preview tiles share the one colour — release
  commits them together, so they share a fate (the hint bar's
  equivalent-moves rule, applied to a preview). The target
  additionally gets an inset outline ("showing the target too" —
  owner, 2026-08-08); the mirror ghost says what comes along.

## Verification

Tier-2 tests pin: paint lands only on the target pair, in
`COL_CURSOR`; moving the target repaints the vacated pair (the erase);
ending the drag leaves zero preview ops; every clip/drawUpdate during
a drag stays inside the board; an uncommittable target draws nothing;
release commits the previewed pair; a nothing-to-commit release
returns `UI_UPDATE`, not a move. Live-verified in Chromium
(playwright-cli): commit, sweep-across-board (the smear repro),
off-board release, re-drag-to-remove; console clean.

## Open Questions

None. (The `hold` op being unreachable from any input path was found
during the same review — it belongs to `audit-input-mode-parity`, not
here.)
