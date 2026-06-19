# Design: hint element-type colour legend (Singles pilot)

## The convention (cross-game)

A hint narration that names ≥2 distinct **board-element types** must let the
player map each named type to the picture. The rule:

1. **Per-game legend, not per-hint ad-hoc.** Each game assigns a stable colour to
   each element *type* its hints can name (forced cell, a number/clue, a
   shaded/filled cell, a marked cell, a region, a wall…). A given hint lights up
   only the types it mentions, but a "shaded square" is the *same* colour in
   every hint — the legend is learnable.
2. **Colour is never alone.** Every legend colour is paired with a non-colour
   cue: ring vs shade vs fill, the drawn digit/clue, or position. A colourblind
   player still gets the mapping from shape + the cell's own content. (This keeps
   the existing rule "colour names never go in the narration text".)
3. **Distinct *types* get distinct colours; equivalent *moves* still share one.**
   Quality-bar rule 3 (equivalent forced moves share `COL_HINT`) is unchanged —
   the legend is about *premise/element types*, orthogonal to the target colour.

## Singles legend (the pilot)

| narration names | element type | colour | non-colour cue |
| --- | --- | --- | --- |
| the forced cell(s) | the move | `COL_HINT` (blue), **fill** | empty action cell, no digit/mark preview |
| "matching numbers" | undecided **number** premise | `COL_HINT_CELL` (light blue), **shade** | the digit drawn on top |
| "a shaded square" | decided **black** premise | `COL_HINT_BLACKREF` (new), **ring** | the cell is black-filled |
| "the ringed white square" | decided **white/circle** premise | `COL_HINT_WHITEREF` (new), **ring** | the white circle in the cell |
| the protected corner | the corner a corner-deduction seals | `COL_HINT_STRAND` (amber), shade/ring | position (the corner) |

Today the decided-premise ring uses `COL_HINT` (the same blue as the target), so
`adjBlack` ("a shaded square → a white") and `sameLine`/`boxedIn` ("a ringed
white square → …") draw premise and target the same colour. The change gives the
two decided-premise types their own legend entries.

### Why the payload doesn't change

`render.ts`'s evidence path already decides **shade vs ring** from the cell's
live decided state (`(DS_HINT_EVID …) && (DS_BLACK | DS_CIRCLE)` → ring, else
shade). The only change is: in the ring branch, pick the colour from the same
state — `DS_BLACK` → `COL_HINT_BLACKREF`, `DS_CIRCLE` → `COL_HINT_WHITEREF`. The
`SinglesHint` type (`targets`/`evidence`/`strand`) and `index.ts` are untouched;
the legend is a pure render concern. Disjoint-roles tests still hold.

## Decisions / trade-offs

- **Two premise colours, not one.** Black-square and white-circle premises never
  co-occur in one Singles hint, so one "cited decided cell" colour would
  disambiguate premise-from-target on its own. We still give them **separate**
  legend entries because the chosen approach is a *stable per-game legend* —
  "shaded square" and "ringed white square" are different element types and read
  more clearly as such across hints, and the cell's own black/white appearance
  already reinforces which is which. **Open for owner acceptance:** if two ring
  colours read as noisy, collapse to a single `COL_HINT_REF`; this is a one-line
  render change and a legend-table edit, decided on the live smoke test.
- **Candidate hues** (final value settled at acceptance against the live palette
  and the dark/light host backgrounds): `COL_HINT_BLACKREF` a bright cool green
  (legible ring on a black fill); `COL_HINT_WHITEREF` a violet (legible ring on a
  white cell with its circle). Both must stay clear of `COL_ERROR`/red
  (mistake), `COL_HINT` blue (target), `COL_HINT_CELL` light blue (number), and
  `COL_HINT_STRAND` amber (corner).
- **Verification is in-process.** Tier-2.5 render-scenario: reach an `adjBlack`
  frame (fixed-seed scan, predicate on the unique "can't be adjacent" phrase per
  the hint-authoring testing gotcha) and assert the cited black premise rings in
  `COL_HINT_BLACKREF` while the target fills `COL_HINT`; likewise a `sameLine`
  frame for `COL_HINT_WHITEREF`. Pair with a `toMatchSnapshot`.

## Out of scope (follow-ups)

Range, Palisade, Filling, Unruly each have multi-type hints (black square +
white cells + clue; wall + region + clue; region + number; coloured tiles +
line). Each gets its own parity-gated change applying this convention with its
own legend, after the Singles pilot is accepted.
