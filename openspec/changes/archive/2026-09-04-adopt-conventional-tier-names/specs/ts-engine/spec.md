# ts-engine — deltas for adopt-conventional-tier-names

## ADDED Requirements

### Requirement: Difficulty tier names come from one collection-wide scale

A tiered game SHALL name its tiers from the collection's scale by position,
rather than choosing words of its own. The scale, easiest first, is **Easy ·
Normal · Tricky · Hard · Extreme**, and a game with `n` tiers takes the first
`n`. `tierNames(n)` in `engine/difficulty.ts` is that projection and SHALL be the
only definition a game writes.

**Position and name SHALL be a bijection across the collection.** "Tricky" is the
third rung in every game that has one; "Normal" the second. This is the property
the convention exists for: before it, the 29 tiered games had chosen twelve
different words with no decision behind the spread — the six three-tier games
used six different vocabularies, the eleven two-tier games five, and "Tricky" was
the second rung in six games and the third in three others, so the word carried
no meaning between games.

**`Unreasonable` SHALL NOT be issued by position.** It is not a rung of the scale
but a promise about one — reserved by "A tier whose boards can require Search
SHALL be named `Unreasonable`" — so `tierNames(n, { search: true })` replaces the
top name with it on the game's declaration that its hardest rung searches. A
two-tier game whose harder rung backtracks is `Easy · Unreasonable`; a six-tier
game whose top rung is a bounded tactic never acquires the word.

`tierNames` SHALL refuse a count the scale cannot name rather than returning a
short list. A truncated list would leave a game with fewer names than tiers, and
every cross-game guard iterates the names — so the shortfall would surface as
guards quietly covering fewer tiers, not as an error.

**An override SHALL remain first-class**, declared in the change that needs it. A
tier already declared in `nonUniqueTiers` is exempt automatically and SHALL NOT
be listed anywhere else: Dominosa's "Ambiguous" is a relaxation of what the
puzzle promises rather than a difficulty, and it already says so for its own
reasons. Deriving the exemption from that declaration rather than from a roster
keeps the guard's exception list from going stale as quietly as a membership list
would.

Adopting the convention SHALL NOT change any board, any tier index, any params
encoding, or any generated puzzle. `DIFF_CHARS` maps a tier *index* to a
character, so every existing game ID and saved game continues to decode to the
same board at the same tier; only the word on the menu moves. A differential
fixture that moves under a renaming means the rename reached code it should not
have.

**A game's internal `DIFF_*` constant names are solver rung labels, not tier
names**, and SHALL NOT be read as the player-facing list. They were already
unreliable — Solo declares eight and offers six — and under the convention they
routinely differ, as Unruly's `DIFF_TRIVIAL` naming a tier a player sees as
"Easy". The rung labels stay because the solvers and the differentials are
written in them.

#### Scenario: A new game declares its difficulty tiers

- **WHEN** a game with `n` difficulty tiers is implemented
- **THEN** it calls `tierNames(n)` — or `tierNames(n, { search: true })` when its
  hardest rung can require Search — rather than authoring names
- **AND** it inherits the collection's vocabulary without a decision to make

#### Scenario: A game's tier names drift from the scale

- **WHEN** a game names a tier off the scale, or out of position
- **THEN** `difficulty-contract.test.ts` fails, naming the game and the
  conventional list it should have used
- **AND** the game either adopts the convention or declares an override with its
  reason, rather than the guard being relaxed

#### Scenario: A preset title names a difficulty

- **WHEN** a preset's title uses one of the collection's difficulty words
- **THEN** it SHALL be that preset's own tier
- **AND** a title that names no difficulty at all is permitted — Salad's presets
  name a symbol range, Solo's Killer preset names its mode — so the rule is a
  prohibition rather than a requirement, and needs no exemption roster
- **AND** preset titles SHALL derive their tier word from the game's tier list
  rather than restating it, because a restated word is a copy that no test reads
  and that goes stale silently: Solo's menu offered "3x3 Intermediate" while its
  Custom dialog offered "Tricky", with the whole suite green

#### Scenario: The guard is mistaken for a check on the Search promise

- **WHEN** a game's tier list ends in `Unreasonable` and the guard passes
- **THEN** that is evidence about the *shape* of the list only
- **AND** it is **not** evidence that the tier has earned the name, because
  `search` is read from the game's own top name and "this rung is a Search" is a
  judgment about the code that no test can read off it
