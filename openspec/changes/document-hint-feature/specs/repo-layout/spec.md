# repo-layout Specification Delta — document-hint-feature

## ADDED Requirements

### Requirement: The site-level help documents the features this fork adds

The help pages the app serves SHALL describe the features this fork adds beyond
upstream that a player can invoke from the app's own controls — at minimum the
explained hint (including its stepper and continuous modes), mistake checking,
and the quick-save slot the mistake check gates.

A feature the app ships a control for SHALL NOT be undiscoverable from the help.
This is required because its absence hid the fork's most-invested divergence:
twenty-nine games implement an explained `hint()` against a documented quality
bar, and on 2026-08-06 the whole of `help/` referred to hints once, in passing,
inside a note about a different puzzle's difficulty naming.

The hint's description SHALL say what distinguishes it from upstream's — that it
explains **why** a move is forced rather than only revealing the move — and
SHALL state that a hint requested on a board that contradicts its own clues
refuses and surfaces the offending squares instead of deducing onward from a
wrong position.

Where a highlight colour carries a meaning that is the **same in every game**,
the help SHALL state that meaning once, so a player can learn it once rather
than per puzzle.

These pages SHALL describe a feature, never the state of its rollout: where a
control is present for some puzzles and not others, the help SHALL state the
property that governs it and SHALL NOT enumerate the puzzles. An enumeration
goes stale the day the next implementation lands, which is the same failure the
per-puzzle pages' development-status ban exists to prevent.

Coverage SHALL be asserted automatically, from the app rather than from a
hand-maintained list, and the assertion SHALL be shown to fail before it is
relied upon.

#### Scenario: A player can find out what the Hint button does

- **WHEN** the help is searched for the hint feature
- **THEN** a section describes it, distinguishes it from a move-reveal, and
  covers both the step-at-a-time and the continuous modes

#### Scenario: A refused hint is explained before the player meets one

- **WHEN** the help describes the hint
- **THEN** it states that a board contradicting its clues gets a refusal with
  the offending squares highlighted, rather than a deduction

#### Scenario: A cross-game highlight meaning is stated once

- **WHEN** a highlight colour means the same thing in every game that draws it
- **THEN** the site-level help states that meaning, rather than each puzzle's
  page restating it or no page stating it

#### Scenario: A partly-implemented feature is described by its rule

- **WHEN** the help describes a feature that only some puzzles offer
- **THEN** it states the property that decides which puzzles offer it, and names
  none of them

#### Scenario: A newly shipped feature control cannot go undocumented

- **WHEN** the app gains a control for a feature the help has no section for
- **THEN** the help-coverage check fails

#### Scenario: One word does not name two features

- **WHEN** the app and the help both use a term for a saved position
- **THEN** the term refers to one feature, or the difference is made in the app's
  own wording rather than explained away in the help
