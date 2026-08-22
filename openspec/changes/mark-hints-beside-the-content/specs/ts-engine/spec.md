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
The acted-on cell SHALL be **ringed** rather than filled, and an evidence area
whose cells carry content — entered digits, pencil marks, clue glyphs — SHALL be
**outlined** rather than washed. Both marks SHALL be drawn in the grid gutter
around a cell, which is space the border already occupies, so that a mark costs
the content no room.

An evidence area whose cells carry **no** content MAY remain a wash; the
governing question is `docs/games/hints.md` § "Shade vs ring"'s — *would the fill
hide the premise?* — where **hide** includes *rendered unreadable by contrast*,
not only *occluded*. A game that keeps a wash is asserting that nothing is drawn
on it, and SHALL record that reason where it names the role.

**A fill behind content cannot be rescued by choosing a different colour**, and
this is a measured fact rather than a preference: the target fill scores 1.91:1
against a pencil mark in light and 1.96:1 in dark; clearing ~2.6:1 requires a
wash so pale it collides with the evidence wash, and the only hues that clear it
sit beside `ERROR_WASH`, which would make the cell a hint points at resemble the
cell that is wrong. A joint search over both hint fills, every hue, and both
schemes returns no feasible arrangement. A future change SHALL NOT reopen this by
retuning a colour.

Because a mark in the gutter is read *against* a surface rather than *through*
it, it SHALL take a **strong** colour rather than a wash step, and specifically a
step whose lightness differs between schemes (a `_BOLD`), so that it stands off
the board by a similar margin in each. A step at one lightness under both schemes
reads soft on a pale board and bright on a dark one.

**No tile owns the gutter**, so a mark drawn there SHALL be driven by the game's
drawstate rather than by its per-tile cache: a mark that moves or is dismissed
SHALL be erased explicitly, and a mark that persists SHALL be repainted each
frame, so that a neighbouring cell repainting for its own reasons cannot clip it.

Guards on this SHALL assert the mark's **shape** — that a target is a ring of
thin sides and not a solid fill, and that a contiguous evidence region is one
contour rather than a ring per cell. An assertion that some primitive carries the
hint colour is satisfied equally by the fill being removed.

#### Scenario: The acted-on cell is ringed, not filled

- **WHEN** a hint step marks the cell it acts on
- **THEN** the mark is a ring of thin sides drawn in the cell's gutter, and no
  primitive fills the cell with a hint colour
- **AND** the same mark is used whether the step places a value or strikes a
  candidate, so the cell is never identified only by the strike

#### Scenario: Evidence carrying content is outlined

- **WHEN** a hint step marks an evidence area whose cells carry entered digits,
  pencil marks or clue glyphs
- **THEN** the area is drawn as an outline in the gutter: a side wherever the
  neighbour across it is not also evidence, so a contiguous region reads as one
  contour and a scattered set as one ring per cell
- **AND** the content inside it is drawn exactly as it would be without the hint

#### Scenario: A gutter mark survives a neighbour's repaint

- **WHEN** a cell adjacent to a marked one repaints for its own reasons while the
  hint is still displayed
- **THEN** the mark is still whole on the next frame
- **AND** when the hint is dismissed or moves, the gutter it occupied is restored

#### Scenario: A wash is kept only where nothing is drawn on it

- **WHEN** a game keeps an evidence wash rather than an outline
- **THEN** its evidence cells carry no content the player must read, and the game
  records that reason where it names the role
