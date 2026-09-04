# ts-engine — deltas for derive-the-type-menu-summary

## ADDED Requirements

### Requirement: A game's config field is spelled the same everywhere it is named

A `paramConfig` item's `kw` SHALL be the same string the game's `describeParams`
emits for that field, because the two are joined by key wherever a value is
rendered with its declared name.

Loopy spelled its difficulty item `diff` while `describeParams` emitted
`difficulty`. Nothing failed: the Custom dialog reads the item and the type
header read the value, and neither had occasion to look the other up — until the
header started resolving names from the declaration, at which point the join
missed and it rendered a raw tier index. `difficultyChoiceItem` matches the `kw`
by prefix (`/^diff/`) precisely so a variant spelling stays *enrolled*, which is
a different guarantee from the two spellings being *joinable*.

A game with a genuine reason to differ states the mapping explicitly rather than
relying on the keys happening to match.

#### Scenario: A field named in two places uses one spelling

- **WHEN** a game declares a `paramConfig` item and emits the same field from
  `describeParams`
- **THEN** both use the same key, so a lookup by that key resolves
