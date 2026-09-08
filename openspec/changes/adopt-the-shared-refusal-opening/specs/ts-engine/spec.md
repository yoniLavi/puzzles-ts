# ts-engine — deltas for adopt-the-shared-refusal-opening

## ADDED Requirements

### Requirement: A deductive hint SHALL open with the shared refusal pair

A game whose `hint()` refuses a finished board with `ALREADY_SOLVED` and a
mistaken board with `FIX_MISTAKES_FIRST` SHALL reach both through
`commonHintRefusal` rather than writing the pair itself.

Two rules live in that opening and are invisible at each hand-written copy. The
refusals SHALL be asked **in order** — a finished board is not a wrong board, and
asking the second first reports a mistake on a board the player has completed.
And `FIX_MISTAKES_FIRST` **promises a highlight**, so it SHALL be emitted only
where the game has already established there is something to highlight, never
speculatively. In the helper both are structural; in fifteen copies each was a
chance to get one wrong silently, and nothing would have said so.

`commonHintRefusal` took **booleans rather than a state** for a reason that still
holds: `completed` lives under a different name in several games, `findMistakes`
is each game's own, and a helper taking the `Game` could not be called from
inside the very `hint` that object is being built from.

**Two escapes, and both are answers about the puzzle.** A game whose board can be
inconsistent *without any single entry being provably wrong* owes
`CONTRADICTION_UNLOCALIZED` instead of `FIX_MISTAKES_FIRST`, because the promised
highlight would never appear; it writes the explicit form and says why at the
site. A game with no mistake concept at all owes only the first refusal, and one
line is already the whole of it.

**The helper SHALL NOT grow a parameter for the second message.** A parameter
that exists so two games can pass a different constant converts a convention into
a configuration language, which is what a first-class override exists *instead*
of (`AGENTS.md` § "Convention over configuration": the override is the explicit
form plus a stated reason, not a knob).

**Enrollment SHALL be derived and the declines SHALL be a ledger.** The guard
finds the games that emit both constants by reading their source and requires
them to reach both through the helper; the games that legitimately do not are
listed *in the guard*, one entry per game with its reason, and the derivation
asserts the ledger is exactly right. A skip list nothing derives rots the way
every enrollment roster in this repo has.

#### Scenario: A game hand-writes the pair

- **WHEN** a game returns `ALREADY_SOLVED` for a finished board and
  `FIX_MISTAKES_FIRST` for a mistaken one without calling `commonHintRefusal`
- **THEN** the guard fails, naming the game

#### Scenario: A game owes a different second refusal

- **WHEN** a game's board can be inconsistent with no entry provably wrong
- **THEN** it emits `CONTRADICTION_UNLOCALIZED`, writes the reason at the site,
  and appears in the guard's ledger — which the derivation checks is exactly the
  set that did not adopt

#### Scenario: A new hinting game arrives

- **WHEN** a game gains a `hint()` that refuses on both a finished and a mistaken
  board
- **THEN** it is required to use the helper from that commit, with no line added
  anywhere to enroll it
