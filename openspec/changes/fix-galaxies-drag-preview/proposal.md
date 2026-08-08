# Change: Galaxies drag preview — discrete snapped target, no stale paint

## Why

Owner-reported 2026-08-08, with a screenshot: dragging an association
arrow smeared dozens of stale arrow frames across the board, including
ink *below* the board that nothing could ever erase. The cause is
structural, not a missed repaint: the drag arrows were drawn at raw
pixel positions outside the per-tile cache, only the single tile under
the pointer was invalidated (never the tiles the arrow spanned, never
the mirror arrow's tiles), and the border region repaints only on
first-draw. The breakage mattered beyond aesthetics — it made the
association arrow, the game's one cell↔dot notation, look like a bug
rather than a tool, which is what prompted the (now withdrawn)
`add-galaxies-association-marks` proposal for a *second* notation; see
"Downstream" below.

## What Changes

- The drag preview becomes **discrete** (owner preference, stated
  2026-08-08, after the Inertia swipe-aim model): the pointer's
  position snaps to a drop-target tile, and the preview shows exactly
  the pair a release would commit — a cursor-colour arrow in the
  target tile pointing at the dot, a target outline on that tile, and
  the same ghost arrow in its 180° partner. An uncommittable target
  shows nothing (Inertia's absence-is-the-feedback idiom).
- The preview folds into the per-tile cache (a `preview` sidecar
  plane), so every pixel it paints is clipped to a tile and erased by
  that tile's own repaint; the full-board `drawUpdate` per pointer
  move is gone, and a pointer move within one tile repaints nothing.
- Release commits the **previewed** target, not the raw release pixel
  (they differ only on touch lift-jitter), and a release where nothing
  can commit no longer emits an assoc op that `executeMove` would
  no-op — the empty-undo-entry defect class from `audit-author-known-issues`
  (ABCD).
- The shared legality predicate (`okToAddAssocWithOpposite`) moves to
  a new `moves.ts` (the `docs/games/rendering.md` § "A
  simulated-release preview lives in `moves.ts`" split), imported by
  both the move path and the renderer, so preview and commit cannot
  drift.

## Impact

- Affected specs: `galaxies` (MODIFIED: the rendering requirement —
  which also mis-stated tile fills as "coloured by association" when
  they come from the completion check — and the play requirement's
  drag scenario, which described accretion and a hold-toggle release
  that the implementation has never had).
- Affected code: `src/games/galaxies/{index,render,moves}.ts`,
  `galaxies.test.ts`.
- Downstream: **`add-galaxies-association-marks` is withdrawn** (owner
  decision 2026-08-08: "fix this existing functionality instead of
  building a new one"). Its premise did not survive review against the
  code — committed associations do not participate in completion
  (`checkComplete` never reads `F_TILE_ASSOC`) and do not colour tiles
  (fills come from the completion check), so they already are the
  consequence-free cell↔dot notation the marks proposed to add; the
  mark differed from the arrow only in paint weight and in not
  recording the 180° partner. `add-galaxies-hint` is retargeted onto
  committed-association vocabulary in the same session.
