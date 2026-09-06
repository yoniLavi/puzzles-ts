# ts-engine spec delta

## ADDED Requirements

### Requirement: A shared mechanic is joined by having it, not by declaring it

A game SHALL join a shared engine mechanic by **having** it — registering the
object, carrying the `Ui` fields, declaring the method, calling the arm — and a
cross-game guard SHALL derive its population from what the game *is* rather than
from a roster of opted-in names. A game SHALL NOT be required to add itself to a
list in order to be guarded.

The enrollment fact SHALL be one of: the registered game object (a member's
presence, a flag's value), the `Ui` its `newUi` returns, or the game's own
source with comments removed. `src/engine/testing/enrollment.ts` SHALL be the
shared way to ask those questions, and a guard needing one of them SHALL use it
rather than re-deriving the population.

Every derived sweep SHALL assert a floor on **the population it drew from**, not
only on the set it filtered out of that population.

Where the derived set legitimately contains members the guard's rule must not
apply to, the guard SHALL record them as a **ledger in the guard** — one entry
per member, each carrying its reason — and SHALL assert that the ledger equals
what the derivation found. A ledger entry SHALL NOT be the enrollment key: the
derivation says which games are members, and the ledger says only why a member
is excused. An empty ledger is a valid and meaningful assertion.

#### Scenario: A newly ported game joins every guard for its capabilities

- **WHEN** a game is registered that declares `hint()`
- **THEN** it is covered by every cross-game hint guard, including the
  necessity-voice rule, without any list being edited

#### Scenario: A derived sweep that found nothing fails rather than passing

- **WHEN** the registry a cross-game guard draws from is empty or short
- **THEN** the guard fails on the population floor rather than reporting health
  over an empty set

#### Scenario: A ledger entry that has stopped being true fails

- **WHEN** a guard's exemption ledger names a game the derivation no longer
  places in the exempt set
- **THEN** the guard fails, naming the stale entry

### Requirement: A boolean capability declaration is held to the behavior it claims

The `Game` interface MAY carry a boolean capability flag **only** where a
production consumer needs the answer synchronously and cannot observe it. Every
such flag SHALL be asserted equal to a derivation of the fact it declares, so a
flag that is forgotten, left behind by a changed game, or simply wrong fails a
test rather than going unnoticed.

The three flags the contract carries SHALL be held as follows:

- `ignoresSecondaryButton` SHALL be set if and only if the game consumes no
  `RIGHT_BUTTON` press anywhere on its board.
- `canMarkAll` SHALL be set if and only if the game's `interpretMove` returns a
  move for an `M` press.
- `wantsStylusModifier` SHALL be set if and only if the game's own code reads
  `MOD_STYLUS`.

A flag whose effect is to **disable** a guard SHALL carry such a check, because
nothing else observes it when it lies.

A source scan standing in for one of these derivations SHALL read the game's
code with comments removed: a mention in prose is not a use.

#### Scenario: A flag declared without the behavior fails

- **WHEN** a game sets `wantsStylusModifier` but its code never reads
  `MOD_STYLUS`
- **THEN** the touch guard fails, reporting that the game is exempt from the
  touch-parity sweep for nothing

#### Scenario: A game documenting the absence of a behavior is not convicted

- **WHEN** a game's source mentions `MOD_STYLUS` only in a comment explaining
  that it deliberately has no stylus branch
- **THEN** the guard does not treat that mention as a read

### Requirement: The engine catalog names every shared helper there is

`docs/games/engine-catalog.md` SHALL carry an entry for every module under
`src/engine/`, so the menu a game author consults before re-rolling a helper
cannot silently shrink. A module deliberately without its own entry SHALL be
recorded in a ledger carrying its reason, and that ledger SHALL fail when it
names a module that no longer exists.

The check SHALL run in the pre-commit gate's fast prefix, ahead of the
documentation-only shortcut, and SHALL NOT be a vitest file — a test reading
`docs/` would make that shortcut unsafe (`repo-layout`).

#### Scenario: A new engine module ships without a catalog entry

- **WHEN** a module is added under `src/engine/` and the catalog is not updated
- **THEN** the gate fails, naming the module and pointing at the catalog

#### Scenario: A documentation-only commit deleting an entry is still checked

- **WHEN** a commit touches only `docs/` and removes a module's catalog entry
- **THEN** the check still runs, because it sits ahead of the documentation-only
  shortcut

### Requirement: The necessity-voice rule applies to every hinting game not ledgered as narrating moves

The cross-game narration guard SHALL derive the games subject to the
necessity-voice rule as **every game that ships a `hint()`**, minus a ledger of
games whose hints narrate *moves* rather than deductions, each carrying its
reason. A game SHALL NOT have to be added to a list to be necessity-checked.

An owner-endorsed per-game idiom, exempting narration that carries necessity in
its own words rather than a modal, SHALL be a predicate over the **step** rather
than over its text alone, so an idiom belonging to one leg of a grouped journey
can say so and be held to it. An idiom SHALL be rejected for a game the
necessity rule does not apply to, since such an entry does nothing.

Words that any game could reasonably write to make a necessity claim belong to
the shared vocabulary, not to a per-game idiom.

#### Scenario: A hinting game not named anywhere is necessity-checked

- **WHEN** a game ships a `hint()` and appears in no list
- **THEN** its narration is held to the necessity-voice rule

#### Scenario: An idiom scoped to a continuation leg does not excuse a lead leg

- **WHEN** an endorsed idiom is declared for a game's continuation legs and a
  lead leg is worded the same way
- **THEN** the lead leg is still required to carry necessity of its own
