# app-shell — deltas for derive-the-type-menu-summary

## ADDED Requirements

### Requirement: The type header names an option by the name the game declares

The custom-configuration summary in the type header SHALL render a `choices`
field's value using that field's declared `choicenames` — the option names the
midend builds from the game's own `paramConfig` — and SHALL NOT carry a second,
hand-written copy of them.

A template token that spells its own options (`{allow-loops:|, no loops}`) is
**presentation shaping**: punctuation, a leading space, an empty branch. It has
no other source and stays. A token that names a choices field with no option
list (`{difficulty}`) resolves from the declaration. The distinguishing test is
whether the spelled list is identical to the declared names: if it is, it is a
copy, and a copy can only ever be right by coincidence.

Twenty-four hand-typed lists existed when this was written, and **19 of the 21
games whose header named a difficulty named one the game does not have** —
Bricks rendered three tier words for two tiers, and Loopy rendered a raw tier
index because its `paramConfig` spelled the field `diff` while the value it was
looked up by was `difficulty`. The Custom dialog was correct throughout, because
it had always read the declared names; the header beside it disagreed.

**A game that declares tiers SHALL name the tier in its summary.** Clusters and
Salad omitted the field entirely, so a custom board gave the player no way to
tell which tier they were on.

#### Scenario: A tier renders as its declared name

- **WHEN** a summary is rendered for params at any tier of any tiered game
- **THEN** the text contains that tier's declared name

#### Scenario: A wrong, reordered or miscounted tier list is reported

- **WHEN** a template spells a tier list that differs from the game's declared
  names in wording, order, or length
- **THEN** the check fails, naming the game and the tier

#### Scenario: The check cannot pass over nothing

- **WHEN** no game is reached, or no tier is rendered
- **THEN** the vacuity guard fails rather than the sweep reporting health

### Requirement: A summary check asserts the rendered word, not merely that a token was replaced

The guard over type-header summaries SHALL compare rendered text against the
declaring source, not only assert that no `{field}` placeholder survives.

The placeholder check existed and stayed green throughout, because **substituting
the wrong word is still substituting**: it measured a neighbor of the property it
was meant to protect. Both checks are kept — an unsubstituted token and a wrongly
substituted one are different defects — but the second is the one that catches a
tier list drifting from the game it describes.

#### Scenario: A substituted-but-wrong word is caught

- **WHEN** a template substitutes a word that is not the declared name
- **THEN** the guard fails, even though no placeholder survives
