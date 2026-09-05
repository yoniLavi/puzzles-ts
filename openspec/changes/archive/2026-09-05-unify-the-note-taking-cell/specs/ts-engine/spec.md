# ts-engine — deltas for unify-the-note-taking-cell

## ADDED Requirements

### Requirement: The note-taking cell is one shared mechanic, not eleven copies

A game whose player **highlights a cell, types a value into it, and pencils
candidate marks in it** SHALL obtain that mechanic from the engine rather than
implementing it. The engine SHALL provide it as a *mechanic* module — the same
shape and the same test as the shared border-marking grid: what belongs in it is
what would otherwise have to change in every copy at once, and nothing that
merely looks alike.

The engine SHALL own **what a pointer press does to the highlight**: which
button selects and which deselects, how the fork's sticky pencil mode behaves,
and the fact that a pointer press hands the cursor's provenance back to the
mouse. The engine SHALL also own **what a symbol entry does to the highlight** —
whether a real entry puts it away, and what a keystroke that would write nothing
returns.

A game SHALL keep everything about its puzzle: its coordinate mapping, its
symbol vocabulary, the predicate that decides whether a keystroke is a no-op,
and its own `Move` type. The shared code SHALL report what the press did to the
highlight and SHALL NOT construct a move, because a shared move type would
couple save formats that have no reason to be identical.

The two questions a game answers for itself SHALL be exactly *may the player
type a value into this cell* and *may this cell carry pencil marks*. Those are
real differences about the puzzle — a given, a wall, a clue square and a filled
square are each some game's answer — and everything around them is not.

**Two rules replace disagreements that no game could explain in terms of its
puzzle**, and both SHALL hold for every game in the mechanic:

- A pointer press SHALL move the highlight to the pressed cell, whether or not
  the cell can take what the press offers; the cell decides only whether the
  highlight is *shown*. The position is observable while hidden, because the
  next arrow key resumes from it.
- The highlight SHALL be shown only where the mode it is in could write —
  against "may carry marks" in pencil mode and "may take a value" otherwise.

The sticky pencil toggle is the one arm exempt from the first rule: because it
is a mode switch rather than a selection, a press on a cell that could take no
mark SHALL leave the highlight where it is.

Neither the press nor the entry SHALL change pencil mode as a side effect of
putting the highlight away. A latched pencil mode stays latched until the player
unlatches it, which is what the preference's own wording promises.

The mechanic's `Ui` fields SHALL have one spelling and one polarity across the
whole collection, including in a game that carries the cursor-provenance flag
without the rest of the mechanic. Where a game does not offer one of the pencil
preferences, its behavior SHALL be derived from that absent declaration rather
than from a roster of exempt games.

**Every game in the mechanic SHALL offer both pencil preferences, defaulted the
same way**, so that one gesture does one thing across the family and the player
who wants the other still has it. The collection previously answered
"does a mouse-driven pencil mark keep the highlight" two ways — five games kept
it with no preference at all, six offered the preference and defaulted it off —
which a player met as the same gesture behaving oppositely in two games of the
same shape. Both halves SHALL be guarded over the derived population: the
default, and that the preference is offered at all.

Enrollment SHALL be **derived**: a game is in the mechanic iff its `Ui` carries
the fields, read off its own `newUi` output. The engine SHALL fail the build for
a game that carries them and does not route its press through the shared arm —
a check that must be a source scan, because what is being asserted is that a
hand-written twelfth copy does not exist.

#### Scenario: A press onto a cell that cannot take a value

- **WHEN** a player presses a given, while the highlight is showing elsewhere
- **THEN** the highlight is hidden **and** has moved to the pressed cell
- **AND** the next arrow key steps from the pressed cell

#### Scenario: The sticky toggle does not double as a selection key

- **WHEN** a player presses the secondary button on a filled cell, in a game
  offering sticky pencil mode
- **THEN** pencil mode toggles
- **AND** the highlight is exactly where it was, shown or hidden as it was

#### Scenario: A latched pencil mode survives a mouse-driven mark

- **WHEN** a player has latched pencil mode and enters a mark with the pointer
- **THEN** pencil mode is still latched

#### Scenario: The family answers a preference question once

- **WHEN** a player makes the same mouse-driven pencil mark in any two games of
  the mechanic, having changed no preferences
- **THEN** the highlight behaves the same way in both

#### Scenario: A game carrying the fields must use the mechanic

- **WHEN** a game's `newUi` returns the mechanic's `Ui` fields
- **AND** its sources never call the shared press arm
- **THEN** the build fails, naming that game
