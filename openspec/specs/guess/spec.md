# guess Specification

## Purpose
TBD - created by archiving change add-guess-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Guess game implements the Game interface

The engine SHALL provide a registered `guess` game implementing
`Game<GuessParams, GuessState, GuessMove, GuessUi, GuessDrawState>`: a Mastermind
clone in which the player deduces a hidden combination of `npegs` colour pegs
drawn from `ncolours` colours within `nguesses` guess rows. Params SHALL be
`ncolours`, `npegs`, `nguesses`, `allowBlank`, and `allowMultiple`, encoded
`c{ncolours}p{npegs}g{nguesses}{b|B}{m|M}` with lenient decode (unknown letters
ignored). The two upstream presets — **Standard** (`6,4,10,false,true`) and
**Super** (`8,5,12,false,true`) — SHALL be offered. `validateParams` SHALL reject
`ncolours < 2` or `npegs < 2`, `ncolours > 10`, `nguesses < 1`, and
`allowMultiple = false` with `ncolours < npegs`. The game SHALL report
`wantsStatusbar = false`, `isTimed = false`, `canSolve = true`, and
`canFormatAsText = false`, and SHALL NOT provide `findMistakes`.

#### Scenario: Params round-trip and lenient decode

- **WHEN** params `{ ncolours: 8, npegs: 5, nguesses: 12, allowBlank: false, allowMultiple: true }`
  are encoded
- **THEN** the result is `c8p5g12Bm`
- **AND** decoding `c8p5g12Bm` round-trips those params

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is called with `allowMultiple: false` and
  `ncolours: 3, npegs: 4`
- **THEN** it returns a non-null error string

### Requirement: Guess descriptions are obfuscated solution bitmaps

The Guess `newDesc` SHALL draw a random colour sequence (each peg uniformly from
`1..ncolours`, redrawing on a repeat when `allowMultiple` is false), encode it as
a byte-per-peg bitmap, apply the upstream `obfuscate_bitmap` SHA-1 masking, and
hex-encode the result. The desc SHALL be byte-identical to the C build for the
same random seed. `validateDesc` SHALL reject a desc of wrong length or one whose
de-obfuscated bytes fall outside `1..ncolours`. `newState` SHALL recover the
solution by hex-decoding and de-obfuscating the desc.

#### Scenario: A description round-trips through obfuscation

- **WHEN** a solution sequence is obfuscated and hex-encoded to a desc, then that
  desc is hex-decoded and de-obfuscated by `newState`
- **THEN** the recovered solution equals the original sequence

#### Scenario: A corrupted description is rejected

- **WHEN** `validateDesc` is given a desc of the wrong length, or one that
  de-obfuscates to a colour outside `1..ncolours`
- **THEN** it returns a non-null error string

### Requirement: Guess scores submitted rows with Knuth feedback

A `GuessMove` SHALL be a guess submission carrying the working row's pegs and
holds (`{ type: "guess", pegs, holds }`) or a solve (`{ type: "solve" }`).
`executeMove` SHALL be pure. A guess submission SHALL validate each peg against
`[allowBlank ? 0 : 1, ncolours]`, then mark the row with Knuth's feedback —
`nc_place` exact-position matches (black) and `nc_colour = Σ_colour min(#guess,
#solution) − nc_place` colour-only matches (white) — and store that feedback on
the row. The game SHALL set `solved = +1` (win) when every peg is in the correct
place, else advance to the next row, setting `solved = -1` (lose, revealing the
solution) when the rows are exhausted. A solve SHALL set `solved = -1`.

#### Scenario: A correct guess wins

- **WHEN** the submitted row equals the solution
- **THEN** the row's feedback is all correct-place, and `status()` returns
  `"solved"`

#### Scenario: Feedback counts black then white pegs

- **WHEN** a row with two pegs in the correct place and one further peg of a
  colour present elsewhere in the solution is submitted
- **THEN** the feedback contains exactly two correct-place markers followed by
  one correct-colour marker, and the source state is unmutated

#### Scenario: Exhausting the rows loses and reveals

- **WHEN** the final available row is submitted without matching the solution
- **THEN** `status()` returns `"lost"` and the solution becomes visible

### Requirement: Guess accepts drag, hold, keyboard, and hint input

`interpretMove` SHALL support: dragging a colour from the colour bar, from a
current-row peg, or from a past-guess peg onto a current-row slot to set that peg
(and dragging a current-row peg away to clear it), using a blitter drag sprite;
right-clicking a current-row slot to toggle its hold; a keyboard colour/peg
cursor with number-key entry, delete, hold (`CURSOR_SELECT2`), and submit
(`CURSOR_SELECT` on the submit position); and a hint key (`'h'`, `'H'`, or `'?'`)
that fills the working row with the lexicographically-first guess consistent with
all feedback so far. A row SHALL be submittable (`markable`) only when enough
pegs are filled (all, unless `allowBlank`) and — when `allowMultiple` is false —
no colour repeats. The working row, holds, drag, cursor, label toggle, and cached
hint SHALL live in `GuessUi`; submitting holds SHALL carry held pegs into the
next working row.

#### Scenario: Submit is only offered for a markable row

- **WHEN** the working row has fewer filled pegs than required
- **THEN** `isMarkable` is false and a submit attempt produces no guess move

#### Scenario: The hint key fills a consistent row

- **WHEN** the hint key is pressed with at least one prior scored guess
- **THEN** the working row is filled with a combination whose feedback against
  every prior guess matches that guess's recorded feedback, and the move returns
  a UI update (not a state transition)

#### Scenario: Holds carry pegs to the next guess

- **WHEN** a slot is held and a non-winning guess is submitted
- **THEN** the next working row is pre-filled with the held peg's colour and
  unheld slots are cleared

