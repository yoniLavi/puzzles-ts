# ts-engine Specification Delta — audit-input-mode-parity

## ADDED Requirements

### Requirement: Touch equivalence is guarded at gesture level, not only at press level

The collection-wide touch guard SHALL cover **gestures, not only a single
press**. A press alone is not what play consists of, and it is not what the
frontend's traps break: a finger that stays within 8 px for 350 ms is delivered
as `RIGHT_BUTTON` (`detectSecondaryButton`), which kills a press-and-drag gesture
precisely when the player pauses to aim — while leaving the press itself working,
so a press-only guard passes.

The sweep SHALL therefore exercise press → drag → release sequences for every
game that handles drags, and the long-press-as-secondary case for every game
whose gesture is a drag. It SHALL fail rather than pass vacuously when no gesture
probe reaches a live target, on the same terms as the existing press sweep.

A game that sets `wantsStylusModifier` SHALL NOT be skipped by the guard, but
SHALL be asserted against the touch behaviour it declares — excluding those games
makes the two with bespoke touch handling the two that nothing checks.

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

#### Scenario: A game that asks for the stylus bit is still covered

- **WHEN** the collection-wide input guards run
- **THEN** a game setting `wantsStylusModifier` is not simply skipped, but is
  asserted against the touch behaviour it declares

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
