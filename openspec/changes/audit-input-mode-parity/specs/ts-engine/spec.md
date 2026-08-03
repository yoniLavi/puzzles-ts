# ts-engine Specification Delta — audit-input-mode-parity

## MODIFIED Requirements

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
and handle the bit itself. **Two** games do: Pattern, where with no right button
available to a finger a touch press cycles a cell through its three states rather
than simply filling it; and Loopy, where a tap must be able to reach all three
line states. This requirement previously said "Pattern is the only such game",
which was true when written and stopped being true when Loopy landed — a count
in a spec is a fact that goes stale silently, and this one did.

#### Scenario: A touch press plays the game

- **WHEN** a press arrives with `MOD_STYLUS` set, for a game that has not set
  `wantsStylusModifier`
- **THEN** the game interprets it exactly as it interprets the same press from a
  mouse

#### Scenario: A game may still ask for the stylus bit

- **WHEN** a game sets `wantsStylusModifier` and a touch press arrives
- **THEN** `interpretMove` receives the button with `MOD_STYLUS` still set

#### Scenario: A game that asks for the bit is still covered by a guard

- **WHEN** the collection-wide input guards run
- **THEN** a game setting `wantsStylusModifier` is not simply skipped, but is
  asserted against the touch behaviour it declares
- **BECAUSE** excluding it makes the two games with bespoke touch handling the
  two games nothing checks

### Requirement: Touch equivalence is guarded for every registered game

The test suite SHALL assert, for **every** game in the runtime registry, that
touch input does what the equivalent mouse input does — so that a newly ported
game is covered on the day it is registered rather than when somebody remembers
to check it on a phone.

The guard SHALL cover **gestures, not only a single press**. A press alone is not
what play consists of, and it is not what the frontend's traps break: a finger
that stays within 8 px for 350 ms is delivered as `RIGHT_BUTTON`
(`detectSecondaryButton`), which kills a press-and-drag gesture precisely when
the player pauses to aim — while leaving the press itself working, so a
press-only guard passes. The sweep SHALL therefore exercise press → drag →
release sequences for every game that handles drags, and the
long-press-as-secondary case for every game whose gesture is a drag.

The sweep SHALL be dense enough to land on the game's live targets, and SHALL
fail rather than pass vacuously when no probe reaches one (an early cut of this
guard missed Untangle entirely, because its vertices sit at arbitrary points that
a coarse grid never hit).

#### Scenario: A new port that ignores touch fails the suite

- **WHEN** a game is registered whose `interpretMove` compares an unstripped
  button against `LEFT_BUTTON`, and the midend's stripping is removed
- **THEN** the guard fails, naming that game

#### Scenario: A drag gesture is equivalent from a finger

- **WHEN** a press, drag and release sequence is delivered from touch to a game
  that handles drags
- **THEN** the resulting board state matches the same sequence delivered from a
  mouse

#### Scenario: A long press does not kill a drag gesture

- **WHEN** a touch press is delivered as `RIGHT_BUTTON` because the finger paused
  before moving, to a game whose gesture is a press-and-drag
- **THEN** the gesture completes as it would have from a left-button drag, or the
  game is on a recorded exemption stating why the secondary button carries its
  own meaning

## ADDED Requirements

### Requirement: Keyboard reachability is a recorded decision for every game

Every registered game SHALL either handle keyboard cursor input, or appear on an
explicit exemption list whose entry states **why** — and the exemption's reason
SHALL be in that game's spec, not only in a comment or a test fixture.

The point is not that every game must have a cursor. It is that "this game has no
keyboard" must be a decision somebody made and wrote down, rather than a
condition nobody noticed. The collection has both kinds today: three games are
direct-action, where the arrow key *is* the move and a select key would mean
nothing (Cube, Fifteen, Sokoban); Loopy has no keyboard handling at all, which it
inherited from upstream rather than chose; and Slide has a select key bound only
to walking an installed Solve route, so a keyboard player can follow the answer
and cannot play.

The check SHALL derive a game's coverage through the registry and the shared
input helpers, not by reading its `index.ts` alone: Palisade and Separate have no
direct `CURSOR_*` reference and full cursor handling, via
`border-grid.ts`'s `interpretBorderGridInput`. A check that reads one file
convicts two games that are fine, which is the failure mode where a guard is
turned off rather than fixed.

#### Scenario: A game with no keyboard handling must be on the list

- **WHEN** a registered game handles no cursor input
- **THEN** the guard fails unless that game is on the exemption list
- **AND** the exemption names the reason, which is also stated in the game's spec

#### Scenario: Cursor handling through a shared helper counts

- **WHEN** a game's cursor input is supplied by `interpretBorderGridInput` or
  another shared helper rather than by its own `CURSOR_*` branches
- **THEN** the guard recognises it as covered
