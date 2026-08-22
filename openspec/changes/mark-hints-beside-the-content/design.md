# Design

## Context

The measurements and the two prototypes are in
`openspec/changes/archive/2026-08-22-walk-tactic-hint-chains/design.md`, D6–D7.
The short version, because it is what this change is executing:

- a fill behind a digit is unfixable by recolouring — the search over hue,
  lightness and chroma, in both schemes and over both hint roles jointly,
  returns **no feasible arrangement**;
- a mark in the **gutter** is read *against* rather than *through*, so the
  constraint disappears instead of being traded, and the mark can take a strong
  colour;
- there is no room *inside* a tile: a candidate game lays its pencil block across
  the whole cell, so a glyph has only its own font padding at the edge.

Keen ships both marks. This change takes them to the rest.

## D1 — What each game gets, and how the call is made

Not every evidence area carries content, and `docs/games/hints.md` §
"Shade vs ring" already decides on the right question — *would the fill hide the
premise?* This change widens **hide** to include *by contrast*, which is a change
of threshold, not of rule. So:

- **Target**: always a ring. It is one cell, always acted on, and in a candidate
  game it always carries marks. No per-game judgement.
- **Evidence**: outline where the cells carry content the player has to read
  (the candidate games' pencil marks and digits); wash where they do not (Range's
  undecided cells, and anything else whose premise is the cell's emptiness).

**Record the call per game**, with the reason, in the same place the game's
`colours()` names the role. A game that keeps a wash is making a claim — *nothing
is drawn here* — and that claim is what a later reader needs.

## D2 — A wash that carries nothing can be bright again

`TEAL_WASH_DEEP` exists for one reason: to let `HINT_EVIDENCE` work *as a wash*
under mid-luminance content. Where evidence stops carrying content, that reason
is gone and the wash should go back to `TEAL_WASH`, which is more visible —
darkening it was a cost paid for legibility that is no longer being bought.

If the sweep leaves **no** game washing evidence under content, `TEAL_WASH_DEEP`
has no consumer and is retired in this change. That is the test to apply at the
end, not an assumption to make at the start: it is a step in the palette table
and `palette-source.test.ts` fails on an intensity nobody references.

## D3 — One role, not two that happen to agree

Keen's evidence outline and its chain ordinal are both `TEAL_BOLD`, reached
independently — the outline because a line is read against the board, the ordinal
because it indexes the evidence. `colour-collide` reports the pair, and it is
right to: two meanings arriving at one value down two routes is exactly what
`palette.ts`'s two-layer split exists to prevent, because restyling one would
silently fail to restyle the other.

They become one role. Which name survives is a small decision with a real
consequence — the surviving doc comment is where the next reader learns *why*
the evidence and its index share a colour — so make it deliberately rather than
by whichever import was already there.

## D4 — The guard is about shape, and must stay that way

`expectRing` asserts four thin rects and *none solid*; the contour assertion is
`2w + 2` sides for a `w`-cell line. Both are deliberately shape assertions:

- "some rect is `COL_HINT`" is satisfied by a fill, which is the thing being
  removed — the weaker form would pass unchanged through the entire rewrite;
- `2w + 2` distinguishes one contour from `4w` per-cell rings, so a game that
  loses the neighbour test still fails.

Promoting these to a cross-game guard over `hint-games.ts` is what stops the
seventh game regressing to a fill. Prove it fires — by deleting one game's ring
and watching it go red — before trusting it. The two guards written during
`walk-tactic-hint-chains` were *both* vacuous on their first cut, and neither was
caught by reading them.

## Open Questions

- Does any evidence area outline *badly* — a region so scattered that per-cell
  rings read as noise rather than as a set? The forcing chain is the known
  scattered case and it looked right in Keen, but it is 3–6 cells; Solo's
  `set` reason can name more.
- Filling's evidence is a *region of digits* rather than pencil marks, and its
  own § "Shade vs ring" entry is the one that argues shading is right for a
  number premise. It is the most likely game to keep its wash, and the reason it
  keeps it should be written down rather than left as an omission.
