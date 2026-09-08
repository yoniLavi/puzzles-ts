# explore-the-tile-loop-inversion

Realizes: `docs/framework-rdd/presentation.md` — the tile renderer, the last
piece of the vision that has been neither shipped nor falsified.

**Readiness: NOT ready. Task 0 is an `/opsx:explore`, and this change may be
withdrawn by it.** That is the shape the README's rows 3, 4 and 5 established:
a not-yet-ready change holds the ordering and the constraints and defers the
design to an exploration, so that a falsifier can fire before a line of framework
is written. Three did.

## Why this one is still open

Every other part of the vision has reported. The definition end shipped twice as
helpers and was withdrawn three times; `re-express-the-collection` archived done
on 2026-09-06; the deduction end's generator projection was measured on
2026-09-08 and found to have a near-zero correctness case
(`assert-that-tiers-bind`). **Presentation is the only claim left with real
money on it and no measurement against the tree.**

Its central claim is a number nobody has taken:

> Today: each game's `redraw` iterates its cells, packs an `Int32Array` key,
> compares against the cached key, calls its own paint function on a miss,
> commits the key, and hand-threads every overlay through an `OverlaySidecar` —
> **~80 lines of identical bookkeeping per game** wrapped around ~10 lines that
> are actually the game's.

Some of that is plainly true in the aggregate: **50 of 57 games hold a typed-array
tile cache in `render.ts`**, and the defect class the inversion would kill —
an overlay missing from the diff key, so it never repaints — is the single
most-repeated rendering bug in this collection's history. But three things say
the number is not 80, and they are exactly the checks rows 3–5 taught:

1. **Part of the benefit already ships.** `OverlaySidecar` (19 games),
   `border-grid-render.ts`, `raised-bevel.ts`, the shared thick-rect outline, and
   `hint-overlay.test.ts` — a *derived* paint-twice guard that already asserts
   the hint overlay survives the cache for every hinting game — between them hold
   a good share of what presentation.md promises. Row 4 was withdrawn for exactly
   this: the thing it proposed was already in the tree under a different name.
2. **The axis may be wrong again.** `border-grid.ts` serves its two games
   completely because it is keyed on the *mechanic*; a topology-keyed board model
   was declined by 55 games. A tile-loop abstraction is keyed on "the repaint unit
   is one cell", and it is not obvious how many games that is. Towers repaints
   each tile up to four times inside one clip because a 3D tower spills into its
   up-left neighbors; Galaxies' overlay has four wall bits per tile; Spokes has a
   corner protocol; Untangle and Inertia are named escape hatches in the vision
   itself.
3. **jscpd cannot see it, and neither could the sweep.** Cross-game duplication
   is now 941 lines and batch B4 (the render residue) declined more pairs than it
   took. That is not evidence the bookkeeping is absent — it is evidence it is
   *structurally* the same and *textually* different, because each game's diff key
   is its own. Which means the only instrument that can answer this is reading,
   and nobody has read it.

**And the postmortem's bar applies to the build, not to the measurement.** The
scene-graph withdrawal set the rule that no framework-scale render pivot happens
without a real game pressuring it, and none exists today. That blocks shipping an
inversion; it does not block finding out what the inversion would be worth, and
finding out is cheap.

## What this change is

**A measurement and a go/no-go, not a renderer.** It ends in one of three places,
and all three are acceptable outcomes:

- **Withdrawn**, with a postmortem, if the population that fits without
  contortion is small or the benefit turns out to have shipped. Three of the
  vision's five definition-end rows ended here and the project was better for it.
- **Rescoped to a narrower mechanic-keyed module**, the way row 3's exploration
  produced `unify-the-note-taking-cell` and row 4's produced
  `unify-the-board-origin`. The obvious candidate is already visible: the
  **mistake overlay's staleness** is hand-written or absent in the games that do
  not use `OverlaySidecar`, and unlike the hint overlay it has no paint-twice
  guard — `mistake-overlay-coverage.test.ts` contains it with a ledger rather than
  by construction, because reaching a mistaken board takes a per-game move.
- **Promoted to a ready change**, if the measurement carries it *and* a
  greenfield game is available to pressure it.

## What needs deciding, and by whom

One question is the owner's and it is not a design question: **does framework
work continue to precede the first greenfield game?** The vision's economic
argument is about the cost of *adding* a game, and nobody has added one — Path
and Numgame are both scaffolded and both carry the instruction to log every
question that is not about the puzzle, which is the baseline this whole
effort is judged against. The measurement below can run either way; whether
its *build* waits for that pressure is the call.

## Impact

- Affected specs: none until the exploration reports.
- Affected code: none in this change.
- **The exploration itself must not write into this change directory after it
  starts reporting**, per the `openspec archive` rename hazard; its findings go
  in `tasks.md` § Findings as usual.
