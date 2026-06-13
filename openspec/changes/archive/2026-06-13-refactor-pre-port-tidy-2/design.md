# Design: Pre-port tidy #2

The four extractions are mechanical but each carries a subtlety worth recording,
because "move identical code to a helper" is only safe once you've verified the
copies are actually identical. They aren't always; the value of this note is the
verification, not the moves.

## D1 — Recessed border: parametrise on bounding-box edges, not (w,h,hw)

The five per-game copies each compute the playfield's outer pixel bounds and then
draw two filled pentagons (a top-right highlight wedge, a bottom-left lowlight
wedge). They differ in how they reach the bounds:

- `fifteen`/`sixteen`: `hw = max(1, floor(ts/20))`, edges `coord(0,ts)−hw` …
  `coord(w,ts)+hw−1`.
- `twiddle`: same, via a `highlightWidth(ts)` wrapper.
- `flood`: `hw = floor(ts/10)`, plus an extra outer separator rectangle.
- `samegame`: a *constant* `HW = 2` and an extra `−gap(ts)` on the right/bottom
  edges.

So a helper keyed on `(w, h, ts, hw)` would not fit `samegame` (constant HW + gap
offset) cleanly. The helper is therefore keyed on the **already-computed bounding
edges** plus the bevel inset and the two colours:

```
drawRecessedBorder(dr, { left, top, right, bottom }, inset, highlight, lowlight)
```

Each game keeps its own edge derivation (the part that legitimately differs) and
passes `inset = ts`. `flood` keeps its separator-rectangle draw at the call site;
only the bevel pentagons move.

**The one real subtlety:** the lowlight pentagon appears in two vertex orderings.
`fifteen`/`sixteen` trace `{left,top}→{left,bottom}→{left+ts,bottom−ts}→
{right−ts,top+ts}→{right,top}`; `samegame`/`twiddle`/`flood` trace
`{left,top}→{right,top}→{right−ts,top+ts}→{left+ts,bottom−ts}→{left,bottom}`. These
are the **same five vertices in reverse winding** — the same simple pentagon, and a
filled polygon is winding-independent, so both fill identical pixels. The helper
picks one canonical winding; output is pixel-identical for every caller. (The
highlight pentagon is byte-identical in all five and needs no reconciliation.)

## D2 — Rect outline: canonicalise on the upstream-inclusive convention

Upstream `draw_rect_outline(dr, x, y, w, h, colour)` draws the border from `(x,y)`
to `(x+w−1, y+h−1)` — inclusive. `blackbox`'s copy and `galaxies`' inline both
follow this (`x+w−1`, `+ size − 1`). `flood`'s copy instead draws to `(x+w, y+h)`
— exclusive — but compensates by passing `w = ts−1−inset*2` at its one call site,
so its drawn rectangle ends at the same pixel.

The promoted helper uses the **inclusive** convention (faithful to upstream and to
two of the three consumers). `flood`'s call site changes `ts−1−inset*2` →
`ts−inset*2` (drops the `−1` the helper now applies), keeping its output
pixel-identical. `galaxies`' inline four-`drawLine` block (a square cursor of side
`2·cursorSize+1`) becomes a single `drawRectOutline(dr, cx, cy, sz, sz, COL_CURSOR)`.

## D3 — `describeParams` hook: typed, additive, replaces the central switch

`worker-adapter.ts`'s `decodeCustomParams(params)` decodes the game's params then,
in a nine-arm `switch (this.puzzleId)`, maps them to the `ConfigValues` record the
type-summary formatter (`augmentation.ts`) consumes. The arms reach into an
untyped `Record<string, unknown>` with `"field" in p` guards — which is exactly
how the Guess branch came to encode booleans as the strings `"true"`/`"false"`
(NaN-ing out the annotation; fixed in `ee87236`).

The hook moves each arm to its own game module:

```ts
// on the Game interface (optional)
describeParams?(p: Params): ConfigValues;
```

The adapter becomes:

```ts
const p = game.decodeParams(params);
if (!p) return {};
const base: ConfigValues = {};
if ("w" in p && p.w != null) base.width = String(p.w);
if ("h" in p && p.h != null) base.height = String(p.h);
return { ...base, ...game.describeParams?.(p) };
```

Design points:
- **Typed params kill the bug class.** Each `describeParams` receives the game's
  real `Params`, so booleans are `boolean`, choice indices are `number`, and the
  `as Record`/`"x" in p` access disappears. The Guess string-boolean foot-gun
  becomes unrepresentable rather than caught-after-the-fact.
- **Additive over a generic `w`/`h` base.** Games whose params *are* `w`/`h`
  (most simple future ports) need no hook at all — the base covers them. Games
  with extra config implement the hook returning just the extras. Games whose
  size params aren't named `w`/`h` (Mosaic uses `width`/`height`) return those
  from the hook too (it spreads over and replaces the empty base). This matches
  today's behaviour exactly.
- **Naming.** `describeParams` (vs. `decodeCustomParams`, kept on the adapter
  surface, or `summariseParams`): the hook does not *decode* (params arrive
  decoded) — it *describes* params as the human-facing type summary's config
  values. The adapter method name is unchanged (it is the `PuzzleEngineSurface`
  contract).
- The adapter's `try/catch` (returning the error string on throw) stays in the
  adapter, wrapping the hook call.

## D4 — Scope boundary (what this change deliberately does not do)

- **Run-length desc codec** (`mosaic` + `galaxies` both letter-encode runs):
  same core trick, but each is wrapped in game-specific state traversal, and it
  is only a *two*-consumer pattern whose shared core is ~6 lines. Wait for a
  third consumer (a Pattern/Light-Up-family port is the likely trigger) before
  promoting, per the second-consumer rule's spirit (promote when the shared
  surface is real, not when two games rhyme).
- **Midend hint/mistakes controllers** and **`encode_ui`/`decode_ui` + prefs
  hooks**: both are architecture-shaped, and the "don't interleave architecture
  pivots with migration" doctrine applies — they need a real downstream game
  pressuring them, not a survey's "would be cleaner". The Midend is 904 well-
  layered lines faithfully mirroring `midend.c`; only `blackbox`'s session-only
  error counter currently wants UI persistence, which is not enough pressure.
