# adopt-conventional-tier-names

**Owner directive, 2026-09-04**: *"I want consistency and
convention-over-configuration where it makes sense. As such, I don't want every
new game to come up with names for its difficulty levels if we can avoid it, but
to allow override if required."* The scale and the retrofit were chosen by the
owner from measured options; this change implements that choice.

## Why

**A tier name currently tells a player nothing portable.** Measured across the
29 tiered games:

- The six three-tier games use **six different vocabularies** — `Easy·Medium·Hard`,
  `Easy·Normal·Tricky`, `Easy·Tricky·Hard`, `Easy·Tricky·Unreasonable`,
  `Easy·Normal·Unreasonable`, `Trivial·Easy·Normal`.
- The eleven two-tier games use five — `Easy·Tricky` (×6), `Easy·Hard` (×2),
  `Easy·Unreasonable`, `Normal·Unreasonable`, `Normal·Extreme`.
- So **"Tricky" is the 2nd rung in six games and the 3rd in three others**, and
  Bridges is alone in the collection in saying "Medium".

Twelve distinct names are in use, four of them by a single game. None of this is
a decision anybody made; it is 29 independent ports each picking words, which is
exactly what a convention exists to stop.

## What Changes

- **`tierNames(count, { search? })`** in `engine/difficulty.ts` returns the
  conventional names: the first `count` of **Easy · Normal · Tricky · Hard ·
  Extreme**, except that `search: true` replaces the last with
  `Unreasonable`. So `tierNames(3)` is `Easy · Normal · Tricky` and
  `tierNames(3, { search: true })` is `Easy · Normal · Unreasonable`.
- **Position and name become a bijection.** "Tricky" is the third rung in every
  game that has one; "Normal" the second. That is the property the owner asked
  for, and it is what a purely positional scale buys.
- **`search` is a declared fact about the top rung, never a position.** The
  `ts-engine` spec reserves `Unreasonable` for a tier whose boards can require
  Search and forbids the name elsewhere, so the convention cannot hand it out by
  index. A game declares it, exactly as it already declares `nonMonotone` and
  `nonUniqueTiers`.
- **All 29 games adopt it**; 22 are renamed. Every game's `DIFF_NAMES` (or
  `DIFFICULTY_NAMES` / `ASCENT_DIFFNAMES` / `LOOPY_DIFFS[].title`) becomes a
  `tierNames(…)` call, so the names still have exactly one definition per game —
  `derive-difficulty-from-the-technique-ladder` established that, and this change
  does not reopen it.
- **Override stays first-class**: a game writes the literal array instead, and
  declares why. Dominosa needs one and gets it for free — its fifth entry,
  "Ambiguous", is already declared `nonUniqueTiers: [4]`, so the guard checks the
  first four against the convention and leaves the declared non-difficulty alone.
- **A guard makes it a convention rather than a suggestion**:
  `difficulty-contract.test.ts` asserts every game's tier list is the
  conventional one for its count. A game that drifts back fails.

## Impact

- Affected specs: `ts-engine` (the tier-naming requirement).
- Affected code: `engine/difficulty.ts`, the 29 tiered games' name constants,
  `difficulty-contract.test.ts`.
- Affected help: four per-game pages name a tier that moves (`subsets`,
  `mathrax`, `salad`, `clusters`). Every other help mention is of
  `Unreasonable`, which the convention preserves — including the whole of
  `features.md` § "Difficulty", which is the page that explains what the word
  promises.
- **No player data moves.** `DIFF_CHARS` maps a tier *index* to a character, and
  indices are untouched, so every existing game ID and saved game decodes to the
  same board at the same tier. What changes is the word on the menu.
- **No board changes.** Nothing here touches a generator, a solver, or a cap.
  The differential fixtures cannot move; if one does, a rename hit something it
  should not have.

## What this change does NOT do

**It does not re-audit which games have a Search rung.** A game that names a tier
`Unreasonable` today gets `search: true`, and one that does not gets `search:
false` — the classification is preserved, not re-derived. That judgment is a
separate question, and `docs/games/solver-and-generator.md` records (as of
`6a2cf15f`) that nothing enforces it mechanically. Folding an audit into a
rename would mean a board-affecting change hiding inside a cosmetic one.
