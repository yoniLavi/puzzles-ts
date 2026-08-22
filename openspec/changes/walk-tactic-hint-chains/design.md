# Design

## Context

`audit-guessing-tier-names` design D9 settled that a **Tactic** — a bounded chain
of forced consequences — keeps its middle tier, and that its hint owes the player
a walk rather than a compressed claim. Seven games ship a Tactic and none walks
it. This change is that debt.

The proposal assumed the walk was a delivery change: emit the chain as a
`continuesPrevious` journey, since the machinery exists and Sixteen uses it.
**That assumption is wrong**, and the session of 2026-08-12 established what
replaces it.

## D1 — A what-if walk has no shape in the engine, and that is the whole problem

Every journey in the collection is **a sequence of real moves**: Sixteen's
slides, Undead's per-cell strikes, Spokes' saturated-hub lines. The player
performs each leg.

A Tactic's chain is not that. Its middle legs are the forced consequences of a
hypothesis *that is about to be refuted*, so they are cells the player must
**not** play:

> suppose red → then this must be blue → then that red → **which seals the ringed
> tile off from its own colour. Impossible, so the first cell is blue.**

Only the last leg is a move. And `HintStep.move` is **required**, so a
"watch this" leg cannot be expressed.

Three options were weighed:

| | cost | what the player gets |
| --- | --- | --- |
| **Repeat the final move on every leg** | none | `hintKeepTrack` completes the journey at leg 1, so a player stepping manually never sees the walk — it would exist only under Auto-Hint |
| **Display-only leg** (`move?: Move`) | midend step-advance, `executeHint` and `hintKeepTrack` all assume a move exists; permanent widening of a contract 29 games' types live under | one inference at a time, board state accumulating — exactly D9's bar |
| **Enrich one step** | none; Clusters already renders every forced cell | the whole argument at once, with the board carrying the middle |

## D2 — Owner decision (2026-08-12): enrich one step, and draw the path

The question the owner put is the one that decides it: *does the walk exist to
stop the player holding a hypothesis in their head?* If so, a display-only leg is
the only honest answer. **The owner's answer was that holding a hypothesis is
fine** — what is not fine is holding the *chain*.

That is a materially weaker requirement and one enriched step meets it, because
the board already carries the chain: Clusters marks every forced cell with the
colour the hypothesis gives it. What was missing was the **order** and the
**link to the contradiction** — the reader could see five marked cells but not
which came first or where it ended.

So: **one step, plus an arrow path from the hypothesis through each forced
consequence to the break.** The narration names the two ends and the *count* of
what lies between, and lets the arrows carry the middle:

> *"Suppose this cell were red. Follow the arrows: 4 more cells are forced, and
> then the ringed tile could no longer touch two of its own colour — impossible.
> So it must be blue."*

This is deliberately **not** "the walk bar, met". It is the bar, revised, on the
grounds that the pedagogic claim behind the stricter version was not one the
owner wanted to make. Record it that way rather than as a victory — a future
reader who finds `PENDING_WALK` retired should be able to see that the list was
retired by a decision and not by seven implementations.

**Consequences for the change's shape:** the engine contract is untouched, so
this is per-game narration and rendering only. `HintStep.move` stays required.
The Latin family still needs its chain recorded (`latin.ts` `forcing()` throws
the BFS path away), because there is no path to draw without it — that part of
the proposal survives intact.

## D3 — The prototype, and what it is worth

Built and rendered on 2026-08-12; kept as
[`reference/arrow-prototype.patch`](./reference/arrow-prototype.patch) with a
sample frame at [`reference/arrow-prototype.svg`](./reference/arrow-prototype.svg)
(10x10 Tricky, seed 1, a 4-link chain). Reverted rather than committed, because
the finding in D4 has to be settled first.

What it does, and what to keep from it when this change is implemented for real:

- `COL_HINT_PATH` (index 11), drawn in **`ORANGE`, the danger ring's own
  colour** rather than a fourth hue — the path and the ring are one argument
  ("start here, and this is where it ends"), and a colour of its own would
  claim they were separate roles.
- The arrows are drawn in **a pass after the tile loop**, because they cross
  tile boundaries, and are redrawn on every frame a chain is displayed rather
  than diffed: they are a handful of lines, and a tile repainting under one
  would otherwise cut it in half. Dropping the hint clears the sidecar, which
  stales every path tile, so the repaint erases them.
- **Consecutive links are not necessarily adjacent.** `chainToContradiction`
  re-scans the board row-major after each forcing, so a leg can jump across the
  grid. The prototype draws the jump. That is a true fact about the deduction
  and the picture is allowed to say it — reordering the chain into a spatial
  path would be a lie. Whether long jumps read acceptably is the main thing to
  look at when reviewing the frame.

## D4 — Found while prototyping: Clusters' hint target was invisible — **fixed, 2026-08-12**

`COL_HINT` resolves to `HINT_ACTION`, which **is** `BLUE`
(`engine/colour/palette.ts:175`). Clusters' `COL_1` — its blue *tile* — is also
`BLUE` (`clusters/render.ts:74`). They are the same value.

`drawTile` fills the hint target with `COL_HINT`, on the stated reasoning that
"the hint target and a chain's what-if cells are always empty cells, so their
highlight takes the fill (nothing underneath to hide)". The consequence is that
**the hypothesis cell is painted the exact colour of a placed blue tile**. In the
sample frame it is indistinguishable from its neighbours, and the arrows appear
to start from nowhere.

Two things make this worse than a collision:

1. **It is not merely invisible, it is wrong half the time.** The target is
   filled blue whatever colour the deduction concludes. On a firing that
   concludes *red*, the board says blue and the sentence says red.
2. **`scripts/checks/colour-collide.test.ts` exists for exactly this** — it was
   written after Subsets collapsed three hint roles into one blue — and it is
   advisory, so nothing failed. Re-run it and read the Clusters section before
   deciding the fix; the report is the instrument, not the guess.

This was a pre-existing defect independent of the arrows, and it was **fixed
before this change starts** rather than carried as its task 0 — it is a live
rendering bug on `main`, not a cost of the arrows.

**The fix: `COL_HINT` is `PURPLE` in Clusters.** The collide report was read
first, as the method requires, and it named the pair (`COL_1 = COL_HINT`)
exactly. The usual resolution — cross-game role wins, local role yields
(`add-sticks-hint`) — is unavailable here: the local role is a **rule of the
game**, one of the two colours the player paints, named to them by
`help/games/clusters.md`. So the hint role takes the substitute this repo already
reaches for when blue is spoken for (Sticks' and Subsets' cursors). Verified:
the pair is gone from the report, no new pair appeared, the dark-scheme check is
unchanged, and the snapshot diff is **two ops, one per frame, an `rgb` value
each** — no op added, moved or removed.

**The transferable half is why nothing caught it.** `clusters-hint.test.ts`
asserted `op.colour === COL_HINT` — a **palette index**, not a colour. That
assertion is satisfied no matter what the index resolves to, so it stayed green
through the entire period the target was painted the same blue as a placed tile.
It is this repo's recurring shape — *the assertion names a proxy for the property*
— and `colour-collide.test.ts` is the non-proxy instrument, but it is advisory,
so it reported the pair for months and failed nothing. The game now carries a
direct assertion that **no hint role resolves to a colour the board already
uses**, and that the three hint roles are distinct from each other.

## D5 — The glyph is a **number**, not an arrow (measured, 2026-08-21)

D2 settled *what* the frame owes the player — the order, and the link to the
break — and named an arrow path as the way to draw it. Implementing it started by
asking what an arrow between two chain cells actually **claims**, and the answer
retires the arrow.

An arrow from `c[k-1]` to `c[k]` says *this one forces that one*. Over **140
chain firings** on 7x7 and 10x10 Tricky boards (60 boards, every firing in every
plan):

| | |
| --- | --- |
| consecutive links where the predecessor is load-bearing | **279 / 425 (65.6%)** |
| consecutive links between orthogonally adjacent cells | 206 / 425 (48.5%) |
| firings where the break sits on, or beside, the *last* forced cell | **140 / 140** |
| chain length | median 2, mean 3.04, max 9 |
| other hypothetical marks within the rules' reach of each link | mean 1.78 |

So **a third of the arrows assert a dependency that is not there**. What forces
`c[k]` is its own neighbourhood on the accumulated hypothetical board;
`chainToContradiction` re-scans row-major after each forcing, so the cell before
it in *discovery order* is frequently irrelevant — and, half the time, not even
nearby, which is why the prototype frame reads as a scribble crossing the board.

The dependence test is one-directional and that is what makes it usable: emptying
a cell can only shrink `same`/`other` in `neighbourCounts`, so removing the
predecessor can never *create* an error. A cell that stops being forced therefore
really did depend on it; the 65.6% is a ceiling, not an estimate.

**An ordinal claims exactly what is true** — the order the consequences fall in —
and nothing more. Three consequences follow:

- **No glyph is needed for the link to the break at all.** The contradiction is
  on or beside the final forced cell in every firing measured, so the ring is
  already sitting next to the highest number.
- **The whole post-tile pass disappears.** D3's arrows crossed tile boundaries,
  which forced a second drawing pass, a full-canvas `drawUpdate` on every hint
  frame, and the no-diffing rule that went with it. A digit is inside one tile,
  so it rides the existing `OverlaySidecar` diff untouched.
- **The highlight type does not change.** `chain` was already in causal order;
  only the drawing threw the order away. The ordinal is the array index.

Kept from D3: the mark is the **danger ring's orange**, for D3's own reason — the
ordered chain and the place it ends are one argument, and a fourth hue would
claim they were separate roles.

Two things the frames settled that only rendering could
(`toSvg`, 10x10 Tricky, chains of 2 / 4 / 6):

- The digit goes **top-left, not on the colour mark**: the mark says *what* the
  cell would become and the number says *when*, and overlapping them blurs two
  different claims.
- A cell that is both numbered and ringed is a **common** frame, not an edge
  case (the break lands on the last forced cell often), and at the shared inset
  the doubled ring painted straight over the digit. The ordinal is drawn after
  the ring and inside it.

## D6 — One value, two constraints: the evidence wash in dark (owner, 2026-08-21)

Owner acceptance found Keen's hint evidence unreadable in dark mode. Like D4 this
is a **live defect on `main`** rather than a cost of this change —
`HINT_EVIDENCE` has been `TEAL_WASH` since `consolidate-colour-palette` — so it
is fixed here, and the reasoning is worth keeping because two attempts were
wrong before the third was right.

**It is a scheme disparity, which fixes the target.** The same pairs, measured:

| on the evidence wash | light | dark (before) | dark (after) |
| --- | --- | --- | --- |
| pencil marks | 2.95 | **1.23** | **2.92** |
| entered digits | 3.41 | **1.71** | **4.04** |
| the tint itself, vs its board | 1.11 | 2.74 | 1.15 |

So the bar is *light mode's own numbers*, not an invented threshold — and the
last row is why "just darken it" is not free: the tint's visibility trades
directly against the readability of what sits on it.

**Attempt 1 — darken the wash. Impossible, and the sweep is what proved it.**
Any fill lighter than the board necessarily contrasts *worse* with a
mid-luminance mark than the board does, so the two goals move in opposite
directions along one axis. At the pencil's lightness the feasible band is
**empty**: 3:1 needs L ≤ 0.25, where the tint scores 1.1:1 against the board.

**Attempt 2 — darken `TEAL_WASH` anyway. The tests refused, and were right.**
`TEAL_WASH` is a member of `EIGHT_FILLS` and `FOUR_FILLS`; its dark lightness is
an *output* of the search that keeps Signpost's sixteen region colours and Map's
four mutually distinguishable. Moving it to 0.28 dropped Signpost's worst pair
from 0.071 to **0.050**. The grep that led me to believe it had one consumer
searched two files for one spelling — the instrument was too narrow, and the
suite was the thing that knew.

**What it actually is: one value serving two constraints that have diverged** —
"eight fills a player can tell apart" and "a fill a mid-luminance pencil mark
stays readable on". The repo names this shape elsewhere ("when one bound serves
two mechanisms, retiring the stricter one silently takes the looser one with
it"). So the role takes a step of its own: `TEAL_WASH_DEEP`, **identical to
`TEAL_WASH` in light** — no light-mode change, no snapshot churn — and
`[0.26, 0.06]` in dark.

**The chroma is measured, not derived.** The first value asked for the wash's own
0.077 at lightness 0.28. Teal cannot carry that there; the gamut clamp silently
returned **0.050 at L 0.293, hue 204.5**, and the separation from `HINT_FILL`
came out 0.106 against a 0.12 bound instead of the 0.124 the arithmetic
predicted. A conversion that clamps is a conversion whose output must be read
back rather than assumed.

**Two guards were bounded in one direction only.** `palette.test.ts` asserted the
hint fills are pale enough for dark content *in light* and said nothing about
dark — the exact shape the palette's own notes record from
`consolidate-colour-palette`, and the reason the value was free to drift to the
top of the band. It now asserts the dark fills clear the **derived** foregrounds,
stated as contrast rather than lightness because a lightness bound cannot predict
them: a saturated blue-purple at mid OKLCH lightness carries almost no luminance.
And `colours.test.ts`'s "names each colour once" keyed on the **light value
alone**, so it read two colours agreeing in light and differing in dark as one —
it keys on the pair now, which is what `colour-token.ts` says a token's identity
is.

## D7 — `HINT_FILL` has no colour that works, so the target is ringed (owner, 2026-08-22)

The second thing acceptance turned up: the target *fill* is low-contrast in
**both** schemes, not just dark. Behind a pencil mark it scores **1.91:1** light
and **1.96:1** dark; behind an entered digit 2.20 / 2.71. (Clue digits are fine
at 11.6 / 10.0 — it is the player's own marks that vanish.)

**There is no colour that fixes it, and that is a search result rather than an
opinion.** `BLUE_WASH` cannot move (an `EIGHT_FILLS` member *and* `DRAG_REMOVE`),
so the role would need its own step, as `HINT_EVIDENCE` just did — but:

- **Blue is impossible.** Clearing ~2.6:1 against the pencil needs a wash at
  lightness **≥ 0.90**; a blue wash there is under 0.13 from `HINT_EVIDENCE`
  (teal at 0.94). *The pale end has room for exactly one cool wash and the
  evidence has it.*
- **Warm clears the contrast and collides with error.** Best amber (h≈60) lands
  **0.072** from `ERROR_WASH` in dark, best pink-magenta (h≈338) **0.107**,
  against today's 0.192 — the cell the hint points at starts to look like the
  cell that is wrong.
- **Re-siting *both* roles jointly** — fill anywhere in blue, evidence at any
  hue, both clearing 2.6 and separated from each other, from `HINT_ACTION` and
  from every other shared role — returns **no feasible arrangement at all**. Two
  content-bearing washes plus a mid-luminance pencil mark do not fit in a
  twelve-colour palette.

(Proximity to `PAPER` looked like a fourth objection and is not: today's evidence
is already 0.094 from it, closer than any candidate. Worth checking a baseline
before treating a number as a defect.)

**So the answer is not a colour.** Ring the target instead of filling it: a ring
sits beside the content, so the constraint disappears rather than being traded,
and it can use `HINT_ACTION` — the emphatic blue this cell always meant.
`palette.ts` calls action and fill "one role by name and two by function";
ringing collapses them back into one.

**It also fixes something nobody had listed as a defect.** The fill was applied
only when nothing was struck in the cell — because a strike's crossed-through
digits had to stay legible — so on a strike step the target carried *no
cell-level mark at all*. Both kinds of target ring identically now, and the
hidden-single frame gets its missing evidence cell back (the line shades `w`
cells rather than `w − 1`, because the target no longer takes the background for
itself).

Prototyped in **Keen** and verified in both schemes. Six games still fill:
group, solo, undead, unequal, towers, filling. The guard asserts the *shape* —
four thin rects, none solid — because "some rect is `COL_HINT`" is exactly what a
fill also satisfies.

## Open Questions

- Do the numbered ordinals earn their place alongside the arrows, or is the
  arrow order enough? The prototype omits them; a long jump may need them.
- Does the Latin family's chain — 3–12 links with a **case split on the origin
  cell** — survive the same treatment? A path drawn through a case split is two
  paths, and D9's own note says a final leg that does not follow from its stated
  premises is a defect. Clusters has no case split, so it is the easy one, and
  the six Latin games are where this design will actually be tested.
