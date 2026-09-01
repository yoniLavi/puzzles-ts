# ts-engine Specification Delta — unify-cross-game-vocabulary

## MODIFIED Requirements

### Requirement: The engine uses a clean TS-native save format

The midend SHALL serialise and restore a game using a clean,
versioned TypeScript-native format (a version-tagged envelope carrying
the puzzle id, parameters, game id, the move list, timer elapsed, and
checkpoints). Restoration SHALL reconstruct history by replaying the
saved moves. The format SHALL NOT be required to be compatible with
the C `midend_serialise` format, and loading a pre-pivot C-format save
SHALL NOT be required (consistent with the `ts-migration` decision
that old saves and pre-pivot shared IDs are expendable). Saving and
restoring SHALL round-trip: a restored game SHALL have the same state
and history as the saved game.

The envelope SHALL spell the solver-was-used flag as every game's state spells
it (see "One completion vocabulary across games"), so that one word means one
thing from a game's state through to the saved bytes.

**A version bump SHALL come with an upgrade, not a rejection**, whenever the
older shape carries the same facts: the decoder SHALL lift an older envelope to
the current shape before validating it, so an existing save keeps working. The
validator SHALL then describe only the current shape, so it cannot drift into
blessing both. An envelope the decoder cannot lift — a *future* version, or an
older one whose fields are missing or malformed — SHALL still be rejected.

#### Scenario: Save/restore round-trips

- **WHEN** a TS-engine game is saved and then restored from that data
- **THEN** the restored game has identical state, move history, and
  redo availability
- **AND** the saved payload carries a format version field

#### Scenario: C-format save is not required to load

- **WHEN** a payload produced by the pre-pivot C-serialisation path is
  presented to the TS midend
- **THEN** the midend is NOT required to load it
- **AND** this is not treated as a defect

#### Scenario: An older envelope is upgraded, not discarded

- **WHEN** a save written under the previous envelope version is loaded
- **THEN** it is lifted to the current shape and restores normally
- **AND** the retired field name is gone from the result rather than carried
  alongside the new one

#### Scenario: An envelope that cannot be lifted is still rejected

- **WHEN** the payload names a version the decoder does not know, or an older
  version whose fields are missing or of the wrong type
- **THEN** decoding fails

### Requirement: The engine provides a shared cursor button-to-delta helper

The engine SHALL provide `cursorDelta(button: number): { dx: number; dy: number }
| null` in `src/engine/pointer.ts`, returning the unit grid delta for the
four cursor-direction buttons (`CURSOR_UP` → `{0,−1}`, `CURSOR_DOWN` → `{0,+1}`,
`CURSOR_LEFT` → `{−1,0}`, `CURSOR_RIGHT` → `{+1,0}`) and `null` for any other
button, plus an `isCursorMove(button: number): boolean` predicate (true iff the
button is one of the four cursor-direction keys).

For the common case of an axis-aligned bounded grid, the engine SHALL also
provide `gridCursorMove(button: number, x: number, y: number, w: number, h:
number, wrap?: boolean): { x: number; y: number } | null` in the same module,
returning the new cursor coordinates after applying the button's delta — clamped
to `[0, w) × [0, h)` when `wrap` is false (the default) or wrapped toroidally when
`wrap` is true — or `null` when the button is not a cursor key or the move is a
no-op against a clamped edge. `gridCursorMove` SHALL be **position-only**: it
returns coordinates and never owns or mutates a game's `ui`.

`gridCursorMove` is the primitive beneath the shared cursor, not the interface a
game reaches for. A game holding an ordinary bounded-grid cursor SHALL drive it
through `moveCursor` (see "One keyboard-cursor vocabulary across games"), which
owns the position, the reveal and the changed-tracking together. `cursorDelta`
and `gridCursorMove` remain for a **traversal** that is not a bounded clamp —
obstacle-skipping, lock modes, half-cell coordinates, non-positional rolling
cursors — and for whatever a game does *while* the cursor moves.

#### Scenario: A cursor key yields its unit delta

- **WHEN** a game calls `cursorDelta(CURSOR_LEFT)`
- **THEN** it receives `{ dx: -1, dy: 0 }`

#### Scenario: A non-cursor button yields null

- **WHEN** a game calls `cursorDelta(LEFT_BUTTON)`
- **THEN** it receives `null`, and the game falls through to its other input
  handling

#### Scenario: A bounded-grid cursor move clamps at the edge

- **WHEN** a game calls `gridCursorMove(CURSOR_LEFT, 0, 3, w, h)` with the cursor
  already at the left edge and `wrap` defaulting to false
- **THEN** it receives `null` (no-op at the clamped edge), and the game makes no
  cursor change
- **AND** the same call one column in (`x = 1`) returns `{ x: 0, y: 3 }`

#### Scenario: A toroidal cursor move wraps

- **WHEN** a toroidal game calls `gridCursorMove(CURSOR_LEFT, 0, 3, w, h, true)`
- **THEN** it receives `{ x: w - 1, y: 3 }`

#### Scenario: A game that reinvented the clamp adopts the helper

- **WHEN** the engine ships `gridCursorMove`
- **THEN** the former local clamp helpers (`fifteen`'s `moveCursorClamped`,
  `sixteen`'s `moveCursor`) are deleted in favour of it
- **AND** no positional-cursor game carries its own bounded/toroidal clamp copy

## ADDED Requirements

### Requirement: One keyboard-cursor vocabulary across games

A game with a keyboard cursor SHALL hold it in the engine's shared cursor
shape — a position and a visibility flag — under one canonical `Ui` field,
rather than naming either itself. The engine SHALL provide that shape and the
verbs for it: constructing one, moving it, revealing it and hiding it.

A **plain** arrow press SHALL reveal the cursor **and** move it, so a keyboard
player never spends a keypress on the reveal. A pointer press SHALL hide it.
Where an arrow is *itself an action on the board* — a modified arrow that marks,
a mode in which the arrow slides the grid — a first press on a hidden cursor MAY
reveal without acting, because a player who cannot see the cursor cannot see
where the action would land; the plain arrow beside it SHALL still reveal and
move.

What a game does *while* the cursor moves SHALL remain entirely its own: a game
may paint, fill a line, or refuse a step, and the shared shape SHALL NOT grow to
cover any of it. A genuinely different **traversal** — half-cell coordinates,
corner-skipping, a lock mode — likewise stays per-game, and a helper for one
SHALL be named apart from the shared verb so neither shadows the other. A game
MAY carry an extra flag *beside* the cursor where it draws a real distinction
the shared shape does not (which device revealed it; what it is armed for). The
shared part is the noun; the verb is the game's.

The engine SHALL fail the build for a cursor held anywhere but the canonical
field. That check SHALL find it **structurally** — by the shape, read off the
engine's own constructor, over every game's real `newUi` output — rather than by
matching names, so an eleventh spelling is caught as surely as the ten that
preceded it. A game SHALL NOT re-declare an engine cursor helper, which is
enforced from `pointer.ts`'s own export list.

#### Scenario: One arrow press both reveals and moves

- **WHEN** a player presses an arrow key on a board whose cursor is hidden
- **THEN** the cursor becomes visible **and** has moved one cell

#### Scenario: An arrow that acts on the board still reveals first

- **WHEN** a player presses a modified arrow that would mark or slide, on a
  board whose cursor is hidden
- **THEN** the cursor becomes visible and the board is unchanged

#### Scenario: A game keeps what it does while moving

- **WHEN** a game paints or fills as its cursor traverses
- **THEN** that behaviour is unchanged by the shared cursor shape, which reports
  only where the cursor is and whether it is visible

#### Scenario: A cursor under any other field fails the build

- **WHEN** a game holds a cursor-shaped object under a field of its own naming
- **THEN** the guard fails, naming the game and the field — without having been
  told that name in advance

### Requirement: One completion vocabulary across games

Every game's state SHALL express "the player has solved this" and "a solver was
used" under the same two names, so that the engine can derive from them rather
than sniffing each game's spelling.

The convention SHALL be: flash once when a **player move** brings the board into
a solved state. What is suppressed is the Solve *command* — the move on which
"a solver was used" flips false→true — and **not** a board that has ever been
cheated. A player who uses Solve, unmakes some of it, and finishes by hand has
won; the record that they used the solver survives in the status bar and in the
midend's solved-with-help status, which is where it belongs.

Whether a game can reach that case is the game's own business: it requires
"solved" to be **recomputed** on each move rather than latched once. A game that
latches it simply never presents the case, and the shared helper SHALL behave
for it exactly as the stricter condition did.

Any game whose win celebration is that convention SHALL use the shared helper
rather than restating the condition. A game MAY keep its own celebration hook, but only
for a genuine difference: more than one flashing outcome, a duration that is not
the shared one, a condition that is not "became solved", or a completion that is
not a flag at all. **A differently spelled flag SHALL NOT be a reason to keep
one**, because it is not a difference a player can see. The engine SHALL keep
the surviving exceptions listed with their reasons, so the list cannot grow
without someone stating one.

A game whose state genuinely lacks one of the two — because it has no solver, or
computes completion rather than storing it — SHALL have that absence recorded
**per field**, and the record SHALL be checked against the games: an exemption
for a field the game actually has SHALL fail, so the list cannot decay into a
blanket that hides a later removal.

The engine's own save envelope is **not** governed by this requirement. Its
solver-was-used key is a persisted wire name, so changing it breaks saved games;
that is a player-visible compatibility decision and belongs to the owner, not to
a vocabulary sweep.

#### Scenario: The convention is not restated

- **WHEN** a game's win flash is the collection's convention
- **THEN** it calls the shared helper, and contains no hand-written copy of the
  transition condition

#### Scenario: A manual completion after a Solve still celebrates

- **WHEN** a player uses Solve, unmakes part of it, and completes the board by
  hand, in a game that recomputes rather than latches "solved"
- **THEN** the flash plays, and the solver-was-used record is unaffected

#### Scenario: The Solve command itself does not celebrate

- **WHEN** the Solve command completes the board
- **THEN** no flash plays

#### Scenario: A genuine celebration keeps its own hook

- **WHEN** a game flashes on more than one outcome, or for a different duration
- **THEN** it keeps its own hook, and records which of those reasons applies

#### Scenario: A re-spelled flag fails the build

- **WHEN** a game declares one of the retired spellings on its state
- **THEN** the guard fails, naming the file and line

#### Scenario: A stale exemption fails the build

- **WHEN** a game is recorded as lacking one of the two flags but in fact has it
- **THEN** the guard fails, so the exemption list cannot outlive its reason
