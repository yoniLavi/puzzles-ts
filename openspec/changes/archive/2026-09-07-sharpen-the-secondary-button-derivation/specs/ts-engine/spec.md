# ts-engine

## MODIFIED Requirements

### Requirement: A game with no secondary meaning is not given a synthetic one

A game in which the secondary button means **nothing observable** SHALL declare
`Game.ignoresSecondaryButton`, and the interactive view SHALL then skip
`detectSecondaryButton` entirely for that game — neither long press nor
two-finger tap promoting the press, and the press delivered immediately rather
than held for the detection window.

Without it the promotion is pure loss: the frontend converts a held press to
`RIGHT_BUTTON`, the game tests no such button, and the whole gesture disappears —
only on touch, and only for the player who paused. "Press, pause to aim, then
drag" *is* a press that stays put, so a press-and-drag game loses its one gesture
exactly when the player stops to think. Seven games were in that state when the
collection was swept (Cube, Fifteen, Filling, Flip, Flood, Pegs, Sokoban), Pegs
and Filling being the two whose whole interaction is a drag.

The guard SHALL assert the **biconditional** — a game declares the flag if and
only if the secondary button means nothing observable on a real board — so the
declaration can neither be forgotten by a new game nor left behind by a game that
grows a secondary meaning.

**What counts as a meaning SHALL be derived, never declared.** Reading all 57
games found exactly three legitimate answers, and the guard SHALL credit all
three because they are one question rather than three cases — *did the secondary
gesture change anything the player can perceive, now or next?*

1. **It commits a move** (34 games).
2. **It changes what the next input does** (16) — the pencil-mode press, which
   nine games reach through the shared `pressNoteTakingCell` without naming
   `RIGHT_BUTTON` at all; plus Guess's peg hold, Samegame's selection clear,
   Rome's pencil drag, Signpost's backward grab and Ascent's candidate cycle.
   None of these commits anything by itself.
3. **It folds onto the primary button** (Slide's `asPrimary`) — the documented
   alternative to the flag.

Consumption alone SHALL NOT satisfy the biconditional. It was the previous
question and it was satisfied by a bare repaint: 16 of 57 games consumed
`RIGHT_BUTTON` without ever committing a move, so for those the guard held
whatever the game did. Replacing a game's secondary meaning with a bare
`UI_UPDATE` is green under "was it consumed" and red under this requirement.

The observation SHALL be **the painted frame together with the save**, not the
save alone. A game may keep a secondary meaning in UI state it never serializes —
Guess's peg holds — and a save-only probe reports such a game as meaningless,
demanding the flag from a game that has a meaning and turning off the promotion
it handles.

This SHALL NOT be read as reinstating "did the board change" as a conviction.
That question was rejected because its *negation* is unsound — an eraser on a
fresh board correctly changes nothing. Here a change is only ever a **sufficient**
sign that the button means something, and a game is reported meaningless only
when it is invisible under every observation, so the derivation cannot convict an
innocent game.

**A known bound, recorded rather than implied**: a secondary press with an
incidental side effect shared with the primary press — hiding a keyboard cursor
on any mouse-down, as Ascent does — is credited on that alone. Closing it needs a
"does the secondary do something the primary does not" comparison, which Slide's
deliberate fold would fail, so the bound stands until a derivation exists that
does not convict Slide.

This flag is **not** upstream's `REQUIRE_RBUTTON` inverted, and SHALL NOT be
derived from it. Those two describe different sets, and the difference is the
largest group of all: a game may *use* the secondary button without *needing* it
(Tracks), and suppressing its promotion would break a gesture it handles
correctly.

#### Scenario: A held touch press still plays a drag game

- **WHEN** a touch press is held past the long-press window and then dragged, in
  a game that declares `ignoresSecondaryButton`
- **THEN** the gesture is delivered as a left-button press, drag and release, and
  completes as it would have without the pause

#### Scenario: The declaration cannot drift from the behavior

- **WHEN** a registered game's secondary button means something observable
- **THEN** the guard fails if that game declares `ignoresSecondaryButton`
- **AND** when it means nothing observable, the guard fails if it does not

#### Scenario: A repaint is not a secondary meaning

- **WHEN** a game answers `RIGHT_BUTTON` but the gesture leaves the same frame
  and the same save, and changes nothing about what the next input does
- **THEN** the guard demands `ignoresSecondaryButton`, even though the button was
  consumed

#### Scenario: A meaning reached through a shared helper counts

- **WHEN** a game's secondary meaning is supplied by `pressNoteTakingCell` or
  another shared helper, with no `RIGHT_BUTTON` branch of its own
- **THEN** the guard credits it, because the derivation reads behavior rather
  than source

## ADDED Requirements

### Requirement: The collection's input guards share one behavioral probe

The questions the collection-wide input guards ask of a game SHALL live in one
shared module (`src/engine/testing/input-probe.ts`), and each guard SHALL ask
them through it rather than carrying its own copy.

Two guards in different directories were building the same board, walking the
same probe grid and hashing the same save, and they had already drifted: the
bare-letter sweep seeded its board differently, tested a single cursor position,
and consequently reported a different set of games the moment its board changed —
Tents accepts `n` on any square but a tree, so the finding depended on what the
seed dealt.

Every probe SHALL be **behavioral**: it drives a real `Midend` over a real board
through the same path the frontend uses. No probe SHALL read a game's source, and
none SHALL read a declaration about a game — a game joins a population by *having*
the behavior. A probe whose answer depends on where a cursor happens to land SHALL
walk the cursor rather than test one cell.

#### Scenario: A new guard inherits the probes

- **WHEN** a new collection-wide input guard is written
- **THEN** it obtains its board, probe points and questions from the shared
  module, and does not restate them

#### Scenario: A probe does not depend on the deal

- **WHEN** a probe's answer would differ according to which board a seed dealt
- **THEN** it sweeps the positions that could differ rather than asserting from
  one
