# Design — add-loopy-keyboard-control

The proposal says what is broken and why it is a design rather than a binding.
This settles the design, on measured evidence, so implementation does not
re-derive it.

## The measurement the decision rests on

Every candidate rule stands or falls on the shape of the eighteen tilings, and
that shape was assumed rather than known. Measured across **all 23 presets** —
dot degree, i.e. how many edges meet at a vertex:

| Tiling | Degrees present |
|---|---|
| Squares | 2, 3, 4 |
| Triangular | 3, 4, 5, **6** |
| Snub-Square | 2, 3, 4, 5 |
| Cairo · Kagome · Great-Hexagonal | 2, 3, 4 |
| Kites · Floret · Penrose (rhombs) | 2, 3, 4, **6** |
| Penrose (kite/dart) | 2, 3, 4, 5 |
| Honeycomb · Octagonal · Dodecagonal · Great-Dodecagonal | 2, 3 |
| **Hats** | 2 (306), 3 (84), 4 (13) |
| **Spectres** | 2 (288), 3 (86), 4 (9) |

Two facts fall out, and neither was obvious in advance:

1. **Degree is small — at most 6 in this sweep** — on every tiling, so the
   arrow→edge mapping is a choice among a handful of candidates, not an
   open-ended one. *Correction at implementation (2026-09-02):* the sweep above
   used one seed per preset, and the coverage proof in `loopy-keyboard.test.ts`
   found a **degree-7** dot on Penrose (rhombs) with another seed. Nothing
   below depends on the number — the rule is stated in terms of degree, and the
   test asserts "small" (≤ 8) rather than six — but it is a reminder that a
   one-seed sweep measures that seed.
2. **The aperiodic tilings are the *easy* case, not the hard one.** Roughly
   three quarters of the dots on Hats and Spectres have degree 2 — a vertex
   sitting mid-run between two edges, where any sane rule does the obvious
   thing. The hard case is the **triangular grid**, where six edges meet at
   60° intervals and there are only four arrow keys.

Everything below follows from those two numbers. Nothing here is a taste
judgement about aperiodic geometry, which is what the proposal feared it would
have to be.

## D1. The cursor is a dot, and an arrow chooses one of its incident edges

Three candidate homes for the cursor were weighed:

- **On a face**, arrows walking faces and a select cycling that face's edges.
  Cheap on squares and poor everywhere else — a Great-Dodecagonal face has
  twelve sides, so "cycle its edges" is up to twelve presses, and a face-walk
  has the same direction problem one level up.
- **On an edge**, arrows stepping to a geometrically neighbouring edge. The
  rule "the edge to the right of this edge" is ill-defined exactly where the
  game is most interesting, and nearest-in-direction stepping admits local
  minima, so reachability becomes something to prove per tiling rather than by
  construction.
- **On a dot** — chosen. A dot always has *some* ring of incident edges, on
  every tiling including the aperiodic ones, and the grid already hands us that
  ring: `GridDot` carries `x`, `y` and `edges` **in clockwise order**, and
  `GridEdge` carries `dot1`/`dot2`. There is no geometry to invent.

An edge is then reached as (dot, direction), which is also how a player thinks
about drawing a loop: you are at a corner and you go *that way*.

## D2. The arrow rule: angular nearest, and a repeat press takes the next

**Rule.** For the pressed arrow's direction, sort the current dot's incident
edges by angular distance from it; the first press highlights the nearest, and
pressing the same arrow again advances to the next in that order.

**Why the repeat, which is the part that looks like a complication and is the
whole point.** The obvious rule — plain angular-nearest, no repeat — has a
reachability hole, and it is invisible on the tiling everyone tests. On a
triangular dot the six edges sit at 0°, 60°, 120°, 180°, 240°, 300°, and the
four arrows at 0°, 90°, 180°, 270°. The edges at 60° and 120° are *equidistant*
from "up"; so are 240° and 300° from "down". A deterministic tie-break
therefore never selects one of each pair — and because the excluded edge is at
the mirrored angle from its **other** endpoint too, a consistent tie-break can
leave an edge unreachable **from both ends**. That is a parity hole living
inside a rule that reads perfectly well, in the one game this change exists to
give parity to.

With the repeat, every incident edge has *some* rank in the sorted list for
*every* arrow, so **every edge is reachable from either endpoint by pressing one
arrow at most six times** — and once in the overwhelmingly common case, since
degree 2 and 3 dominate every tiling. Coverage is guaranteed by construction
rather than argued per tiling, which is the property that matters: the
alternative is eighteen separate arguments, and the eighteenth is a Penrose
patch.

**Cost, stated honestly.** A player on the triangular grid who wants the second
edge in a direction presses twice, and nothing on screen explains that in
advance. It is discoverable (the highlight moves) and it is confined to the two
tilings with degree-6 vertices. The alternative costs an unreachable edge.

## D3. Enter and Space are the left and right mouse buttons

Not new actions. `CURSOR_SELECT` (Enter) toggles the highlighted edge
line↔unknown, exactly as a left click does; `CURSOR_SELECT2` (Space) toggles it
cross↔unknown, exactly as a right click. Both are already in `puzzleKeyMap`, so
no new key wiring is involved.

**They must call the same code the pointer arm calls**, not a parallel path.
Loopy's auto-follow preference extends a click along a forced run of edges, and
a keyboard select that reimplements "set this edge" beside it will diverge the
first time either changes. This is the Slide rule verbatim: `grabBlockAt` and
`releaseGrab` are called by the pointer arm and the cursor arm alike, so the two
routes are the same move *by construction rather than by agreement*.

Note what this buys for free: Loopy sets `wantsStylusModifier` precisely because
a finger has no second button and needs one tap to cycle all three states. The
keyboard has two keys and therefore does **not** have that problem — it can
mirror the mouse directly, and the three-state cycle stays a touch affordance.

## D4. How the cursor travels — deliberately left open

The one sub-question the evidence does not settle, so it is flagged rather than
guessed:

- **Auto-advance**: setting an edge to a line moves the cursor to that edge's
  far dot. Matches the pencil gesture and makes drawing a loop fast.
- **A dedicated travel key**: explicit, but there is no obvious spare key —
  `Tab` is deliberately not in `puzzleKeyMap` ("intercepting would create a
  tab-order trap").

Try auto-advance first. Two constraints on it, both learned elsewhere: it
advances **one dot per press, never running along the forced path** (Slide's
"one cell per press, not slide-to-the-end" — sliding as far as the rule allows
cannot stop where the player needs to stop); and un-drawing must stay easy, so
an arrow back followed by Enter has to toggle the same edge off.

**Settled at implementation (2026-09-02) — both, and here is why both.**
Auto-advance alone leaves a keyboard player with no way to *get somewhere*
without drawing: starting a second run of the loop on the far side of a 15×15
board would mean drawing a path across it and erasing it again. So the travel
key exists too, and the "no spare key" objection dissolves once the key is a
*modified* arrow: **Shift+arrow walks one dot along the arrow's first-ranked
edge without touching the board.** Shift-modified arrows are already a
collection idiom (Pearl marks a line with one), the frontend delivers them
(`MOD_SHFT`), and the coverage test asserts every dot on every preset is
reachable by travel alone. Auto-advance keeps the drawn edge *chosen* (it is
incident to the new dot too) and forgets which arrow chose it, so Enter-Enter
undraws, an arrow back followed by Enter undraws, and the next arrow ranks
afresh from the new dot. A cross (Space) and a clear (Backspace) never move the
cursor. The erase key is bound as the middle button — D3 named only Enter and
Space, but the input audit's parity bar names erase and cancel too, and a clear
that has to be spelled "Enter twice" or "Space twice" depending on the edge's
state is worse than a key. Escape hides the cursor, as everywhere.

**Revised after the owner's playtest (2026-09-02): arrows walk; Shift aims.**
The scheme above played correctly and Shift-for-travel was "really
confusing". The owner proposed the pen model — an arrow *moves* the cursor
along an edge and that edge becomes the chosen one — and asked whether it had
a hole. It has exactly one, measured before answering: a walk can only choose
the edge it walked, so an edge that is never the angularly-nearest choice from
*either* endpoint is unselectable. Swept over all 23 presets:

| Walk rule | Unreachable edges |
|---|---|
| nearest, ties clockwise | 120 / 397 Triangular; 12 / 145 Penrose kite/dart |
| nearest, **ties in opposite senses for opposite arrows** | 0 Triangular; **9 / 145 Penrose kite/dart** |

The opposite-sense tie-break covers the triangular grid by construction (an
edge tied at one end is the mirror tie for the opposite arrow at the other end,
which resolves it the other way); Penrose kite/dart's degree-5 dots at 72°
leave a residue no tie-break fixes. The owner chose **Shift as "look"**: plain
arrow walks (nearest edge within 90°, so Up never walks you down); Shift+arrow
aims without moving, first press nearest, repeat the next round — the D2 rule,
now the fallback. Enter acts on the edge behind you, so auto-advance is gone
(you are already at the far end), undraw is walk-back-and-Enter, and there is
no travel key. `loopy-keyboard.test.ts` asserts the two halves separately —
the walk alone covers 22 presets, walk plus aim covers the 23rd with the
residue pinned at ≤ 9 — so it cannot grow silently.

## D5. The acceptance test is written first, and it is a coverage proof

Because "playable to completion" is exactly the claim this change exists to
make true, and the guard that found Loopy is already collection-wide.

For **each of the 23 presets**: walk the (dot, arrow, select) transition graph
and assert **every edge is reachable and settable to all three states**. That is
a mechanical proof of D2's coverage claim, per tiling, rather than a hope — and
it is what would have caught the plain-angular-nearest hole in D2 had it been
chosen.

Then remove `loopy` from `NO_KEYBOARD` in `src/engine/input-parity.test.ts`,
which independently asserts that a keyboard-only sequence *commits a move*.

**Do not skip the browser pass on the strength of it.** The audit's design D3
holds here too: an in-process sweep proves an edge is reachable and says nothing
about whether a player can see the cursor on a Penrose patch, which is a
rendering question and needs eyes.
