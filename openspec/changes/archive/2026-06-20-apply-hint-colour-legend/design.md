# Design: rolling the colour legend across the ports

## Survey method

One read-only survey per hint-carrying game (`hint()` in `src/native/games/*`):
the deductive games Range/Palisade/Filling/Unruly, and the movement games
Sixteen/Fifteen/Flood. Each recorded: every narration string and the
board-element *types* it names; the colour + non-colour cue each type draws with;
whether the colours are a stable per-game legend with a non-colour cue per type;
and the gap (if any). The bar is the Singles problem restated: **does any hint
name a cited *decided premise* that draws in the same colour as the forced move,
distinguished only by ring-vs-fill?** If yes, it needs a distinct premise colour.

## Per-game outcome

| Game | Names ≥2 element types? | Cited decided premise shares the move colour? | Outcome |
| --- | --- | --- | --- |
| Range | yes (clue / visible whites / **decided black** / forced cell) | **yes** — `adjacency` rings the black premise in `COL_HINT` | code fix |
| Unruly | yes (filled premise / empty siblings / forced cell) | **yes** — premise `ring` is `COL_HINT` | code fix |
| Palisade | yes (edge / region / clue / corner) | no — edges *are* the move; region shades, clue is its digit | document |
| Filling | yes (region premise / empty target) | no — empty no-digit target vs digit-bearing shade | document |
| Sixteen | no — one tile + its destination, imperative | n/a | exempt |
| Fifteen | no — one tile + the gap, imperative | n/a | exempt |
| Flood | no — one colour region, imperative | n/a | exempt |

## Decisions / trade-offs

- **Range reuses Singles' teal `COL_HINT_BLACKREF`.** Range only ever rings a
  decided *black* square (`adjacency`), so the cross-game "cited black square =
  teal" hue applies exactly — same value as Singles, for learnability across
  games. The other premise type Range cites (visible *white* cells for
  reach/satisfied/connect) is **undecided/shaded**, not a decided ring, so it
  stays `COL_HINT_CELL`; no white-ref is needed.
- **Unruly uses ONE `COL_HINT_REF`, not the black/white split.** Unruly's `ring`
  set is not uniformly one decided colour: `threes`/`complete` ring filled cells
  of one colour, `unique` rings a *full balanced row* (both colours), and
  `nearcomplete` rings **empty** reserved-window cells. A per-cell black/white
  ring colour is therefore ill-defined. Unruly's legend instead has a single
  "cited premise / pivotal cell" ring colour, distinguished from the move by both
  colour and the ring-vs-fill cue.
- **Unruly's premise colour is a distinct orange, not teal/violet.** Teal and
  violet carry the cross-game meaning "cited *black* / *white* square" (Singles,
  Range). Using teal for Unruly's mixed ring — which lands on white cells (in
  `unique`) and empty cells (in `nearcomplete`) — would actively mislead. A
  separate hue keeps the cross-game black/white reading intact while giving Unruly
  an unambiguous within-game legend. Final value settled on the live palette.
- **Compliant games still get a spec requirement.** Palisade and Filling change
  no code, but adding a "hint colour legend" requirement each makes every
  hint-carrying game's legend auditable from its spec (parallel to "Singles hint
  colour legend"), so a future render edit that breaks the legend fails review.
- **The movement exemption is documented, not specced.** The `ts-engine`
  convention already bites only "when a hint names multiple element types," which
  logically exempts single-action imperative hints. Rather than add an exemption
  scenario to the engine spec, the rule of thumb ("movement/objective hints name
  one element type — the legend doesn't apply") lives in the hint-authoring guide
  where a porter deciding a new game's hint will read it.

## Verification

Range and Unruly each get an in-process render-scenario assertion that the cited
premise rings in its new colour while the forced cell fills `COL_HINT` (the
Singles harness pattern: reach the deduction's frame, assert the op colours).
Owner-acceptance is the live look in `npm run dev`, per the Singles precedent.
