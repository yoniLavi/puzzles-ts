# unify-the-board-origin

**Readiness: ready.** The finding is measured, the population is named, the fix
has two exemplars in the tree, and there is no design decision left in it.

Found 2026-09-06 by `declare-the-board-model`'s exploration, which was
withdrawn (`openspec/postmortems/2026-09-06-board-model-withdrawal.md`). This is
the half of that change worth keeping, delivered structurally rather than by a
declaration.

## The finding

**Eight games compute the board's pixel origin twice** — once in the module that
hosts `interpretMove`, once in the module that hosts `redraw` — with nothing
holding the two copies together:

| Game | Input side | Paint side |
| --- | --- | --- |
| blackbox | `index.ts` `Math.floor(ts / 2)` | `render.ts` `Math.floor(tilesize / 2)` |
| dominosa | `index.ts` `-Math.floor(ts / 16)` | `render.ts` `-gutter(ts)` |
| galaxies | `index.ts` `const border = tile` | `render.ts` `const border = tile` |
| range | `index.ts` `Math.floor(ts / 2)` | `render.ts` `Math.floor(ts / 2)` |
| signpost | `index.ts` `const BORDER = 1` | `render.ts` `const BORDER = 1` |
| singles | `index.ts` `Math.floor(ts / 2)` | `render.ts` `Math.floor(ts / 2)` |
| slant | `index.ts` `Math.floor(ts / 3) + 1` | `render.ts` `clueRadius(ts) + 1` |
| unruly | `index.ts` `function border(ts)` | `render.ts` `const border = (ts)` |

All eight agree today, verified by reading both sides. **None is guarded**, and
Slant's input copy carries the comment `// render.ts border (NARROW_BORDERS)` —
a copy that cites its original instead of importing it, and spells the same
number a second way (`Math.floor(ts / 3)` against `clueRadius(ts)`).

## Why

`docs/games/mechanics.md` § "One function, both callers" already states the
rule, and its motivating incident (Crossing's clue coloring) was a *predicate*,
not a coordinate. The board's pixel origin is the rule's most common concrete
instance and the one nobody had swept for. The failure mode is the same one
Crossing produced: the two copies agree until one of them gains a reason to
change, and then the click lands on a different cell than the one the player
sees highlighted — with the whole suite green, because no test drives paint and
input against each other.

**This is `declare-the-board-model`'s constraint C3, discharged.** That change
asked for "one function, both callers" to be made *structural* rather than
restated. Exporting the origin from one module and importing it in the other is
structural in the strongest available sense: one function cannot drift from
itself, so the guarantee needs no test at all.

Two games in the tree already do it, and are the pattern to copy:

- **Mines** — `borderFor(tileSize)` lives in `render.ts` and `index.ts` imports it.
- **Bricks** — `offsets(h, ts)` is exported from `render.ts` with the doc comment
  *"Shared with `interpretMove` so pointer mapping and drawing agree."*

## What this is not

**Not a rewrite of the coordinate helpers.** `engine/geometry.ts` supplies the
arithmetic (`coord`, `fromCoord`); what stays per-game is the border, which is
a genuine per-puzzle fact (a clue margin, a negative gutter that bleeds dominoes
to the canvas edge, a full tile for Galaxies' dot ring). This change moves each
game's border to one place; it does not try to unify the borders themselves,
and it does not touch the 36 games whose local `coord`/`fromCoord` pairing is
already written once.

**Not a new guard.** A source scan asserting "no game defines its origin twice"
was considered and declined in the postmortem: it would key on a name
(`border`, `BORDER`, `margin`, `TLBORDER`) and Slant's copy is an unnamed inline
expression, so the scan would report the worst instance in the set as clean.
Structure is available and is strictly stronger.

## Impact

- Affected specs: none. This changes no behavior, no format and no contract.
- Affected code: `src/games/{blackbox,dominosa,galaxies,range,signpost,singles,slant,unruly}/`.
- **Player-invisible by construction** — every origin is byte-identical before
  and after, so the frozen differentials and the tier-2.5 render snapshots must
  not move. A moved snapshot means a copy did *not* agree and the change has
  found a live bug; say so rather than re-baselining.
- `docs/games/mechanics.md` § "One function, both callers" gains the coordinate
  instance and the two exemplars.
