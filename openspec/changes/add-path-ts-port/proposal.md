# add-path-ts-port

## Why

`puzzles/unfinished/path.c` is an *experimental grid generator* for Nikoli's
Number Link (Numberlink) — the puzzle where you join matching numbered endpoints
with non-crossing paths that fill the grid. It is the least finished of
upstream's experiments: there is no `struct game`, no input handling, no
rendering, and — upstream says so directly — **no solver**, without which
unique-solution generation is impossible. Its own header admits the grids it
produces "are not of suitable quality to be used directly as puzzles."

So this is the most greenfield of the seven remaining changes: porting Path
means writing the solver upstream never wrote, building the whole game, and
improving (or replacing) a generator upstream called inadequate. It is
scaffolded now to capture the scope and the honest gap, not because it is close.
Expect it done much later, or not at all.

## What Changes

- **A new `src/native/games/path/` game** — Numberlink: link each pair of like
  numbers with a path so that paths never cross and (in the standard ruleset)
  every cell is used.
- **A Numberlink solver, written fresh.** This is the crux and has no upstream
  reference. Unique-solution generation — the bar every logic-puzzle port in
  this repo meets — is impossible without it, and upstream flagged its absence
  as the blocker. The generator cannot ship without it.
- **A generator**, using `path.c`'s path-growing strategy as a *starting point*
  but subordinated to the new solver's uniqueness gate, and tuned against the two
  quality problems upstream names (too many trivial short paths vs. too few
  hopelessly-interwoven ones, and boring straight-line paths).
- **The game frontend, invented**: the connection-based data model and
  click-drag-to-link UI upstream sketched in its header comment, plus rendering,
  win detection, and a hint.
- **Stage 2, on owner acceptance**: register `path` in the catalog (new entry +
  new icons) and delete `puzzles/unfinished/path.c`.

Explicitly **not** in this change: any from-C byte-match differential — there is
no C game and no C solver to match. Assurance is behavioural (the solver proves
uniqueness; generated boards are uniquely solvable) rather than differential.

## Impact

- Affected specs: new `path` capability.
- Affected code: new `src/native/games/path/`, catalog + icon additions,
  registration.
- **Largest greenfield effort of the seven** — dominated by the from-scratch
  solver and the generator quality work, both of which upstream left undone.
- Lowest-readiness of the remaining changes; the solver feasibility should be
  proven (a spike) before committing to the full game.
