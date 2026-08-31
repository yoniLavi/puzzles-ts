# twiddle Specification Delta — unify-cross-game-vocabulary

## MODIFIED Requirements

### Requirement: Twiddle rotation and solve moves transform state purely

A `TwiddleMove` SHALL be either a rotation carrying the top-left corner of the
`n×n` region and a direction (`{ type: "rotate", x, y, dir: 1 | -1 }`) or a
solve (`{ type: "solve" }`). `interpretMove` SHALL convert a left/right click to
a rotation by offsetting the click by `(n−1)/2` tiles so it selects the region
*centred* on the click, mapping to grid coordinates and rejecting clicks whose
region falls outside `0 ≤ x ≤ w−n`, `0 ≤ y ≤ h−n`; left-click rotates `dir +1`,
right-click `dir −1`. Cursor keys SHALL move a cursor over the
`(w−n+1)×(h−n+1)` rotation-origin space (clamped, no wrap) returning a UI update,
and `CURSOR_SELECT`/`CURSOR_SELECT2` SHALL rotate the cursor's block `dir +1`/`−1`
(a first select while the cursor is hidden only reveals it). Corner letters
`a`/`b`/`c`/`d` (and shifted `A`/`B`/`C`/`D` for the reverse direction) and the
parity-gated numpad rotations SHALL also produce rotations. `executeMove` SHALL
be pure (returning a new state): a rotation turns the `n×n` block 90° in `dir`
(advancing tile orientations when `orientable`), increments the move count, and
records completion when the solved arrangement is first reached; a solve SHALL
replace the grid with the solved arrangement, clear orientations, set
`cheated`, and suppress the completion flash.

#### Scenario: A rotation turns the block and is reversible

- **WHEN** a `dir +1` rotation executes on a block, then a `dir −1` rotation
  executes on the same block
- **THEN** the grid returns to its original arrangement, the source states are
  unmutated, and the move count increased by one per rotation

#### Scenario: Click geometry constrains legal rotations

- **WHEN** a click selects a region that would extend past the grid edge
  (its top-left corner outside `0 ≤ x ≤ w−n`, `0 ≤ y ≤ h−n`)
- **THEN** no move is produced

#### Scenario: Orientation matters in orientable mode

- **WHEN** the game is `orientable` and a rotation executes
- **THEN** each moved tile's orientation advances by the rotation direction
  (mod 4), and the board is reported complete only when the numbers are ordered
  **and** every tile is upright

#### Scenario: Solve snaps to the solved board

- **WHEN** the solve move executes
- **THEN** the new state is the solved arrangement with cleared orientations and
  `cheated` set, and the completion flash is suppressed on the following redraw
