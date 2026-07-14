# netslide

## MODIFIED Requirements

### Requirement: Netslide offers an explained hint

Netslide SHALL implement `Game.hint` and `Game.hintKeepTrack`, planning a
sequence of slides that rebuilds the network and narrating each one by the
consequence it actually has.

Because Netslide has no solver, the hint SHALL plan against a finished grid: the
generator's `aux` (the unshuffled grid) when the game came with one, and
otherwise a grid **recovered from the board itself**. The plan's goal test SHALL
be "every tile is powered", not "the board equals the target", so a board the
player completes by another route is recognised as finished.

The hint SHALL meet the collection's hint quality bar:

- It SHALL name board elements as the player can **see or count** them, never by a
  claim it has not checked. The immovable tile SHALL be called **the source** — the
  tile power flows from, drawn as the black box — and SHALL NOT be called "the
  centre": it sits at `⌊w/2⌋, ⌊h/2⌋`, which on an even-sized board is visibly not
  the centre. A line that cannot be slid SHALL be named by its **number** ("row 3
  never slides"), which is true at every board size.
- It SHALL lead with what the game can prove about **this move**: a tile in the
  source's row can only be moved by sliding its column, and vice versa — the single
  degree of freedom that is the game's technique.
- It SHALL NOT restate the **rules** of the game step after step. That the source
  cannot move is a rule the board already shows — no arrows are drawn beside its row
  or column — and no move *follows* from it; it belongs in the help text, not in
  every hint. A step whose tile merely belongs beside the source SHALL say that
  plainly, without a preamble.
- It SHALL narrate each move by its consequence — whether it **places a tile
  where it belongs** or is a **setting-up move** that brings one within reach —
  using the shared sliding-tile hint vocabulary, never merely restating the
  move, and SHALL NOT say a tile "belongs" twice in one sentence.
- A subgoal that takes several slides SHALL be emitted as **one multi-leg
  journey** (continuation legs flagged `continuesPrevious`), so it reads and
  auto-plays as a single hint.
- It SHALL claim only what it has checked. Netslide's tiles are wire masks and
  many are identical, so a tile does not have *one* home — it belongs anywhere
  the finished board wants its wires. The hint SHALL therefore say a tile
  belongs at a cell only when the finished board wants that tile's wires there,
  and SHALL NOT claim it is the only cell it could occupy. A plan that runs out
  of budget before finishing may leave a tile somewhere merely useful; such a
  move SHALL be narrated as setting up, not as arriving.

#### Scenario: A hint on a board one move from solved

- **WHEN** a hint is requested on a board one slide away from a finished network
- **THEN** the plan is a single step whose move completes the board, and its
  explanation says that it puts a tile where it belongs

#### Scenario: A hint on a board that came with no answer

- **WHEN** a hint is requested on a game created from a `params:desc` id — a
  shared link or a bookmark — which carries no `aux`
- **THEN** the hint recovers the finished grid from the board and plans against
  it, rather than giving up

#### Scenario: A tile is only ever said to belong where its wires are wanted

- **WHEN** a hint step says a tile belongs at a cell
- **THEN** the finished board holds exactly that tile's wires in that cell

#### Scenario: The immovable tile is never called the centre

- **WHEN** any hint step is narrated, on a board of any size
- **THEN** its explanation calls the immovable tile the source, and never the
  centre — which on an even-sized board would name a tile the player can see it is
  not

#### Scenario: A frozen line is named by its number

- **WHEN** a hint step turns on the single degree of freedom — the tile sits in the
  source's row, so only its column can shift it
- **THEN** the explanation names that row by its number, and says that only a column
  move can shift the tile
