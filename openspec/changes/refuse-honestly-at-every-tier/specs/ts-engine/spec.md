# ts-engine — deltas for refuse-honestly-at-every-tier

## ADDED Requirements

### Requirement: The hint walk SHALL cover every preset a game offers

The cross-game guarantee that following hints solves the board, from any reached
position, SHALL be asserted over **every leaf preset** of every hinting game, not
over one of them.

It was asserted over `firstLeaf(game.presets())` — by convention the smallest and
easiest board a game offers — for thirty games. The guard therefore had never
seen a Hard board, an `Unreasonable` board, or any mode variant, while reading as
the collection's strongest hint guarantee. Widened (2026-09-08) it walked **209
preset cases** and reported thirteen refusals that the narrow form could not
reach, all of them a real finding.

The sweep SHALL carry a vacuity count of preset cases walked, and its cost SHALL
be tiered rather than paid per commit — with the per-commit slice keeping at
least one preset per declared tier, because tier is the axis the narrow form was
blind to and a slice that falls back to the first leaf restores the blindness it
exists to remove.

#### Scenario: A hint works on Easy and gives up on Hard

- **WHEN** a game's hint cannot walk a board dealt from a preset at a
  deduction-complete tier
- **THEN** the walk fails, naming the game, the preset and the position

#### Scenario: A game gains a preset

- **WHEN** a preset is added to a game's menu
- **THEN** it is walked from that commit, with no line added anywhere to enroll
  it

### Requirement: Deduction running out on a sound board SHALL have one wording

A hinting game that finds no move on a board which is sound, unsolved and free of
mistakes SHALL refuse with the collection's single constant for that situation,
and SHALL NOT invent a phrasing, alias the constant, or spell out its value.

**There is one situation here, not two, and that is a measurement.** Two
constants existed — one bare, one naming trial and error — and the distinction
between them was asserted rather than observed. Walking every preset of every
hinting game found thirteen refusals and **every one was on a board whose tier
permits search**; nothing refused on a deduction-complete tier at any size or in
any mode. A game whose tiers are all deduction-complete cannot reach this refusal
at all, so a wording that hedges about whether trial and error is expected
describes a state no player occupies.

The wording SHALL tell the player that the position is the tier's expected end
and what to do about it. A refusal that says only that nothing follows leaves a
player unable to distinguish a puzzle demanding a guess from a broken hint, which
is the pair `help/features.md` § Hints teaches as calling for opposite responses.

**Shared modules SHALL import the constant, never retype its value.**
`candidate-hint.ts` returned the bare refusal as a string literal, which is why
the whole candidate family carried a wording no grep for the constant's name
could find. A guard SHALL sweep for the *values* of the refusal constants, not
only their names.

**A refusal SHALL be reachable only where the game's own tier declaration permits
search.** The permission is derived — a tier named `Unreasonable` is the
collection's promise that its boards may need search — never declared for a
guard's benefit. A hinting game with no difficulty contract SHALL NOT be able to
emit this refusal, and the guard SHALL assert that rather than skipping such a
game.

#### Scenario: A player exhausts deduction on a search-permitting board

- **WHEN** a hint is asked on a sound, unsolved board dealt at a tier whose name
  promises search
- **THEN** the refusal is the single constant, and it says what the player can do

#### Scenario: A game invents a phrasing

- **WHEN** a game returns its own sentence for deduction having run out
- **THEN** the refusal guard fails, whether the sentence is written at the game's
  call site or inside a shared module

#### Scenario: A refusal escapes onto a deduction-complete tier

- **WHEN** a hint refuses on a board dealt at a tier that does not permit search
- **THEN** the walk fails — the defect is the refusal, not the wording
