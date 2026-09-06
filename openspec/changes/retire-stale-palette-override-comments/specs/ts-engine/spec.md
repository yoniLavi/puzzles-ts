# ts-engine Specification Delta — retire-stale-palette-override-comments

## ADDED Requirements

### Requirement: A comment naming a palette-override index is checked against the declaration

A game's render module SHALL NOT state, in prose, which dark-mode
`paletteOverrides` indices the app applies to that game unless
`src/puzzle/augmentation.ts` actually declares them, and a test SHALL hold the
two together.

Such a comment is a claim about another file, and it is usually stated as the
*reason* appending a palette index past the upstream `COL_*` enum is safe. When
the declaration is deleted the comment keeps reading as verified, because its
conclusion stays true for a different reason — no overrides at all makes any
append safe — so nothing fails and nobody looks. Five such comments across
three games survived the deletion of every override but one.

The guard SHALL find its population by **shape** — a `paletteOverrides` mention
carrying an index, wherever it appears under `src/games/*/render.ts` — never
from a roster of games, and SHALL assert the number of files scanned and
comments matched so that a scan matching nothing cannot report health.

#### Scenario: A game's comment names an override index that is not declared

- **WHEN** a render module's comment names a `paletteOverrides` index for its
  game
- **AND** `src/puzzle/augmentation.ts` declares no such override for that game
- **THEN** the guard fails, naming the file, the claimed index and the actual
  declaration

#### Scenario: The declaration moves

- **WHEN** an override's index changes in `src/puzzle/augmentation.ts`
- **THEN** the guard fails for every comment still naming the old index

#### Scenario: The scan matches nothing

- **WHEN** the scan finds no render modules, or no `paletteOverrides` mentions
- **THEN** the guard fails on its own input count rather than passing over an
  empty population
