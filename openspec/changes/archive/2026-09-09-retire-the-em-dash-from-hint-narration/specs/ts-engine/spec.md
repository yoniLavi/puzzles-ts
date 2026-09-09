# ts-engine

## ADDED Requirements

### Requirement: Hint narration SHALL NOT use an em-dash

Player-facing hint text SHALL NOT contain U+2014, in a game's own narration or
in the shared narration and refusal wording the engine writes on a game's
behalf. A comma, a semicolon, a colon, a sentence break or a parenthetical aside
SHALL be used instead.

The rule is about the punctuation only. A rewrite SHALL preserve the step's
indication → reasoning → conclusion arc and its necessity modal; **removing a
clause to remove the dash is a violation of the narration-quality bar**, not a
way of satisfying this one.

The **en-dash** (U+2013) SHALL NOT be swept up with it, because it is used as
notation rather than as punctuation: a domino written `3–5` is a name, not a
connective.

The guard SHALL find its population the way every cross-game hint guard here
does — from the games that declare a `hint()` — and SHALL additionally scan the
engine's own shipped code, because a family's narration is frequently written
once in the engine and shared across its games. A guard that scanned only the
game directories would report a clean collection while the sentence those games
display carried the character.

The engine scan SHALL exclude test files and the `engine/testing/` tree by
those structural facts rather than by a roster of filenames, so that a new
shared narration module is covered by existing, and a new test helper is
excluded, without anyone maintaining a list.

Both the source scans and the runtime narration sweep SHALL apply the rule.
They are kept as overlapping nets on purpose: the runtime sweep sees only the
narration arms that fire on the boards it walks, and a source scan sees only
what is written as a literal.

#### Scenario: A game's narration adds an em-dash

- **WHEN** a hinting game's source writes an em-dash in a narration string
- **THEN** the cross-game narration guard fails, naming the game and the line

#### Scenario: Shared engine narration adds an em-dash

- **WHEN** a shared narration or refusal string in the engine's shipped code
  writes an em-dash
- **THEN** the guard fails, naming the module and the line, even though no game
  directory changed

#### Scenario: A domino label keeps its en-dash

- **WHEN** a game writes a value such as `3–5` with an en-dash
- **THEN** the guard does not fire, because only U+2014 is retired
