# canvas-sizing Specification

## Purpose
TBD - created by archiving change fix-canvas-sizing-race. Update Purpose after archive.

## Requirements

### Requirement: The puzzle board sizes to fit on load without a manual resize

The puzzle view SHALL size its canvas to fill the available space as soon as a game is loaded,
**without** requiring a subsequent window/element resize to correct it.

The available-size measurement SHALL NOT be derived from any chrome whose own size is a
function of the board size — that is a loop, and it settles on whatever value it started at.
In particular, the available board **width** SHALL be measured from the board's own padded
wrapper, NOT from a container that may also hold something sized from the board. Because the
host element is `flex: 1` and its box does not change after first layout, the
`ResizeObserver` does not re-fire once the canvas attaches, so such a mis-measurement stays
stuck until an incidental resize.

*The rule was learned from a hint banner that reserved `max(canvasSize.w, 34rem)`: the first
(pre-game) resize set `canvasSize` to the full available width, the container went full-width
while the freshly-attached canvas was still at its default size, and the board came out far
too small and stayed there. That banner is gone — `implement-front-page-and-chrome` moved the
hint's explanation into the command surface beside the button that asks for it, so the
container and the wrapper are now the same box — but the requirement is stated about the
**shape** rather than about the banner, because anything later added to the container that
sizes itself from the board would re-open the loop.*

The recompute SHALL be **idempotent**: once the board is correctly sized, a further size
recompute with no layout change SHALL report no change and SHALL NOT trigger a resize loop.
Existing behavior SHALL be preserved — a real window/element resize still resizes the board,
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
