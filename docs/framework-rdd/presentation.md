# Presentation — the tile renderer the framework owns

> **⚠️ STATUS: design fiction** — describes a system that does not exist.
> Authored by `rewrite-game-dev-docs` (2026-08-07). Current truth:
> [`docs/games/`](../games/README.md). See the [vision README](./README.md).

> **This is the vision's one remaining unfalsified claim** (2026-09-09). Every
> other part has reported: the definition end shipped twice as helpers and was
> withdrawn three times, `re-express-the-collection` archived done on 2026-09-06,
> and the deduction end's generator projection was measured on 2026-09-08 and
> found a near-zero correctness case. Presentation is the only claim left with
> real money on it and **no measurement against the tree**.
>
> **`explore-the-tile-loop-inversion` is the change that will test it** — not
> ready, an `/opsx:explore` as task 0, and it may withdraw this document the way
> rows 3–5 of the README were withdrawn. Its first job is the number below that
> nobody has taken: *~80 lines of identical bookkeeping per game*. Three things
> already say it is not 80 — part of the benefit ships today (`OverlaySidecar`
> in 19 games, `border-grid-render.ts`, `raised-bevel.ts`, the shared thick-rect
> outline, and `hint-overlay.test.ts`, a **derived** paint-twice guard that
> already asserts the hint overlay survives the cache for every hinting game);
> see [`guarantees.md`](./guarantees.md) § "What every game gets asserted, per
> capability" for what is and is not watched. **Read the exploration's verdict
> before building anything described below.**

## This is not the scene graph, and the difference is the design

The collection already tried a declarative rendering pivot once —
`Game.scene()` plus a per-frame reconciler — and withdrew it after owner
acceptance surfaced a real animation-performance regression
(`openspec/postmortems/2026-05-21-scene-graph-withdrawal.md`). That postmortem
sets this document's boundary: **no retained tree, no reconciler, no per-frame
diffing of a declarative structure.** What ships instead is the pattern every
game already hand-writes, with its bookkeeping inverted into the framework:

- Today: each game's `redraw` iterates its cells, packs an `Int32Array` key,
  compares against the cached key, calls its own paint function on a miss,
  commits the key, and hand-threads every overlay through an
  `OverlaySidecar` — ~80 lines of identical bookkeeping per game wrapped
  around ~10 lines that are actually the game's.
- Framework: the game declares `tileKey(state, ui, i): bits` and
  `paintTile(dr, i, key, overlays): void`; the framework owns the loop, the
  cache, the miss test, the overlay sidecars (hint, mistake, reference — every
  declared overlay is *in the diff key by construction*), the commit, and the
  first-frame background fill in the game's declared background color.

The paint call is exactly as imperative as today, runs at the same time it
runs today, and emits the same ops the recording double already asserts on.
Nothing is retained between frames but the key arrays that are retained today.
The withdrawn experiment failed because it inserted a new abstraction between
the game and the canvas; this design deletes bookkeeping *around* the existing
one. If a future measurement shows even that inversion costing frames, the
escape hatch below is the whole answer — but the burden of proof sits with
measurement, per the postmortem's own rule.

**What this kills by construction:** the overlay-not-in-the-diff-key bug — the
single most-repeated rendering defect in the collection's history (Towers'
invisible mistake overlay was only the first). An overlay the framework
manages cannot be omitted from the key, and the paint-twice guard runs for
every declared overlay on every game from the conformance suite, not from a
per-game test someone remembered to write.

## What a game declares

- **Board geometry**: ~~from the board model
  ([`game-definition.md`](./game-definition.md))~~ — tile size baseline,
  `computeSize`, coordinate maps. **The board model is withdrawn (2026-09-06)**,
  and the half of this bullet worth keeping survives without it: a game supplies
  its coordinate pair centrally once, used by input and paint both. That is the
  existing "one function, both callers" rule made structural by *exporting one
  function*, which Mines (`borderFor`) and Bricks (`offsets`) already do and
  eight games do not — `unify-the-board-origin`.
- **`tileKey`** — the packed per-cell key. The framework provides the packing
  helpers and refuses silently-truncated packs (a key wider than 32 bits
  fails loud at declaration; the Solo parallel-arrays answer becomes a
  declared multi-plane key rather than a hand-rolled second array).
- **`paintTile`** — imperative, exactly today's cell painter.
- **Overlays** — named planes (`hint`, `mistake`, `reference`, plus
  game-specific ones) with their pack functions; the sidecar mechanics are
  invisible.
- **Decorations** — the non-tile passes some games need (grid lines drawn as
  negative space, second-pass diagonals, borders); ordered explicitly before
  and after the tile loop, so the Spokes corner protocol is a declaration,
  not a comment.
- **Animation** — `animLength`/`flashLength` as today, plus per-move
  interpolators the framework schedules; the flash is the shared `winFlash`
  helper by default. Drag sprites that cross cell boundaries declare a
  blitter sprite; cursors default into the tile key (the existing rule, with
  the Spokes-style exception available by declaring the cursor a sprite).
- **Palette** — unchanged from the current three-layer discipline; the
  framework's contribution is only that a game's color list is derived from
  the meanings it names, so an unused palette entry or an unnamed literal is
  a type error rather than an inventory-test catch.

## The escape hatch

`redraw` remains available, verbatim, with today's contract — Untangle's
rational-coordinate canvas, Inertia's full-board repaints, or anything the
tile model genuinely does not fit, keep it. Obligations that follow a bespoke
`redraw` (conformance-enforced): every declared overlay still renders (the
paint-twice guard runs regardless), the doctrine invariants hold (no pixels
from the engine, `canvasCleared` honored), and the game carries its own
tier-2.5 scenario tests for what the framework can no longer generate.
