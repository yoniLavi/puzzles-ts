# unify-the-raised-tile-bevel

**Readiness: ready.** The survey below was run on 2026-09-05 and its numbers are
measured, not estimated. Owner approved the visual change in principle the same
day: *"I'm happy with a small visual change if it improves consistency."*

## Why

**Six games hand-derive the same raised-tile bevel, and the engine already owns
its sibling.**

The idiom is the classic raised block: a lowlight triangle over the bottom-right
half, a highlight triangle over the top-left half, and an inner rect that leaves
both showing as a border. Fifteen, Sixteen, Mines, Inertia, Sokoban and Pegs each
write out the vertex arithmetic, the winding and the order — about fifteen lines
apiece.

The engine already has the *sunken* counterpart. `drawRecessedBorder` in
[`engine/draw.ts`](../../../src/engine/draw.ts) draws the two-pentagon recessed
bevel for a playfield frame, and the `ts-engine` spec says of it: *"Games that
draw a beveled frame SHALL call this helper, each supplying its own edge
derivation, instead of re-deriving the polygons locally."* **Fifteen, Sixteen and
Mines call it for their frame and hand-roll the tile bevel in the same file.**
The raised sibling is simply the one nobody extracted.

## The measurement

Population found by *shape* — a `drawPolygon` with `COL_LOWLIGHT` and one with
`COL_HIGHLIGHT` in the same neighborhood — not by any helper's name, since there
is no helper. Seven sites in seven games; one leaves on inspection (below).

**The geometry is not drift, and this matters for scoping.** Fifteen, Sixteen and
Mines bevel `(x, y) … (x+ts−1, y+ts−1)`; Inertia and Sokoban bevel
`(x+1, y+1) … (x+ts, y+ts)`. That looked like an off-by-one until the tile bodies
were read: Inertia and Sokoban inset their tile by one pixel to leave a grid
line, and clip and fill `(x+1, y+1, ts−1, ts−1)` before the bevel. Each bevel
correctly follows its own game's tile body. **A helper taking a rect therefore
moves no pixels at all on this axis.**

**What is genuinely inconsistent is the bevel's thickness.** Four formulas, three
divisors, and an inconsistent minimum:

| Game | highlight width | at ts=24 | 32 | 48 | its preferred ts |
| --- | --- | --- | --- | --- | --- |
| Fifteen, Sixteen | `max(1, floor(ts/20))` | 1px | 1px | 2px | 48 |
| Mines | `max(floor(ts/10), 1)` | 2px | 3px | 4px | 20 |
| Inertia, Sokoban | `floor(ts/10)` | 2px | 3px | 4px | 32 |
| Pegs | `floor(ts/16)` | 1px | 2px | 3px | 33 |

So the same visual idiom carries a 1px border in Fifteen and a 3px one in Mines
at the same tile size. That is the consistency the change buys, and it is the
part that moves pixels.

**A latent gap, verified and honestly bounded.** Inertia, Sokoban and Pegs dropped
the `max(1, …)` floor the other three kept, so their `hw` reaches 0 at small tile
sizes and the inner rect then paints both triangles out entirely — the bevel
disappears rather than degrading. Measured through a real `redraw` against a
recording drawing: Inertia and Sokoban lose it at ts ≤ 8, Fifteen/Sixteen/Mines
keep it down to ts = 6.

**It is not a shipped defect, and should not be written up as one.** At ts = 8
Inertia's whole board is 83×67 px and Sokoban's 97×81 px, so the midend's
largest-tile-that-fits search never selects it on any viewport a player has. It
is a robustness inconsistency worth removing while the code is open, nothing
more. (The first probe of this counted *polygons emitted* and found no
difference at all, because the triangles are always drawn and merely covered —
the count was measuring the wrong thing.)

## The decision this removes

*Can we say what a game would legitimately want to do differently?* For the
vertex arithmetic and the winding, plainly not — it is one idiom, and the engine
already treats its sunken twin that way. For the **thickness**, a game could in
principle want a heavier block; but nothing in these six suggests a deliberate
choice, three of the four formulas differ only in a divisor nobody records a
reason for, and two of them are missing a guard the others have. That is drift,
not design.

## Not in scope

- **Twiddle**, which the shape scan catches and which is a different thing: four
  trapezoids meeting a center point, rotated during its animation, each side
  taking its own cursor-highlight color. It is not two triangles and should not
  be bent into them.
- **Pegs' draw order.** Pegs draws highlight-then-lowlight where the other five
  draw lowlight-then-highlight, and the two triangles share their diagonal, so
  the order decides a hairline of pixels. Either normalize it (and say so) or
  give the helper an order it always uses and accept Pegs' hairline moving —
  but decide it deliberately rather than discovering it in a snapshot diff.

## Impact

- Affected specs: `ts-engine` — an `ADDED` requirement beside the existing
  recessed-border one, which is the template for its wording.
- Affected code: `src/engine/draw.ts` (or a sibling), and the six games'
  bevel sites.
- **Player-visible, deliberately.** Bevel thickness changes in at least four of
  the six, so render snapshots *will* re-baseline — which inverts the usual bar.
  Every re-baselined snapshot line must be explainable by the declared change
  (the color-work rule), and the extraction must be split from the thickness
  change so the first commit is provably a no-op and only the second moves
  pixels. Run the app on all six.
