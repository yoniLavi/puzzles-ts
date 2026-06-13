# Change: Pre-port tidy #2 — promote bevel/outline/parity draw helpers and move param→config mapping into a Game hook

## Why
Twelve games are now ported and the next port (#13) is about to start. A
cross-game survey found verbatim (or visually-equivalent) duplication that the
second-consumer rule says to promote, and a central per-game `switch` that grows
with every port and has already harboured one shipped bug. The cheapest moment to
fix all of it is before port #13 copies the wrong patterns forward — the same
reasoning that motivated `refactor-pre-port-tidy` before port #5.

This change is scoped to the high-ROI, low-risk consolidations only. Larger items
the survey surfaced (a run-length desc codec shared by two games, splitting the
Midend's hint/mistakes lifecycle into controllers, adding `encode_ui`/`decode_ui`
persistence and a preferences hook) are deliberately **out of scope** — see
`design.md` for why each waits.

## What Changes
- **Promote the recessed bevel border** to `src/native/engine/draw.ts` as
  `drawRecessedBorder(...)`. Five games carry the same two-polygon bevel
  (`fifteen`, `sixteen`, `twiddle`, `samegame`, `flood` — `samegame`'s copy is
  even commented "cloned from fifteen"). The highlight polygon is byte-identical
  across all five; the lowlight polygon appears in two windings that trace the
  **same filled pentagon** (verified — see `design.md`), so a single helper
  parametrised on the bounding-box edges + inset + the two colours covers every
  caller with pixel-identical output.
- **Promote `drawRectOutline`** to the same module. Three consumers (`flood` and
  `blackbox` each have a private copy; `galaxies` inlines the four `drawLine`
  calls). The copies use two off-by-one conventions; the helper canonicalises on
  the **upstream-faithful inclusive** form (`x..x+w−1`, as `blackbox`/`galaxies`
  use) and `flood`'s single call site drops its compensating `−1` so its drawn
  pixels are unchanged.
- **Promote `permParity`** to `src/native/engine/shuffle.ts` (already the
  permutation-utility module). Byte-identical in `fifteen` and `sixteen`; the
  per-game parity-*correction* (conditional in Sixteen, unconditional in Fifteen)
  stays local.
- **Move the param→type-summary-config mapping into a `Game` hook.** The
  `decodeCustomParams` switch in `worker-adapter.ts` (~110 lines, nine per-game
  branches keyed on `this.puzzleId`, stringly-typed `"x" in p` access) becomes an
  optional `describeParams?(p: Params): ConfigValues` on the `Game` interface.
  Each game returns its own non-`w`/`h` config values from its own *typed* params;
  the adapter keeps the generic `{width,height}` base and spreads the hook's result
  over it. Future ports add a small typed method next to their params codec instead
  of a branch in a central file — and the typed params remove the `as Record`
  casts and the boolean-as-string foot-gun that bit Guess (already fixed in
  `ee87236`; the typed hook makes the class of bug unrepresentable).

## Impact
- **Affected specs:** `ts-engine` (4 ADDED requirements: recessed-border helper,
  rect-outline helper, permutation-parity helper, the `describeParams` config
  hook).
- **Affected code:**
  - New: `src/native/engine/draw.ts` (+ `draw.test.ts`).
  - `src/native/engine/shuffle.ts` (+ `permParity`), `game.ts` (hook on the
    interface), `worker-adapter.ts` (switch → hook dispatch), `worker-adapter.test.ts`.
  - `src/native/games/{fifteen,sixteen,twiddle,samegame,flood}/` (recessed border),
    `{flood,blackbox,galaxies}/` (rect outline), `{fifteen,sixteen}/state.ts`
    (`permParity`), and the nine games with custom params (`describeParams` impls).
- **Behaviour:** no visible change intended. Every migrated draw call is
  pixel-identical (the bevel windings fill the same region; flood's outline
  call-site arithmetic compensates for the convention switch), and the config hook
  produces the same `ConfigValues` the switch did. Enforced by the full pre-commit
  gate plus the new direct helper tests and the existing tier-2 render-ops tests
  for the affected games.
