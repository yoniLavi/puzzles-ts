# one-spelling-of-the-pixel-to-cell-map

**Readiness: ready.** `re-express-the-collection`'s batch B3.

## The finding

**The collection wrote one function four ways.** `engine/geometry.ts`'s
`fromCoord(pixel, ts, border)` is `Math.floor((pixel - border) / tileSize)`.
Games wrote:

| Spelling | Games |
| --- | --- |
| `Math.floor((v - b + ts) / ts) - 1` | bridges, dominosa, lightup, map, singles, slant |
| `Math.floor((v + (ts - b)) / ts) - 1` | keen, solo, towers |
| `Math.floor(v / ts) - 1` (border = one tile) | magnets, salad |
| `Math.floor(px / ts) - n` (border = `n` tiles) | abcd |
| the plain form, not calling the helper | boats, range |
| with a non-tile stride or a compound origin | unequal (`square(ts)`), pattern, tents |

All of them are **exactly** the shared helper. The `+k·ts / −k` dance is
transcribed from a C macro that needs it for truncating integer division;
TypeScript's `Math.floor` does not.

**Verified numerically, not just algebraically**: 14,868 samples across
fractional tile sizes, seven border shapes and pixels from −3 to +8 tiles —
**zero mismatches**. These are input maps, so an equivalence taken on faith
would move where clicks land.

## The override, which is the other half

**`Math.trunc` is a real difference and six games take it**: blackbox,
crossing, group, mathrax, rome, seismic. Truncation rounds toward zero, so a
click inside the top or left border margin folds onto row/column 0 instead of
landing off-grid at −1. That is upstream's behavior and it is player-visible —
the same measurement found **4,401 differing samples**, all at negative pixels.

Every one of those six already documents it at its own `fromCoord` and names
the shared helper as the thing it is declining. That is the convention-with-an-
override shape `AGENTS.md` asks for, and it was invisible while the floor
family had four spellings: an override only reads as an override when the
convention has one form.

## Why this is worth doing

The sweep's test is *pick any two games that mean the same thing and ask what
still differs.* Keen and Towers meant the same thing and said it differently
from Boats, which said it differently from Salad. None of those differences
belongs to a puzzle.

And the four spellings were an active trap: `+ ts … - 1` reads as though it is
compensating for something, so a reader has to derive that it isn't.

## Impact

- Affected specs: none. No behavior, format or contract changes.
- Affected code: seventeen games; `engine/geometry.ts` gains the doc that
  states the convention and names its six overrides.
- **Player-invisible**, and checked where it would show: unequal (stride is a
  cell *plus its inequality gap*), abcd (origin is `n` whole clue tiles) and
  pattern (origin is border + gutter + `tlborder(d)` tiles) were each clicked
  at both extremes of the board in Chrome, and the entry landed in the cell
  clicked.
- Tents gained the same fix `unify-the-board-origin` gave eight other games:
  its `TLBORDER` was defined in `render.ts` and its value re-typed as a literal
  `1` in `interpretMove`. It is now imported.
