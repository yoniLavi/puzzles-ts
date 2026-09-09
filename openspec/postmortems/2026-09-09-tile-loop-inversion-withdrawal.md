# Postmortem: the framework-owned tile loop, withdrawn before implementation

**Date:** 2026-09-09
**Status:** Withdrawn. `explore-the-tile-loop-inversion` is deleted;
`docs/framework-rdd/presentation.md`'s tile renderer is struck through and the
vision's last unfalsified claim has now reported.
**Superseded by:** `widen-the-mistake-overlay-coverage-key`, scaffolded from
this exploration's actual finding.

## TL;DR

`presentation.md` proposed that a game declare `tileKey(state, ui, i)` and
`paintTile(dr, i, key, overlays)` and receive in return the tile loop, the
cache, the miss test, the overlay sidecars, the commit and the first-frame
background fill — on the strength of one number:

> ~80 lines of identical bookkeeping per game wrapped around ~10 lines that are
> actually the game's.

**Nobody had taken that number. It is wrong by about a factor of four, and it is
inverted.** All 57 `redraw` bodies were read and classified line by line:

| | claimed | measured (median) |
| --- | --- | --- |
| bookkeeping the framework could own | ~80 | **20** |
| the game's own, inside `redraw` | ~10 | **64** |

No game in the collection reaches 80 lines of bookkeeping. The largest is
Subsets at 64 by a deliberately generous instrument, ~29 when read by hand.
Across the whole collection the bookkeeping is **1,312 lines of 6,062** of
`redraw` code (21.6%) and **4.6% of the 28,595 lines** of `src/games/*/render.ts`.

Two of the three falsifier clauses the change named for itself fired:

- ~~fewer than half of the 57 games have a one-tile repaint unit~~ — **did not
  fire**: 31 of 57 do (54%).
- the per-game bookkeeping median is under ~30 lines — **fired**: it is 20, and
  only 14 games of 57 exceed 30 even under the generous instrument.
- task 0.4 finds no live defect of the class — **fired**: all 38 games whose
  `redraw` takes a `mistakes` parameter route the overlay into the diff key
  correctly. There are zero live instances of the defect the inversion was to
  kill by construction.

## What was proposed

From `docs/framework-rdd/presentation.md`:

> - Today: each game's `redraw` iterates its cells, packs an `Int32Array` key,
>   compares against the cached key, calls its own paint function on a miss,
>   commits the key, and hand-threads every overlay through an `OverlaySidecar`
>   — ~80 lines of identical bookkeeping per game wrapped around ~10 lines that
>   are actually the game's.
> - Framework: the game declares `tileKey(state, ui, i): bits` and
>   `paintTile(dr, i, key, overlays): void`; the framework owns the loop, the
>   cache, the miss test, the overlay sidecars …, the commit, and the
>   first-frame background fill.
>
> **What this kills by construction:** the overlay-not-in-the-diff-key bug — the
> single most-repeated rendering defect in the collection's history.

## What the exploration did

Four instruments, each checked against something outside itself before its
finding was believed, per `AGENTS.md` § "Method".

1. **Extract every `redraw` body** by brace matching, and count code lines.
2. **Classify every line** B (bookkeeping the inversion would own) or G (the
   game's own — including the *contents* of the tile key, which under the
   inversion the game still writes as `tileKey`, and every decoration pass,
   which the inversion only re-orders).
3. **Census the cached repaint populations** per game, to answer what a cache
   miss actually repaints.
4. **Trace the mistake data** from the `redraw` parameter to the miss test, in
   every game that takes it, and then drive four of them behaviorally.

### Three instrument errors, caught and corrected

Recorded because each is the catalogued trap and each changed a number.

- **The extractor keyed on `^export function redraw\(` and found 52 of 57.**
  Five games spell the export `redrawAscent`, `redrawBridges`, `redrawFilling`,
  `redrawSignpost`, `redrawUntangle` — Bridges legitimately, because its
  signature is not `Game.redraw`'s. Widening the key to `redraw\w*` recovered
  all five, and moved the median redraw body from 80.5 to 88. A scan keyed on a
  name finds only the games named that way.
- **The population census keyed on `ds.x[i] !== …` and reported eleven games
  with no diff cache at all.** Slant, Slide, Pearl, Signpost, Tracks and Net
  write the same test with the operands the other way round
  (`todraw[i] !== ds.grid[i]`). Accepting both orders cut the eleven to five,
  and the five are real (Cube, Guess, Loopy, Untangle, and Blackbox, whose test
  lives in its paint helper).
- **The line classifier's first cut was generous to the point of lying.** Its
  overlay rule matched any line naming a hint or mistake, which swept in the
  hint-frame *drawing* — it reported B=91 for Subsets, whose real bookkeeping is
  ~29. The fix is the rule that a line which paints is the game's, always:
  `paintTile` is "exactly today's cell painter" by the vision's own text. That
  one rule moved the collection median from 26 to 20.

**And the corrected classifier was checked in both directions.** Every G-tagged
line in all 57 bodies whose *shape* looks like bookkeeping was listed and read:
83 candidates, of which ~30 are genuine under-tags (about half a line per game),
against known over-counts of ~35 in Subsets alone. The instrument still leans
generous, which is the right lean for a falsifier.

## Finding 1 — the number is 20, not 80, and the ratio is inverted

57 of 57 `redraw` bodies extracted and classified. 6,062 code lines in total.

| | median | q1 | q3 | max |
| --- | --- | --- | --- | --- |
| whole `redraw` body | 88 | — | — | 349 (Ascent) |
| bookkeeping (B) | **20** | 15 | 27 | 64 (Subsets) |
| the game's own (G) | **64** | 43 | 95 | 302 (Ascent) |

- **Zero games reach 80 lines of bookkeeping.** 14 of 57 exceed 30.
- Bookkeeping by kind, across the collection: closing braces 332, loop headers
  232, the `started` flag 133, cache commits 118, overlay indexing 93, sidecar
  calls 79, `drawUpdate` 78, miss tests 72, preamble 71, background fill 51,
  index math 36, clip/unclip 17.
- **The count is essentially complete.** A cross-check for cache protocol living
  *outside* `redraw` — in a paint helper, where a redraw-only count would miss
  it — found **15 lines in the whole collection**, most of them
  `ds.started = false` in `canvasCleared`. Blackbox is the only game that keeps
  a real miss test in its painter.

Six bodies were also read and counted by hand as a calibration — Mosaic ~19,
Mathrax ~18, Singles ~17, Range ~19, Palisade ~14, Subsets ~29 — against
classifier figures of 15, 20, 17, 19, 18 and 64. The classifier is within ~20%
except where a game's overlay painting is elaborate, where it over-counts.

**Why the claim was so far out is worth stating**, because it is a reasoning
error the next vision can repeat: the median *whole* `redraw` is 88 lines, which
is close to 80. The claim appears to have taken the size of the thing and
attributed all of it to the ceremony around it. What the reading shows is that a
`redraw` is mostly the game — its key bits, its flash policy, its decorations,
its cell painter's arguments — wrapped in about twenty lines of loop and cache.

## Finding 2 — the repaint unit fits 31 games, and this is the clause that did *not* fire

Classified by the test *what does one cache miss repaint?*:

| Class | Count | Games |
| --- | --- | --- |
| **A** one tile in, one tile out | **31** | bricks, clusters, dominosa, filling, flip, flood, galaxies, inertia, keen, lightup, mathrax, mines, mosaic, net, palisade, pearl, pegs, range, rect, rome, samegame, seismic, separate, signpost, singles, slant, sokoban, solo, sticks, unequal, unruly |
| **B** tile + named neighbors | 6 | ascent, bridges, map, spokes, subsets, towers |
| **C** several cached populations | 11 | abcd, blackbox, boats, crossing, group, magnets, pattern, salad, tents, tracks, undead |
| **D** moving tiles (paint position ≠ cell) | 5 | fifteen, netslide, sixteen, slide, twiddle |
| **E** no tile model at all | 4 | cube, guess, loopy, untangle |

Multiple parallel key *arrays* for one population count as class A — Solo's
`tiles`+`pencil`, Galaxies' `cache`+`dx`+`dy`, Unequal's `nums`+`flags`+`hints`
— because the vision explicitly provides for a multi-plane key.

**So the axis is not wrong, and this is the honest half of the result: a
majority of the collection does have the shape the inversion assumes.** It is
the *value* of serving them that fails, not the fit.

Three observations that sharpen what a future attempt would face:

- **Class C is where the tile loop stops covering the board.** Eleven games run
  a second and sometimes third diffed pass — clue strips (Magnets, Pattern,
  Tents, Tracks, Boats, Salad, Abcd), a legend (Group), a number panel
  (Crossing), laser buttons (Blackbox), edge-clue count displays (Undead). The
  framework's one loop owns the cells; each game keeps the rest by hand, and
  those passes carry their own miniature bookkeeping the inversion does not
  reach.
- **Class D breaks `paintTile(dr, i, key, overlays)` outright.** In the sliding
  and rotating games the paint position is interpolated, so there is no
  parameter for where the tile actually goes.
- **The vision is wrong about one of its own two named escape hatches.**
  Inertia is cited for "full-board repaints"; it has an entirely ordinary
  per-tile cache (`ds.grid[y*w+x] !== v`) with a blitter for the ball, 77 code
  lines and 20 of bookkeeping. The genuine no-tile-model games are Cube, Guess,
  Untangle and — unmentioned — **Loopy**, which repaints its whole canvas every
  frame across fifteen grid types including the aperiodic tilings.

## Finding 3 — a good share of the deliverable list has already shipped

Walked item by item, which is the lesson row 4 paid for.

| `presentation.md` promise | On disk today | Consumers |
| --- | --- | --- |
| the tile loop | — | 0 |
| the cache | — (each game's own typed array) | 53 of 57 hold one |
| the miss test | — | ~41 |
| **overlay sidecars** | **`engine/overlay-sidecar.ts`** — repack/stale/commit, three pack entry points | **19 games** |
| the commit | partly, via `OverlaySidecar.commit` | 19 |
| first-frame background fill | — **deliberately**: "the engine paints no pixels of its own" is doctrine, and `unify-board-background` (2026-09-02) settled the *color* rather than the ceremony | 56 of 57 carry a `started` flag |
| palette derivation | partly — the three-layer palette with named meanings (`color/palette.ts`, `palette-games.ts`, `color-token.ts`); not a type-level derivation | all 57 |
| animation scheduling | **yes** — the midend owns `animLength`/`flashLength` and the timer; `winFlash` is shared | 36 games import `flash.ts` |
| blitter sprites | **yes** — the `GameDrawing` blitter API | 8 games |
| packing helpers that refuse silent truncation | — nothing checks a key's width | 0 |
| decorations, ordered explicitly | — (it is plain source order) | — |
| **the coordinate pair, one function both callers** | **shipped** — `unify-the-board-origin` (2026-09-06) | 31 games import `engine/geometry.ts` |

And the shared *paint* helpers the vision does not list, which are the same kind
of win arriving on the mechanic axis rather than the loop axis: `draw.ts` (32
games — including the raised tile bevel, 6, and the thick-rect outline, 12),
`hint-mark.ts` (24), `note-taking-cell.ts` (11), `pencil-indicator.ts` (10),
`border-grid-render.ts` (2).

## Finding 4 — the defect it kills by construction does not exist, and mostly cannot

**38 of 57 `redraw` bodies take a `mistakes` parameter. All 38 route it
correctly** — into the packed diff key, or into an `OverlaySidecar` whose
`.stale(i)` is a clause of the miss test. The full path was traced in each.

Of the other 19: fifteen declare no `findMistakes` at all; Slide, Sokoban and
Untangle say in their headers why they never will; and **Clusters** declares
`findMistakes` but recomputes `findErrors` inside its renderer and folds the
result into the key, so its error overlay is live and the hook exists only to
refuse a save. Not a defect.

Behavioral corroboration on four games from
`mistake-overlay-coverage.test.ts`'s own shortfall ledger — solve, spoil one
cell, settle, Check & Save:

| Game | settled frame | frame after Check & Save |
| --- | --- | --- |
| keen | 0 ops | 14 ops |
| unequal | 0 ops | 7 ops |
| group | 0 ops | 10 ops |
| undead | 0 ops | 13 ops |

The `settled = 0 ops` column is the control, and it is the reason the probe
means anything: without it a game that repaints unconditionally would report
health. **And the probe was proven to fail before it was believed** — deleting
`|| ds.wrong.stale(i)` from Keen's miss test takes its frame to 0 ops.

**The structural reason this class is smaller than it sounds, which is the part
worth carrying forward.** A game that folds its overlay bit into the packed key
*cannot* have this bug: the key changes, so the cell repaints. The construction
the vision offers already exists, and it is the packed key. The bug is only
expressible where the overlay is handed to the painter *beside* the key — the
sidecar games and Galaxies' hand-packed wall mask — and every one of those
carries the stale clause. So "kills by construction" would buy a guarantee
against a defect that is already impossible in most of the collection and
already guarded in the rest.

## Finding 5 — what the exploration actually found: a coverage ledger that under-reports

`src/mistake-overlay-coverage.test.ts` carries a ratcheted ledger of 17 games
that "offer `findMistakes` but never render its overlay in a test", and says the
list may only shrink. **At least six of the seventeen already have the test.**

The ledger keys coverage on the string `showMistakes` — `renderScenario`'s flag.
There are two other spellings in the tree, and both are older:

1. `midend.findMistakes()` between two `midend.redraw()`s — the shape
   `docs/games/rendering.md` § "Prove the overlay repaints" names Towers'
   exemplar. **abcd, keen, lightup, rome.**
2. `game.findMistakes?.(state)` passed straight into a direct `redraw(...)` call.
   **galaxies, map.**

Galaxies' is the strongest mistake-overlay test in the collection — three
frames, including the one that proves the overlay *clears* — and
`docs/games/rendering.md` cites it by name as an exemplar while the ledger lists
it as uncovered.

Verified by mutation rather than by reading: planting the defect (dropping the
overlay's stale clause from the miss test) turns a test red in **keen, abcd,
rome and galaxies**. Lightup's and map's were read; both warm a drawstate, turn
the overlay on, and assert the second frame paints.

This is `AGENTS.md` § "A scan that keys on a name" landing on a guard whose own
header says its key "is not a name a game chose". It is, though — it is the name
*one harness* chose, and four games' tests predate that harness.

Filed as `widen-the-mistake-overlay-coverage-key`.

## What this leaves standing

**The scene-graph postmortem's bar is untouched and was never reached.** That
rule — no framework-scale render pivot without a real game pressuring it — would
have blocked *building* the inversion. It did not need to: the inversion was
withdrawn on its own arithmetic, before the bar was consulted.

**And the owner question the change carried is answered by its own result.**
`explore-the-tile-loop-inversion` asked whether framework work continues to
precede the first greenfield game. The measurement says the question is moot for
*this* piece: there is no framework work here to sequence. Path and Numgame
remain the instruments that would price the next one, and they still carry the
instruction to log every question that is not about the puzzle.

## The rule this adds

**A vision's headline number is a measurement someone owes, and the size of a
thing is not the size of its ceremony.** `presentation.md` looked at an 88-line
`redraw` and reported 80 lines of bookkeeping. The 88 was right. What was never
checked is that 64 of it is the game — its key bits, its flash policy, its
decorations, its painter's arguments — and that the ceremony is twenty lines of
loop and cache that the collection has already been quietly deleting for a year,
one mechanic-keyed helper at a time.

That is the third time in this vision's life the same shape has appeared: the
gesture table, the board model, and now the tile loop were each proposed as a
declaration that would own a large derived block, and each was met by a tree
that had already served most of the block from modules keyed on **what the
player operates** rather than on **what shape the thing is**. Rows 3, 4 and 5
found it by reading the deliverable list. This one found it by reading the
number.
