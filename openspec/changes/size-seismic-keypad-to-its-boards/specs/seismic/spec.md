# seismic Specification Delta — size-seismic-keypad-to-its-boards

## ADDED Requirements

### Requirement: The on-screen keypad offers only digits a board can accept

Seismic's `requestKeys` SHALL NOT offer a digit that no board the generator
produces could accept. Entry is capped at the pressed cell's region size, and the
generator draws region sizes from a bounded distribution, so a panel sized to the
*format*'s maximum leaves keys that are inert on every board a player will ever
see. On touch the panel is the only digit-entry route there is, so an inert key
is not a cosmetic surplus — it is a control that does nothing when pressed.

The requirement is on the *relationship*, not on a number: whichever bound the
generator's distribution has, the panel SHALL match it, and widening one SHALL
widen the other. The panel SHALL therefore **derive** that bound from the
generator's own size distribution rather than restate it as a literal — a
restated bound is what produced this defect, when the generator's distribution
changed and a hand-written copy three files away had no way to hear about it.

The bound the panel derives from SHALL be the **generator's**, not the format's.
The two differ (the format admits up to nine in Seismic mode; the generator
produces at most five), they are adjacent enough to be confused, and the panel
confused them.

#### Scenario: No offered digit is unreachable

- **WHEN** the collection-wide on-screen-key guard sweeps Seismic
- **THEN** every button `requestKeys` returns is one `interpretMove` accepts
  somewhere on a generated board, and Seismic carries no entry in the
  inert-panel-key findings list

#### Scenario: Widening the generator widens the panel

- **WHEN** the generator's region-size distribution is changed to admit a larger
  region
- **THEN** the keypad admits the corresponding digits

## MODIFIED Requirements

### Requirement: Seismic input, note-taking and completion

Seismic SHALL be played with the Solo control scheme: a left-click or the cursor
keys select a cell for number entry, a right-click selects a cell for pencil
marks, and a mode toggle switches between entering numbers and pencil marks. A
digit SHALL be entered only when it does not exceed the selected cell's region
size, SHALL NOT change a fixed clue, and SHALL be a no-op when it would not change
the cell. The game SHALL offer an on-screen keypad sized to the largest region
the generator produces in the mode (see "The on-screen keypad offers only digits
a board can accept") plus a clear key, a mark-all action that fills every empty
cell with all of its region's candidates, a sticky pencil mode preference, and a
pencil-mode indicator.

Rendering SHALL draw the region boundaries, the placed numbers, and the pencil
marks, SHALL highlight a duplicate-in-region or a keep-apart violation in an error
colour as it is entered, and SHALL flash on completion. There SHALL be no move
animation.

#### Scenario: A digit above the region size is rejected

- **WHEN** the player types a digit larger than the selected cell's region size
- **THEN** the board is unchanged

#### Scenario: Completing the grid wins

- **WHEN** the last cell is filled so that every region and keep-apart rule is
  satisfied
- **THEN** the game is reported solved and flashes
