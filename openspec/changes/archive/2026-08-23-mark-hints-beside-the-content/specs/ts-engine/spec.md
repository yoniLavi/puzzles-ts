# ts-engine Specification Delta — mark-hints-beside-the-content

## ADDED Requirements

<!-- ADDED rather than MODIFIED: this states how a hint *marks* the board, which
no live requirement covers. The nearest one — "A hint step always names a
technique" — governs what a hint *says*, and a MODIFIED delta against it would
put 200 lines of unrelated text at risk of the copy going stale between scaffold
and archive (OPENSPEC_AGENTS.md, and the 134 lines `disambiguate-hint-deixis`
lost that way). -->

### Requirement: A hint marks beside the content, never behind it

A hint's marks SHALL NOT be drawn *underneath* anything the player has to read.
The acted-on cell SHALL be **ringed** rather than filled, in every game and with
no exceptions. An evidence area whose cells carry content — entered digits,
pencil marks, clue glyphs, a placed mark, or a background the deduction is
reading — SHALL be **outlined** rather than washed.

Both marks SHALL be drawn on the space the cell's **border** already occupies,
which is either the gutter between cells or the cell's own outermost pixels
depending on how the game is laid out, so that a mark costs the content no room
and reads as a highlight by *colour* rather than by weight. Where the border
belongs to a game object in its own right — a wall in Galaxies or Palisade — the
mark SHALL be inset inside the cell instead, so it cannot be read as that object.

An evidence area whose cells carry **no** content MAY remain a wash. The
governing question is `docs/games/hints.md` § "Shade vs ring"'s — *would the fill
hide the premise?* — where **hide** includes *rendered unreadable by contrast*,
not only *occluded*. A game that keeps a wash is asserting that nothing is drawn
on it, and SHALL record that reason where it names the role. The target has no
such allowance: it is ringed even where a fill would hide nothing, because one
mark means one thing across the collection, and because in a game whose move is
"give this cell a colour" a fill states with the board what the narration is
still proposing.

**A fill behind content cannot be rescued by choosing a different colour**, and
this is a measured fact rather than a preference: the target fill scores 1.91:1
against a pencil mark in light and 1.96:1 in dark; clearing ~2.6:1 requires a
wash so pale it collides with the evidence wash, and the only hues that clear it
sit beside `ERROR_WASH`, which would make the cell a hint points at resemble the
cell that is wrong. A joint search over both hint fills, every hue, and both
schemes returns no feasible arrangement. The palette SHALL therefore carry no
fill counterpart to the acted-on colour at all, so that a future change cannot
reopen this by retuning one.

A **wash** kept for a content-free evidence area faces the mirror of the same
squeeze and SHALL be tuned for visibility rather than for legibility-through: a
fill dark enough to keep a *derived* foreground readable measures 1.15:1 against
its own board in dark mode, which is a mark nobody can see. The two requirements
move in opposite directions along one axis, so a wash carrying content loses
whichever way it is tuned.

Because a mark on a border is read *against* a surface rather than *through* it,
it SHALL take a **strong** colour rather than a wash step, and specifically a
step whose lightness differs between schemes (a `_BOLD`), so that it stands off
the board by a similar margin in each. A step at one lightness under both schemes
reads soft on a pale board and bright on a dark one.

The evidence colour and the **chain ordinal** that indexes it SHALL be one role
rather than two roles holding the same value: a number saying where a cell falls
in an ordered chain is an index *into* the evidence, so a name of its own would
claim the ordered cells were a different kind of premise from the unordered ones.

Where a mark lies **outside** the cell's content box, no tile owns those pixels,
so it SHALL be driven by the game's drawstate rather than by its per-tile cache:
a mark that moves or is dismissed SHALL be erased explicitly, and a mark that
persists SHALL be repainted each frame, so that a neighbouring cell repainting
for its own reasons cannot clip it. Where a mark lies wholly **inside** the box,
the cell's own repaint undoes it and no such bookkeeping is required — the hint
overlay is already part of that cell's cache key.

Guards on this SHALL assert the mark's **shape** — that a target is a ring of
thin sides and not a solid fill, and that a contiguous evidence region is one
contour rather than a ring per cell. An assertion that some primitive carries the
hint colour is satisfied equally by the fill being removed. The cross-game guard
SHALL derive each game's hint palette indices from that game's own renderer
rather than from a list maintained beside it, and SHALL assert how many games it
examined, so that it cannot shrink in silence.

#### Scenario: The acted-on cell is ringed, not filled

- **WHEN** a hint step marks the cell it acts on
- **THEN** the mark is a ring of thin sides drawn on the cell's border, and no
  primitive fills the cell with a hint colour
- **AND** the same mark is used whether the step places a value or strikes a
  candidate, so the cell is never identified only by the strike
- **AND** this holds even where the cell is empty and a fill would hide nothing

#### Scenario: Evidence carrying content is outlined

- **WHEN** a hint step marks an evidence area whose cells carry entered digits,
  pencil marks, clue glyphs, or a background the deduction is reading
- **THEN** the area is drawn as an outline: a side wherever the neighbour across
  it is not also evidence, so a contiguous region reads as one contour and a
  scattered set as one ring per cell
- **AND** the content inside it is drawn exactly as it would be without the hint

#### Scenario: A mark outside the content box survives a neighbour's repaint

- **WHEN** a cell adjacent to a marked one repaints for its own reasons while the
  hint is still displayed
- **THEN** the mark is still whole on the next frame
- **AND** when the hint is dismissed or moves, the space it occupied is restored

#### Scenario: A wash is kept only where nothing is drawn on it

- **WHEN** a game keeps an evidence wash rather than an outline
- **THEN** its evidence cells carry no content the player must read, and the game
  records that reason where it names the role
- **AND** the cross-game guard names that game explicitly, so a further game
  taking the same allowance fails until its reason is written down

#### Scenario: A mark never impersonates a game object

- **WHEN** a game draws its own objects on the cell border — a wall between two
  cells, say
- **THEN** the hint's marks are inset inside the cell instead, so that neither
  mark can be read as one of those objects
