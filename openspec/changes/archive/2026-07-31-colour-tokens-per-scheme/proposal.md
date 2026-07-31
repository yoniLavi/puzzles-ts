# colour-tokens-per-scheme

## Why

**No game should contain a colour value.** Every colour a game shows should be a named
reference to one global constant, and that constant should have a value per colour
scheme. Today ~300 raw values still live in game files, and every scheme but light is
*derived by formula* rather than chosen — so "make the dark theme warmer", or adding a
third scheme, is not a thing anyone can do.

Two changes got most of the way and stopped short. `audit-game-colour-palette` named
the ~18 colour *roles* two or more games share, so 407 of 687 palette entries now come
from one place. `hand-author-dark-palette` fixed the dark-mode formula (a measured 150
defects across 45 games → 2) and let a colour carry its own scheme decision, but
authored only one such decision, because it deliberately harvested rather than invented.

What is left is the part that makes theming real, and it is the *long tail*: **302
declared game-local entries, 189 distinct values**, spread over 56 games, still written
as literals and still adapted by formula. The owner's bar — and the right one — is that
**a colour is a semantic reference to a global constant that depends on the chosen
scheme**, with no exceptions beyond genuinely computed values.

**There are no such exceptions.** `Game.colours(defaultBackground: Colour): Colour[]`
takes *only* the background: no params, no state. A game's palette therefore cannot
depend on game semantics — the interface already guarantees it. Signpost's 70 colours
look like the counter-example and are not: 8 hex constants plus deterministic
interpolations. Games choose *which index* to draw with from state; they never compute
a colour from it.

## What Changes

- **A token table**: every colour in the collection becomes a named token with a value
  **per scheme**, in one module. The ~18 existing roles are already tokens in all but
  name; the ~189 distinct game-local values join them, named for what they mean to the
  player in that game (`GUESS_PEG_CORAL`, `FLOOD_TILE_3`, `MINES_COUNT_4`).
- **Derivations stay derivations, and become token-valued.** A colour computed from
  another — the `mkhighlight` bevel trio, Signpost's ramps, `pencilColour(bg)` — keeps
  being a function, but over tokens rather than over literals. This is the one place
  "a single global constant" is met by *a function of global constants*, and the spec
  says so explicitly rather than leaving it to be argued later.
- **Scheme values are authored, not calculated.** Each token states its value per
  scheme. The formula in `utils/color.ts` stops being how dark mode is produced and
  survives only as the fallback for a token that has not been given a dark value yet,
  so the migration can land incrementally without a flag day.
- **The guard inverts.** `palette.test.ts` currently permits a declared game-local
  value; it should instead fail on *any* literal colour in a game, so the end state is
  enforced rather than aspired to.
- **`augmentation.ts`'s per-index dark-mode patches go away** as the tokens absorb them
  — 28 of 47 were already measured to be role-level facts in per-game clothing.

## Impact

- Affected specs: `ts-engine` (the palette requirements tighten from "roles exist" to
  "no colour value outside the token table").
- Affected code: `src/native/engine/palette.ts` (becomes the token table), all 56 game
  dirs holding a literal, `src/puzzle/augmentation.ts`, `src/utils/color.ts`,
  `palette.test.ts`.
- **A big diff, accepted deliberately** for maintainability and skinning — the owner's
  call, recorded here so it is not re-litigated mid-change.
- **Light mode must not move.** Every committed render snapshot is a light-mode frame,
  so a moved snapshot is a defect in this change until proven otherwise. This is the
  property that makes a 300-value migration safe to review.
- No save-format, bundle or runtime impact: the same values reach the same palette
  indices; only where they are written changes.

## Scope boundary (owner direction, 2026-07-31)

This change **relocates**; it does not retune. Its review property is *zero values
changed*, which is what makes a 687-entry diff across 57 games reviewable, and
design D3 forbids mixing the two into one commit.

The collection should not end up with ~190 named colours. The owner's target is
**~10–20 colours with specific semantics**, referenced semantically, with a
truthful name where a game genuinely wants a named colour (a hint that says "fill
with yellow"). That is `consolidate-colour-palette`, and this change is its
precondition rather than a competing answer: every colour is now a named entry in
one table, reached through one import pattern, so collapsing 190 names onto ~14 is
an edit to the table and to import lines — not a hunt through 57 games. Authoring
dark values is likewise deferred there, since ~190 hand-picked values for tokens
about to be merged would be wasted, and consolidation dissolves the
enumerated-set separation problem by designing one distinguishable set once.
