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
registered game, and SHALL fail rather than pass vacuously when no gesture probe
reaches a live target, on the same terms as the existing press sweep.

The sweep SHALL be **frontend-faithful**: it sends the drag and release only when
the press was consumed, because `view-interactive.ts` installs `pointerTracking`
only `if (consumed)`. A sweep that sent the drag regardless would score a game
whose press returns `null` — the shipped Galaxies left-drag defect, where every
drag frame was silently dropped — as healthy.

A game that sets `wantsStylusModifier` SHALL NOT be skipped by the guard, but
SHALL be asserted against the touch behaviour it declares — excluding those games
makes the two with bespoke touch handling the two that nothing checks.

#### Scenario: A drag gesture is equivalent from a finger

- **WHEN** a press, drag and release sequence is delivered from touch to a game
  that handles drags
- **THEN** the resulting board state matches the same sequence delivered from a
  mouse

#### Scenario: A game that asks for the stylus bit is still covered

- **WHEN** the collection-wide input guards run
- **THEN** a game setting `wantsStylusModifier` is not simply skipped, but is
  asserted against the touch behaviour it declares

### Requirement: A game with no secondary meaning is not given a synthetic one

A game that never consumes `RIGHT_BUTTON` SHALL declare
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
only if it consumes `RIGHT_BUTTON` nowhere on a real board — so the declaration
can neither be forgotten by a new game nor left behind by a game that grows a
secondary meaning. It SHALL ask whether the button was *consumed* rather than
whether the board changed: a secondary meaning is often an eraser, which
correctly changes nothing until there is something to erase.

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

#### Scenario: The declaration cannot drift from the behaviour

- **WHEN** a registered game consumes `RIGHT_BUTTON` somewhere on its board
- **THEN** the guard fails if that game declares `ignoresSecondaryButton`
- **AND** when a game consumes it nowhere, the guard fails if it does not

### Requirement: The gesture layer's own decisions are tested

`detectSecondaryButton` SHALL have direct tests, separate from the per-game
sweeps. A per-game guard that hands a game a synthetic `RIGHT_BUTTON` proves the
game copes with the decision; it cannot prove the decision was the right one, and
those are two different guarantees.

The tests SHALL cover the numbers the gesture arbitrates, because each is a
behaviour rather than a constant: the hold window, the drag threshold and a
wobble inside it, a pointer type that is not touch, both affordances disabled,
the two-finger tap from either finger's release, and the second finger's **timer
reset** — which is what makes the documented worst case twice the hold time.

They SHALL also cover `unhandledEvent`, since the view replays it: without that,
a tap faster than the detection round trip loses its release entirely, and any
state the puzzle shows only while a press is held stays on screen.

#### Scenario: A stationary finger past the hold window is secondary

- **WHEN** a touch press stays within the drag threshold for longer than the hold
  time
- **THEN** the detector reports the secondary button

#### Scenario: A finger that moves is not

- **WHEN** a touch press moves beyond the drag threshold before the hold time
- **THEN** the detector reports the primary button, and hands back the move event
  it consumed so the view can replay it

### Requirement: Keyboard reachability is a recorded decision for every game

Every registered game SHALL either handle keyboard cursor input, or appear on an
explicit exemption list whose entry states **why** — and the exemption's reason
SHALL be in that game's spec, not only in a comment or a test fixture.

The point is not that every game must have a cursor. It is that "this game has no
keyboard" must be a decision somebody made and wrote down, rather than a
condition nobody noticed.

Handling a cursor key is necessary and not sufficient: the guard SHALL also
assert that some **keyboard-only sequence commits a move**, because a cursor that
goes everywhere and does nothing is not a keyboard. That probe SHALL allow
multi-step sequences, since several games pick a piece up with one select and put
it down with a second (Pegs, Map, Rectangles, Samegame, Signpost, Slide,
Untangle), and a single-keypress probe scores every one of them deaf.

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

#### Scenario: A cursor that cannot act is not a keyboard

- **WHEN** a game moves a cursor in response to the arrow keys but no
  keyboard-only sequence changes the board
- **THEN** the guard fails

### Requirement: Every on-screen key a game offers reaches that game

For every game declaring `requestKeys`, the suite SHALL assert that each returned
button is one the game's `interpretMove` actually consumes somewhere on a real
board. On touch the key panel is the only character-entry route there is, so a
panel key that reaches nothing is an input a touch player cannot make at all.

This is the **reverse direction** of the emittable-key scan, and neither
substitutes for the other: that scan asks whether a code a game *tests* can be
sent, and this asks whether a code the frontend *sends* is received.

The probe SHALL prime the board before convicting a key — a "Clear" key on an
already-empty cell is a legitimate no-op, and scoring that as dead wrongly
convicts every keypad game. A key that is genuinely unreachable SHALL be recorded
in the guard as a finding under management, naming the change that owns it,
rather than silently excluded.

The count of games with a panel SHALL carry a floor that only moves up, because a
game that *loses* its `requestKeys` hook makes every one of its on-screen keys
unreachable at once — the largest version of this defect, and the one a per-key
sweep structurally cannot see.

#### Scenario: A panel key the game ignores fails the suite

- **WHEN** a game's `requestKeys` returns a button its `interpretMove` never
  consumes
- **THEN** the guard fails, naming the key and the game

#### Scenario: A clear key on an empty board is not a finding

- **WHEN** the probe tests a key whose only effect is to erase
- **THEN** it first writes something for that key to erase, rather than reporting
  the key as unreachable

### Requirement: The on-screen key panel is a second key emitter

A guard reasoning about which button codes this frontend can deliver SHALL
account for **both** emitters: `puzzleKeyMap` in the interactive view, and the
buttons a game's own `requestKeys` puts on the on-screen panel, which
`puzzle-keys` sends straight to `Puzzle.processKey`.

The set SHALL be computed **per game**, not as a union over the collection. The
clear key's button is `8` — upstream's `'\b'`, which `puzzleKeyMap` never sends —
so it is reachable in a game that offers it on its keypad and unreachable in a
game with no keypad at all. A union would excuse exactly the dead bindings the
scan exists to find.

A scan for a button compared against an unsendable code SHALL cover
`switch (button) { case <code>: }` as well as `button === <code>`. A `case` label
is neither a comparison nor a declaration, and one survived the collection-wide
erase-key sweep in that form: Unruly's gate admitted `DELETE` through
`isEraseKey` and its switch matched only `8`, so the key read as wired at every
level and was dead at the last one.

#### Scenario: A dead binding inside a switch is caught

- **WHEN** a game contains `switch (button)` with a `case` label for a control
  code neither the key map nor that game's own panel can send
- **THEN** the scan reports it, naming the file and line

#### Scenario: The clear key is emittable only where it is offered

- **WHEN** the scan evaluates a comparison against button `8`
- **THEN** it is accepted in a game whose `requestKeys` includes the clear key,
  and reported in a game that declares no keypad

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
and handle the bit itself. **Pattern and Loopy** are those games: neither has a
right button available to a finger, so a touch press cycles a cell (Pattern) or
an edge (Loopy) through its states rather than simply filling it.

*This requirement previously said "Pattern is the only such game". It was true
when written and stopped being true when Loopy landed — nothing failed, because
**a count in a spec is a fact that goes stale silently**. Prefer naming the
members to counting them, and where a count is unavoidable, give it a guard.*

#### Scenario: A touch press plays the game

- **WHEN** a press arrives with `MOD_STYLUS` set, for a game that has not set
  `wantsStylusModifier`
- **THEN** the game interprets it exactly as it interprets the same press from a
  mouse

#### Scenario: A game may still ask for the stylus bit

- **WHEN** a game sets `wantsStylusModifier` and a touch press arrives
- **THEN** `interpretMove` receives the button with `MOD_STYLUS` still set
