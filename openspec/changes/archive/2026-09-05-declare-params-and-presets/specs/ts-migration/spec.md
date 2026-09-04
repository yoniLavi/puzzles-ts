# ts-migration — deltas for declare-params-and-presets

## ADDED Requirements

### Requirement: Encoded params are byte-stable, and the guard is derived

A game's params encoding appears inside every shared game ID, so it SHALL be
held byte-stable by an assertion rather than by policy alone, and the corpus
that assertion runs over SHALL be derived from each game's own declarations
rather than authored.

The policy already existed — *existing games keep their byte-stable codecs
permanently* — and nothing enforced it. The frozen differentials cover **descs**,
not params, so a codec could have been rewritten with the whole suite green and
the breakage would have surfaced as a player's saved link resolving to a
different board.

Two guarantees, doing different jobs:

- **Encode and decode SHALL be mutual inverses** for every case in the corpus.
  This is a property, not a fixture: it survives a preset being added and cannot
  be re-baselined. It held for all 57 games on the day it was written, so it is
  asserted for all of them with **no exemption roster**.
- **The recorded encodings SHALL NOT move**, as a per-game snapshot. Re-baselining
  it is a compatibility decision that goes to the owner beforehand with the cost
  stated, not a formatting fix applied with `vitest -u`.

**The corpus SHALL be derived** — each game's presets, each of its difficulty
tiers written through its own `paramConfig` item, and one perturbation per field
of its default params — and SHALL carry a vacuity guard on both the number of
games and the number of cases. A perturbed params object is frequently invalid,
which is deliberate: the codec is asked only to be an inverse, never to be a
validator.

**A field that is the length of another field SHALL NOT be perturbed alone.**
Boats' fleet size and its list of boat sizes are one fact in two fields, so
bumping the count alone builds a params record that contradicts itself and
measures the corpus rather than the codec. The exclusion is derived from the
record's shape — a number equal to some sibling array's length — rather than
from a roster of games, so a future game with the same shape is covered the day
it lands.

#### Scenario: A changed encoding is reported before it ships

- **WHEN** a change alters the string any game encodes for reachable params
- **THEN** the byte-stability snapshot fails, naming the game and the case

#### Scenario: A codec that stops being invertible is reported

- **WHEN** a decoder stops recovering a field its encoder writes
- **THEN** the mutual-inverse assertion fails for that game, independently of
  the snapshot

#### Scenario: The guard cannot pass over an empty corpus

- **WHEN** the registry is unpopulated, or a game contributes no cases
- **THEN** the vacuity guard fails rather than every downstream assertion
  passing over nothing
