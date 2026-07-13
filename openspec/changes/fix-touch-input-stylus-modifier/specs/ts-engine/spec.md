# ts-engine Specification

## ADDED Requirements

### Requirement: The midend hides the stylus modifier from games that do not want it

The midend SHALL strip `MOD_STYLUS` from the button before calling
`Game.interpretMove`, unless the game sets `wantsStylusModifier`. A press, drag
or release from a finger or a pen therefore reaches an ordinary game as the plain
button code, and a game that tests `button === LEFT_BUTTON` works on touch
without having to strip anything.

This is a deliberate divergence from upstream, where `midend.c` hands the bit to
`interpret_move` and each game is expected to strip it. That contract is a
footgun: comparing the raw button is the obvious thing to write, it reads
correctly, and it fails silently — and only on a device no test suite exercises.
It caught nine of this collection's first thirty-two ports (Flip, Galaxies, Pegs,
Blackbox, Dominosa, Guess, Signpost, Untangle, Inertia), each of which shipped
completely deaf to touch. Inverting the default makes the dangerous case the one a
game has to ask for.

A game whose touch behaviour genuinely differs SHALL set `wantsStylusModifier`
and handle the bit itself. Pattern is the only such game: with no right button
available to a finger, a touch press cycles a cell through its three states
rather than simply filling it.

#### Scenario: A touch press plays the game

- **WHEN** a press arrives with `MOD_STYLUS` set, for a game that has not set
  `wantsStylusModifier`
- **THEN** the game interprets it exactly as it interprets the same press from a
  mouse

#### Scenario: A game may still ask for the stylus bit

- **WHEN** a game sets `wantsStylusModifier` and a touch press arrives
- **THEN** `interpretMove` receives the button with `MOD_STYLUS` still set

### Requirement: Touch equivalence is guarded for every registered game

The test suite SHALL assert, for **every** game in the runtime registry, that a
touch press does what the same mouse press does, across a sweep of the whole
board — so that a newly ported game is covered on the day it is registered rather
than when somebody remembers to check it on a phone.

The sweep SHALL be dense enough to land on the game's live targets, and SHALL
fail rather than pass vacuously when no probe reaches one (an early cut of this
guard missed Untangle entirely, because its vertices sit at arbitrary points that
a coarse grid never hit).

#### Scenario: A new port that ignores touch fails the suite

- **WHEN** a game is registered whose `interpretMove` compares an unstripped
  button against `LEFT_BUTTON`, and the midend's stripping is removed
- **THEN** the guard test fails for that game
