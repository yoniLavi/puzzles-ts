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

**Every builder of a `hint()` SHALL import the constants, shared ones included,
and SHALL NOT retype their values.** `candidate-hint.ts` — which is the whole
`hint()` of eleven candidate games — held literal copies of **three** of the
seven refusal constants while its own doc comment described them as shared "so a
wording tweak lands in one place". It was one place, and not the same one place
as the other 21 games'; a change to either half would have left the other lying,
and no grep for a constant's *name* could see it.

**The guard that scans for stray refusals SHALL read the engine's hint builders
as well as `src/games/`.** It already keys on the right *shape* — every
`{ ok: false, error: <string literal> }` in the AST, deliberately a superset —
and still missed a third of the collection's refusals by scanning the wrong
*place*. A refusal lives wherever a `hint()` is built, and eleven of them are not
built under `games/`.

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

#### Scenario: A shared hint builder inlines a refusal

- **WHEN** a module under `src/engine/` that builds a `hint()` writes a refusal
  as a string literal rather than importing the constant
- **THEN** the refusal guard sees it and fails, because its scan covers the
  engine's hint builders and not only `src/games/`

#### Scenario: A refusal escapes onto a deduction-complete tier

- **WHEN** a hint refuses on a board dealt at a tier that does not permit search
- **THEN** the walk fails — the defect is the refusal, not the wording
