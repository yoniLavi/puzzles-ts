## ADDED Requirements

### Requirement: The puzzle board sizes to fit on load without a manual resize

The puzzle view SHALL size its canvas to fill the available space as soon as a game is loaded,
**without** requiring a subsequent window/element resize to correct it. The canvas-sizing
lifecycle SHALL account for the asynchronous worker canvas attach: because the host element is
`flex: 1` and its box does not change after first layout, the `ResizeObserver` alone does not
re-fire once the canvas attaches, so the view SHALL recompute the size when the canvas becomes
ready (and/or observe the element whose box actually settles late), rather than relying solely
on the single first measurement.

The recompute SHALL be **idempotent**: once the board is correctly sized, a further size
recompute with no layout change SHALL report no change and SHALL NOT trigger a resize loop.
Existing behaviour SHALL be preserved — a real window/element resize still resizes the board,
and the `maxScale` clamp still bounds it.

#### Scenario: A freshly-loaded board fills its space with no synthetic resize

- **WHEN** a game is loaded into the puzzle view at a viewport large enough for the board to
  exceed its first, pre-settle measurement
- **THEN** the board reaches its correct fitted size on its own, without any window/element
  resize event being dispatched

#### Scenario: A full page reload leaves the board full-size

- **WHEN** the page reloads (e.g. a dev-time component edit, which full-reloads rather than
  hot-swaps) and the game re-renders
- **THEN** the board is at its correct fitted size, not stuck small awaiting a manual resize

#### Scenario: Correcting the size does not loop

- **WHEN** the board has been sized correctly and a size recompute runs again with no layout
  change
- **THEN** the recompute reports no change and no further resize/redraw is triggered
