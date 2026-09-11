## ADDED Requirements

### Requirement: A comment says what the code cannot, and a name answers its own question

Source under `src/` SHALL carry a comment only where it tells a reader
something the code does not: why the code is the way it is, a constraint that
still binds, where a behavior came from, or why something is absent. A comment
that restates the code, narrates a past edit, or justifies a constraint that no
longer binds SHALL be removed, and a comment that stays SHALL be no longer than
what it has to say.

An identifier SHALL be renamed if and only if a reader who knows the domain has
to ask what it stands for and the surrounding code does not answer. A short name
the context makes obvious, and that the codebase uses the same way elsewhere,
SHALL be kept: `x` and `y` for a position, `w` and `h` for a size, `r`, `g` and
`b` in a color calculation, a loop index. Where a name carries domain knowledge
the reader needs, the descriptive name is preferred over a comment explaining a
terse one.

A pass made to meet this requirement SHALL NOT change behavior, and SHALL NOT
add an abstraction. A simplification is one that leaves the code both shorter
and easier to read; shorter alone does not qualify.

#### Scenario: A comment defends a byte-match

- **WHEN** a comment justifies reproducing upstream's logic so that a recorded
  fixture still matches
- **THEN** it is kept while that fixture exists and is checked by a test
- **AND** it is removed, or reduced to a statement of provenance, once nothing
  checks it

#### Scenario: A comment records provenance or an absence

- **WHEN** a comment says which upstream behavior a piece of code derives from,
  or why some machinery is deliberately absent
- **THEN** it is kept, as the requirement on procedural comments already
  provides

#### Scenario: A terse name is judged by its context

- **WHEN** a function computing over a grid names its dimensions `w` and `h`
- **THEN** the names are kept
- **WHEN** a two-letter name stands for a domain concept that the reader cannot
  recover from the lines around it
- **THEN** it is renamed to the domain word, and any comment that existed only
  to explain the abbreviation is removed

#### Scenario: A style pass over a game is committed

- **WHEN** a commit makes only comment, naming or simplifying edits to a game
- **THEN** the game's frozen differential fixtures and render snapshots pass
  without being re-recorded
- **AND** the commit removes more lines than it adds
