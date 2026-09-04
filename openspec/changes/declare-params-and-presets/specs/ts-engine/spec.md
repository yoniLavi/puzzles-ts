# ts-engine — deltas for declare-params-and-presets

## ADDED Requirements

### Requirement: A game declares its params encoding once, and both codec halves are derived

A game whose params encoding fits the collection's grammar SHALL declare it as
an ordered list of segments and obtain `encodeParams` and `decodeParams` from
`paramsCodec` in `engine/params-codec.ts`, rather than hand-writing two
functions that must be exact inverses of each other.

The grammar is what the 57 hand-written codecs turned out to spell, and no
more: a `dims` prefix (`WxH`, with upstream's square fallback) or a `size`
(one untagged leading integer), followed by tagged segments — `num` (`n12`),
`choice` (a tag plus one letter from a table) — and bare `flag` letters. The
options are the variations those codecs actually contained: `full` for a
generator-only field the brief encoding omits, `invalid` for the out-of-range
value an unrecognized difficulty letter leaves behind, `means` for a letter
written when its field is *off*, `omitWhen` for a field written only when
non-zero, and `whenAbsent` for a default computed from params already decoded.

**A segment SHALL name a `paramConfig` field by its `kw` and reuse that item's
`get`/`set`.** This is the requirement's substance rather than an
implementation note: the params form and the codec were two hand-synced copies
of one field list, and naming the field through the form makes it impossible
for a field to appear in the Custom dialog and be dropped from the game ID, or
the reverse. It also keeps a field's representation the game's own business —
three of the converted games store a difficulty tier as something other than an
index, and none of them changed to become encodable. A field the dialog does
not offer may still be encoded by supplying accessors on the segment.

**A segment naming a `kw` no item declares SHALL throw**, rather than encoding
nothing. A silently skipped segment would drop a field from every game ID the
game issues.

#### Scenario: A declared codec round-trips

- **WHEN** a game declares its encoding as a segment list
- **THEN** `decodeParams(encodeParams(p, true))` re-encodes to the same string,
  for every params object the game can reach

#### Scenario: A segment naming an undeclared field is refused

- **WHEN** a segment names a `kw` that the game's `paramConfig` does not declare
- **THEN** building the codec throws, naming the missing `kw`

### Requirement: A params encoding the grammar does not fit stays hand-written

A game whose encoding the segment grammar cannot express SHALL keep a
hand-written codec, and that codec SHALL remain first-class rather than being
treated as debt.

Measured over all 57 games at the time the grammar was written, the shapes it
does not express are: a float-valued param (Rectangles' expansion factor, Net's
and Netslide's barrier probability), a leading letter before the dimensions
(Cube), a `switch` mapping a field to multi-character strings with defaults
omitted (Solo's symmetry and difficulty), a `while` loop over the tail
accepting letters in any order (Dominosa, Mines), and a boolean encoded as an
integer (Mosaic).

**The grammar SHALL NOT grow an option to absorb a single game.** A shared form
escaped by more games than it serves is not a win, and a form that swallows
every game by accreting a per-game hatch is two ways plus a seam rather than
one obvious way — which is the outcome this whole direction exists to avoid.
An option earns its place by serving several games, as `whenAbsent` does.

#### Scenario: A bespoke codec is held to the same guarantee

- **WHEN** a game keeps a hand-written codec
- **THEN** its encodings are asserted by the same byte-stability guard as every
  declared one, so the two shapes differ in how they are written and not in
  what is promised
