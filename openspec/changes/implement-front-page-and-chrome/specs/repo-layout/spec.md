# repo-layout Specification Delta — implement-front-page-and-chrome

## MODIFIED Requirements

### Requirement: The site-level help documents the features this fork adds

The help pages the app serves SHALL describe the features this fork adds beyond
upstream that a player can invoke from the app's own controls — at minimum the
explained hint (including its stepper and continuous modes), mistake checking,
the one-slot save the mistake check gates, and the controls that have no
keyboard equivalent a touch player can reach.

A feature the app ships a control for SHALL NOT be undiscoverable from the help.
This is required because its absence hid the fork's most-invested divergence:
thirty games implement an explained `hint()` against a documented quality bar,
and on 2026-08-06 the whole of `help/` referred to hints once, in passing,
inside a note about a different puzzle's difficulty naming.

The help SHALL name a control the way the app names it. A page that sends a
player to a surface the app no longer has is worse than one that omits the
feature, because it reads as maintained and fails on its first step: the help
described a "toolbar" and a "game menu", and both were deleted when the chrome
was rebuilt around a single command surface.

The hint's description SHALL say what distinguishes it from upstream's — that it
explains **why** a move is forced rather than only revealing the move — and
SHALL state that a hint requested on a board that contradicts its own clues
refuses and surfaces the offending squares instead of deducing onward from a
wrong position.

Where a hint mark carries a meaning that is the **same in every game**, the help
SHALL state that meaning once, so a player can learn it once rather than per
puzzle. That statement SHALL lead with the mark's **shape** — what is ringed,
what is outlined, what carries an ordinal — and treat color as a secondary cue,
because shape is what the games are held to and what survives for a colorblind
player.

These pages SHALL describe a feature, never the state of its rollout: where a
control is present for some puzzles and not others, the help SHALL state the
property that governs it and SHALL NOT hand-maintain a list of the puzzles. An
enumeration goes stale the day the next implementation lands, which is the same
failure the per-puzzle pages' development-status ban exists to prevent. A named
population is permitted only where a test **derives** it from the declaration
that defines it, so that it cannot rot unnoticed.

Coverage SHALL be asserted automatically, from the app rather than from a
hand-maintained list, and the assertion SHALL be shown to fail before it is
relied upon. The assertion SHALL be **fail-closed** with respect to new
capabilities: a capability added to the `Game` contract with no classification
SHALL fail the check rather than pass by omission, since a check that can only
compare the help against its own list detects deletion but never absence.

A glyph a help page names SHALL resolve to a real icon rule. An unresolved glyph
renders as empty space with no error at build time or run time, so the reference
SHALL be checked against the stylesheet that defines it rather than assumed.

#### Scenario: A player can find out what the Hint button does

- **WHEN** the help is searched for the hint feature
- **THEN** a section describes it, distinguishes it from a move-reveal, and
  covers both the step-at-a-time and the continuous modes

#### Scenario: A refused hint is explained before the player meets one

- **WHEN** the help describes the hint
- **THEN** it states that a board contradicting its clues gets a refusal with
  the offending squares highlighted, rather than a deduction
- **AND** it distinguishes that refusal from the one that means deduction has
  run out, which the player otherwise cannot tell apart

#### Scenario: A cross-game hint mark is explained once, by its shape

- **WHEN** a hint mark means the same thing in every game that draws it
- **THEN** the site-level help states that meaning, rather than each puzzle's
  page restating it or no page stating it
- **AND** it identifies the mark by shape first, with color as a secondary cue

#### Scenario: A partly-implemented feature is described by its rule

- **WHEN** the help describes a feature that only some puzzles offer
- **THEN** it states the property that decides which puzzles offer it
- **AND** it names none of them, unless a test derives the names from the
  declaration that defines the population

#### Scenario: A newly shipped feature control cannot go undocumented

- **WHEN** the app gains a control for a feature the help has no section for
- **THEN** the help-coverage check fails
- **AND** it fails for a capability that is merely absent from the check's own
  list, not only for one whose section was deleted

#### Scenario: The chrome is rebuilt and the help still names its controls

- **WHEN** a command moves to a different surface, or a surface is removed
- **THEN** every help page that directed a player to the old surface is
  corrected in the same change

#### Scenario: A named tier promises something the help has explained

- **WHEN** a game declares a difficulty tier whose name tells the player that
  deduction alone may not finish the board
- **THEN** the help has a section stating what that name promises

#### Scenario: A help glyph names an icon that exists

- **WHEN** a help page references an icon
- **THEN** a rule defining that icon exists in the help stylesheet
- **AND** the reference is checked, because an unresolved one fails silently

#### Scenario: One word does not name two features

- **WHEN** the app and the help both use a term for a saved position
- **THEN** the term refers to one feature, or the difference is made in the app's
  own wording rather than explained away in the help
