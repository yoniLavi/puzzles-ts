# Proposal: A per-game element-type colour legend for explained hints

**Status**: Proposed

## Why

Explained hints often name **more than one kind of board element** in a single
narration — Singles' `adjBlack` says *"This square touches a **shaded square**…
so it **must be white**"*: two distinct element types (the shaded-square premise
and the forced white). Today those two collapse to the **same** `COL_HINT` blue
(the premise ringed, the target filled), so the only thing distinguishing
"the thing the reason is about" from "the thing you do" is ring-vs-fill. The
player can't map the words to the picture at a glance.

The owner asked for **colour highlighting whenever a hint mentions multiple types
of board element**, with a **stable per-game legend** (a shaded square is always
the same colour, across every hint), so the legend becomes learnable. This is the
same insight as the existing Singles `strand` role (distinct roles get distinct
colours, `add-singles-hint`/§ hint-authoring) generalised from *deduction role*
to *board-element type*, and made consistent within a game.

## What Changes

- **A cross-game hint convention (ts-engine Hint System).** When a game's hint
  narration references multiple distinct **board-element types**, each type
  SHALL get a stable highlight colour within that game (a legend), and that
  colour SHALL always be paired with a **non-colour cue** (ring vs shade, the
  drawn digit, position) so the mapping survives for colourblind players —
  colour is never the sole carrier. Only the types a given hint actually names
  light up.

- **Singles is the pilot.** Singles establishes its legend: forced cell = blue
  fill (`COL_HINT`, unchanged); matching-number premise = light-blue shade
  (`COL_HINT_CELL`, unchanged, digit on top); protected corner = amber
  (`COL_HINT_STRAND`, unchanged); **decided premise cells get new legend
  colours** — a *shaded (black) square* the reason cites (e.g. `adjBlack`) is
  ringed in a new `COL_HINT_BLACKREF`, a *ringed white square* the reason cites
  (`sameLine` / `boxedIn`) in a new `COL_HINT_WHITEREF` — instead of today's
  shared `COL_HINT` blue. The renderer already branches shade-vs-ring on the
  cell's decided state in the evidence path; this extends that branch to choose
  the ring colour by type, so the `SinglesHint` payload is unchanged.

- **Codify the convention + the Singles legend** in
  `docs/porting/hint-authoring.md` (live wiki) and verify in-process with the
  tier-2.5 render-scenario harness (a frame where the cited premise rings in its
  legend colour, distinct from the blue target).

Parity-gated: registered/committed only on owner acceptance of the Singles
look in `npm run dev`. The sweep to Range / Palisade / Filling / Unruly is
**out of scope here** — each is its own parity-gated follow-up once the Singles
legend is accepted, reusing the convention this change codifies.

## Impact

- Specs: `ts-engine` (Hint System requirement — add the colour-legend
  convention), `singles` (new "Singles hint colour legend" requirement).
- Code: `src/native/games/singles/render.ts` (two palette entries + ring-colour
  choice by decided state), `singles-hint.test.ts` /
  render-scenario snapshot. No change to `singles/index.ts` hint payload.
- Docs: `docs/porting/hint-authoring.md`.
- No runtime/bundle impact beyond two palette entries; dev/test-only test code.
