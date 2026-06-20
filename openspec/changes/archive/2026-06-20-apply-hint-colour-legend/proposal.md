# Proposal: Roll the hint element-type colour legend out to every existing port

**Status**: Proposed

## Why

`add-hint-type-colour-legend` (Singles pilot, owner-accepted 2026-06-19) added a
cross-game convention to the `ts-engine` Hint System: **when a hint narration
names more than one distinct kind of board element, each type gets a stable
per-game highlight colour, always paired with a non-colour cue.** That change
deliberately left the rollout to the other hint-carrying games as follow-ups.
This change is that rollout — every existing port either complies, gets the fix,
or is documented as exempt, so the convention is real across the collection and
not just in Singles.

A per-game survey of all eight hint-carrying games found two with the exact
problem Singles had (a cited *decided premise* drawn in the **same** colour as
the forced move, distinguished only by ring-vs-fill):

- **Range** — the `adjacency` hint rings the cited black square in `COL_HINT`,
  the same blue as the target. (It already carries a dedicated `F_HINT_BLACKREF`
  flag and `blackRefs` payload — only the ring *colour* is wrong.)
- **Unruly** — the premise `ring` and the target both draw in `COL_HINT` blue.

The rest already satisfy the convention or fall outside it:

- **Palisade** — compliant: forced edges are the move (`COL_HINT` blue, drawn as
  edge segments — equivalent moves correctly share one colour), referenced
  regions shade `COL_HINT_CELL`, and a cited clue is its drawn digit on the
  shaded region (the same treatment Singles gives a number premise). No cited
  decided-cell collides with the move colour.
- **Filling** — compliant: the target is an empty *mild* `COL_HINT` fill with **no
  digit** (a call to action), the premise region is a `COL_HINT_CELL` shade with
  its **digit on top** — two types, two colours, two non-colour cues.
- **Sixteen / Fifteen / Flood** — exempt: single-action *imperative* hints (move
  this tile / fill this colour) that name only one element type plus the move
  itself; there is no premise type to disambiguate.

## What Changes

- **Range (code).** Add a teal `COL_HINT_BLACKREF` palette entry (the same hue
  Singles uses for a cited black square) and ring the `adjacency` decided-black
  premise in it instead of `COL_HINT`. Render-only; the `RangeHint`/`blackRefs`
  payload and the narration are unchanged.
- **Unruly (code).** Add a distinct `COL_HINT_REF` palette entry and draw the
  premise `ring` cells in it instead of `COL_HINT`. Unruly's ring set is **mixed**
  — filled black cells (`threes`/`complete`), a full balanced reference row with
  *both* colours (`unique`), and **empty** reserved-window cells (`nearcomplete`)
  — so the Singles black/white split does not apply; Unruly uses **one** cited-
  premise colour. A distinct orange (not the cross-game teal/violet, which mean
  "cited black/white square") avoids implying a colour the ringed cell isn't.
- **Palisade, Filling (spec only).** Add a per-game "hint colour legend"
  requirement documenting the legend they already implement, so the convention is
  auditable per game (parallel to "Singles hint colour legend").
- **Guide.** Update `docs/porting/hint-authoring.md`: mark the rollout done
  (drop the "follow-ups" framing), add each game's legend in one place, and record
  the **single-action imperative exemption** (movement/objective hints name one
  element type, so the legend doesn't apply) so future ports know when *not* to
  reach for it.

Owner-acceptance-gated on the live look (Range and Unruly in `npm run dev`),
following the Singles precedent — these games' C is already deleted, so there is
no parity/C-deletion gate, only the enhancement acceptance.

## Impact

- Specs: `range`, `unruly`, `palisade`, `filling` (one ADDED "hint colour
  legend" requirement each). The `ts-engine` convention is unchanged (it already
  exists from the Singles change).
- Code: `range/render.ts` (one palette entry + ring colour), `unruly/render.ts`
  (one palette entry + ring colour); matching render-scenario / op assertions.
- Docs: `docs/porting/hint-authoring.md`.
- No runtime/bundle impact beyond two palette entries; dev/test-only test code.
