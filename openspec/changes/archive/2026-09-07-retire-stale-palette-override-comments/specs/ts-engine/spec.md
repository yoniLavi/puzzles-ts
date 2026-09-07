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
append safe — so nothing fails and nobody looks. Six such comments across four
games survived the deletion of every override but one.

The guard SHALL find its population by **shape** — *every* `paletteOverrides`
mention in any game's render module, whatever the game and however the sentence
is phrased — never from a roster of games, and SHALL assert the number of files
scanned and mentions matched so that a scan matching nothing cannot report
health.

It SHALL **classify** what that shape catches rather than filter it, into the
two forms a claim can take — "this game declares none", and "this game's
overrides are indices *n*, *m*" — and a mention fitting neither SHALL fail. An
unclassifiable claim is precisely the one nothing can check: the sixth stale
comment named no index at all, saying only that the overrides "apply
unchanged", and a guard that skipped what it could not parse would have skipped
it.

The declaration side SHALL be read from the module, not from a parse of its
text, so there is no second reading of it to drift.

#### Scenario: A game's comment names an override index that is not declared

- **WHEN** a render module's comment names a `paletteOverrides` index for its
  game
- **AND** `src/puzzle/augmentation.ts` declares no such override for that game
- **THEN** the guard fails, naming the file, the claimed index and the actual
  declaration

#### Scenario: The declaration moves

- **WHEN** an override's index changes in `src/puzzle/augmentation.ts`
- **THEN** the guard fails for every comment still naming the old index

#### Scenario: A comment states a claim the guard cannot check

- **WHEN** a render module mentions `paletteOverrides` without either declaring
  the game has none or naming the indices
- **THEN** the guard fails, asking for one of the two checkable phrasings

#### Scenario: The scan matches nothing

- **WHEN** the scan finds no render modules, or no `paletteOverrides` mentions
- **THEN** the guard fails on its own input count rather than passing over an
  empty population
