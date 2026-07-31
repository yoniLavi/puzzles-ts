# consolidate-colour-palette

## Why

The collection has **too many colours**, and nobody chose that number.

`colour-tokens-per-scheme` gave every colour a name and a home: 687 palette
entries across 57 games now resolve to ~190 tokens in one table, and no game
holds a colour value. That was the precondition, not the answer. ~190 named
colours is still 190 independent decisions — it is the same sprawl with better
labels, and it makes the thing the table was built for (restyle a scheme, add a
scheme) 190 judgement calls instead of a design.

The sprawl is inherited rather than intended. Upstream wrote each game
separately, so Cube's die face, Untangle's vertex, Pegs' peg, Sticks' line,
Spokes' cursor and Rome's entry arrow are six names for pure blue that arrived
independently — and Flood's ten tiles and Guess's ten pegs are *the same ten
values typed out twice*.

The target is **~10–20 colours, each with a specific meaning**. Games reference
the meaning. Where a game genuinely wants a named colour rather than a meaning —
a Flood hint that says *"Fill with yellow"* — it references a named colour whose
name is **true**: yellow is yellow, in every scheme.

## What Changes

- **A small named palette.** One set of colours with truthful, scheme-stable
  names, designed *once* to be mutually distinguishable — which is what a
  ten-member enumerated set needs and what no per-game decision can provide.
- **Semantic roles are defined in terms of it.** `ERROR`, `HINT_ACTION`,
  `PLAYER_ENTRY`, `CLUE_DONE` and the rest stop being independent values and
  become named meanings that resolve to a palette colour. A game keeps
  referencing the meaning; the meaning stops being its own colour decision.
- **~190 tokens collapse.** Every per-game token is either replaced by a semantic
  role, replaced by a named colour (where the colour *is* the meaning), or —
  rarely, and argued in writing — kept because the game genuinely needs a colour
  the palette does not have.
- **The enumerated-set problem is designed away.** Flood's, Guess's and
  Samegame's dark separation is deficient by measurement (worst pair 0.070
  against 0.134 in light) precisely because ten colours were never designed as a
  set. One palette designed once, in both schemes, fixes all of them at once.
- **Dark values get authored** — the pass deferred from `colour-tokens-per-scheme`
  — but for ~15 colours rather than ~190, which is a design session rather than a
  slog.

## Impact

- Affected specs: `ts-engine` (the palette requirements gain the constraint that
  the collection's colours are a *small named set*, not merely a named set).
- Affected code: `src/native/engine/palette.ts`, `palette-games.ts` (largely
  deleted), the import lines of all 57 games, `src/puzzle/augmentation.ts`.
- **This change moves colours on purpose.** That is the opposite of its
  predecessor, whose review property was *zero values changed*, and the reason the
  two are separate changes: a diff cannot show both at once. The review artefact
  here is the regenerated `inventory.md` (what each colour became) plus a
  light-and-dark browser pass, not a no-op diff.
- Render snapshots **will** move, and each moved snapshot must be reviewed as a
  diff before re-baselining — never a blind `vitest -u`.
