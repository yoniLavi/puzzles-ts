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

## D5 — "The six remaining fills" was a proxy, and the sweep is fifteen games

The proposal enumerated the work by grepping `HINT_FILL`'s consumers. That names
a **colour**, not the thing being fixed, and it fails exactly where a game is
unusual: three games fill in a hue of their own, for the same documented reason
in each — the collection's hint blue is already spoken for by something the
board says. Crossing uses `GREEN` (blue means "across"), Clusters uses `PURPLE`
(blue is one of the two colours a player *paints*), and Dominosa fills with
`HINT_ACTION` itself rather than the wash. All three were invisible to the grep.

**What it should have asked, and what was measured instead:** render a hint frame
for every game in the `hint-games.ts` enrolment; find every cell-sized rect drawn
in that game's own `COL_HINT` / `COL_HINT_CELL` (their indices read out of each
`render.ts`'s exports, so nothing is hand-listed); and report whether any later
op puts ink inside it.

| | fill covered by content | fill with nothing on it |
| --- | --- | --- |
| **target** | dominosa (a number), netslide (the tile's wires), singles | bricks, clusters, galaxies, lightup, pattern, range, slant, unruly |
| **evidence** | palisade, range, salad, singles, sticks, subsets, galaxies, lightup | pattern, slant |

**Owner's call on the scope this opened (2026-08-22): every target cell becomes a
ring**, the eight bare ones included. The measurement says those eight hide
nothing, so the gain is not legibility — it is that **one mark means one thing**.
It also removes a category error the bare column hides: in Bricks, Clusters,
Unruly and Singles the move *is* "give this cell a colour", so a solid fill of
the target says with the board what the narration is still only proposing.

Evidence keeps its per-game judgement, decided on the measurement rather than on
the game's family.

## D6 — Where the band sits is a per-game fact, and it has two answers

`hint-mark.ts` takes a `MarkBand` — a content box plus how far the band reaches
**outside** it and how far **inside**. That is not configuration for its own sake;
it is the one thing that genuinely differs, and it decides who undoes the mark.

- **Outside** (`outer > 0`): Keen and Solo sit on a `COL_GRID` backing with a
  `2·GRIDEXTRA + 1` gutter, and Unequal has a `TILESIZE/2` gap. No tile owns those
  pixels, so `HintMarks` is told the gutter's resting colour and repaints it when
  a mark moves — and repaints a mark that stays, every frame, because a
  neighbour's repaint widens its background into the shared gutter.
- **Inside** (`outer = 0`): Towers, Filling and Crossing tile exactly and draw
  their own per-cell outline, so the band replaces that outline. Nothing has to
  be erased: the cell whose overlay changed repaints itself and takes its mark
  with it.
- **Both** (Group, Undead): a one-pixel gutter plus a couple of pixels of the
  cell's own edge.

The inner reach is **bounded by the content, and the bound is arithmetic rather
than taste**: Undead's pencilled monster is a circle of radius `2/5` of its
`TILESIZE/2` box centred a quarter-tile in, so it clears the edge by
`TILESIZE/20`; Unequal's greater-than chevron reaches to within `GAP/4 − 1` of the
cell it points away from. Each game's `markBand` records its own.

## D7 — The retired wash step was doing a second job nobody had named

D2 said a wash that carries nothing can be bright again, so `TEAL_WASH_DEEP` was
retired and the three wash games went back to `TEAL_WASH`. The dark browser pass
found that wrong, and it is worth keeping because the mistake is a familiar
shape: **"nothing is drawn here" excluded the game's content and forgot the
hint's own marks.**

A target cell is very often *inside* the region the deduction reasons from —
Pattern's forced square is one of the reasoned line's — so the action ring lands
on the evidence fill. Measured on the ordinary wash:

| | light | dark |
| --- | --- | --- |
| the ring, against the wash it sits on | 3.94 | **1.69** |
| the wash, against its own board | 1.29 | 2.73 |

In dark the evidence shouted and the conclusion whispered, which is exactly what
the Pattern frame looked like: a bright teal column with a barely-there blue ring
in it.

**The two requirements move in opposite directions along one axis**, which is the
same trade the *content*-carrying wash lost — one step further out. So the role
keeps a step of its own after all, renamed for the job rather than the
appearance: `TEAL_WASH_QUIET`, identical to `TEAL_WASH` in light, `[0.30, 0.06]`
in dark. That is the crossing point, found by sweeping lightness rather than
chosen: it reaches light mode's own visibility (1.31 against 1.288) and leaves
the ring 3.54.

**And the guard that missed it was a floor with no ceiling** — the third time
this repo has recorded that shape. `palette.test.ts` asserted every mark is
*visible enough* against the board and said nothing about the wash staying
*quiet enough* for what is drawn on it. Both directions are now asserted.

## Open Questions

- Does any evidence area outline *badly* — a region so scattered that per-cell
  rings read as noise rather than as a set? The forcing chain is the known
  scattered case and it looked right in Keen, but it is 3–6 cells; Solo's
  `set` reason can name more.
- ~~Filling's evidence is a *region of digits*…~~ **Answered, and the reason is
  not the one the question expected.** A digit on the evidence wash is perfectly
  legible — 3.41:1 light, 4.04:1 dark, which is exactly what `TEAL_WASH_DEEP`
  bought. The binding constraint is the *other* side: at the lightness that
  legibility requires, the wash measures **1.15:1 against its own board in dark
  mode**. So it is not "content on a wash is unreadable" but "a wash that carries
  content is unreadable *as a mark*" — the two requirements move in opposite
  directions along one axis, and a wash under content loses whichever way it is
  tuned. Filling outlines, and its `colours()` records this.
