# app-shell Specification Delta — fix-click-release-race

## ADDED Requirements

### Requirement: Every press delivered to a puzzle is followed by exactly one release

The interactive puzzle view SHALL deliver a release (or cancel) event to the
puzzle for every press it has delivered, exactly once, regardless of the timing
of the asynchronous round-trip that carries the press to the puzzle engine.

A pointer release that occurs while the corresponding press is still in flight
SHALL be retained and delivered once the press has been acknowledged, rather
than discarded. A press the puzzle declines SHALL continue to be followed by an
immediate release, as it is today.

This guarantee is independent of which engine serves the puzzle: it holds for
the TypeScript engine and for the C/WebAssembly engine alike, because it is a
property of the input layer above both.

#### Scenario: A click completed before the press is acknowledged still releases

- **WHEN** the player presses and releases a pointer faster than the press
  reaches the puzzle engine
- **THEN** the puzzle receives the press and then the release
- **AND** any state the puzzle shows only while a press is held — a drag
  highlight, a lifted piece, a drag preview — is cleared without waiting for a
  later, unrelated input

#### Scenario: A release is never delivered twice

- **WHEN** a pointer release arrives after the press has already been
  acknowledged
- **THEN** the puzzle receives exactly one release for that press
