# fix-sixteen-hint-recompute-stability

**Status: implemented.** The diagnosis below is what the change was written on;
the two paragraphs marked **Corrected** record where it was wrong, because both
errors cost investigation time and one of them sent the diagnosis looking for
something exotic.

## Why

**Sixteen's hint never solves a 5×5 board.** Found by the slow tier of
`hint-resume.test.ts` the day it was widened to every preset
(`refuse-honestly-at-every-tier`, 2026-09-08):

```
sixteen: following hints one move at a time always reaches solved
  Error: sixteen-5×5-hr-a: did not converge within 800 moves (loop?)
```

Deterministic, fixed seed, reproduced in two independent runs. Seed-specific: a
different seed walks 5×5 in about 7 s.

**It is a ping-pong, and the numbers say so exactly.** Tracing tiles-out-of-place
per move on the failing board:

```
first 30: 24 24 24 24 23 23 21 19 18 19 19 20 19 19 20 19 16 17 19 18 17 18 18 17 17 16 17 16 15 13
last  60: 7 4 6 6 7 4 6 6 7 4 6 6 7 4 6 6 7 4 6 6 7 4 6 6 …
```

The opening half works — 24 down to 13, then on to 4. Then it locks into a
**period-4 oscillation, 7 → 4 → 6 → 6 → 7 → …, forever.** It reaches four tiles
from solved and walks away from it, repeatedly.

**Corrected — it *is* a state cycle.** The original diagnosis recorded "a
state-repeat probe over 900 moves found **no** repeated board", and concluded
that only the potential cycled while the board did not. That is false. The boards
repeat with period 4 and have done since move 155 (`board repeat: move 163 ==
159`, and so on to the 800-move cap). Whatever the original probe compared, it
was not board identity. The claim mattered: it is what made the defect look like
something stranger than the ordinary cycle it is.

**Corrected — the exact search does arm, but the stated reasoning did not show
it.** The original argued "the trace reaches 4, so the `outOfPlace <= 8`
threshold is not what blocks it". That does not follow: the fallback needed the
*forward search to be at a strict local minimum* as well, so reaching 4 shows
only that one of two conditions holds. It does arm, and the timings prove it —
the two moves of the cycle at `oop=4` cost 2.5–5 s and return an 8-move plan,
against 0.2–0.7 s for the other two.

## What it actually is

**The recompute-stability defect the collection has already paid for once.**
`docs/games/hints.md` § "Recompute-stable plans" records it from Inertia: *a plan
is recomputed whenever the player goes their own way … The fix is a monotone
potential, never "cache the plan", which only hides it.*

Sixteen is that, and its monotone potential is the **true distance to the goal**,
which it already had a way to measure: the exact bidirectional search returns a
shortest plan, so following the first move leaves a board exactly one move
nearer. What was wrong is that this search was **gated** — armed only at a strict
local minimum, and only on a board with at most eight tiles out of place. The
code comment at the site even named the mechanism it was relying on to stay safe,
*"paid once for the whole endgame thanks to plan-carrying"*, which is exactly the
assumption `hint-resume.test.ts` exists to refuse: plan-carrying is the path a
player who follows every hint takes and not the path anyone else does.

**No gate on a cheap board measure can work, and this is the finding of the
change.** It is tempting to read the failure as a badly-chosen threshold. It is
not, and the reason is structural: **a shortest plan does not look like progress
on the way home.** On seed `hr-b` at 5×5, a plan that starts 9 tiles out of place
with 9 total travel peaks at **17** and **30** before it arrives. So a gate keyed
on either measure switches off partway down the descent the search itself opened,
the heuristic takes back over, and it walks the board straight back. Three gates
were tried on the failing walk and all three cycled:

| gate | 5×5 seed `hr-a` | 5×5 seed `hr-b` |
| --- | --- | --- |
| `outOfPlace <= 8` (shipped) | cycles | cycles |
| `outOfPlace <= 12` | solves, 49 moves | cycles |
| total travel `<= 20` | solves, 49 moves | cycles |
| **none** | **solves, 49 moves** | **solves, 36 moves** |

Ungated, `hr-b` walks home with plan lengths 8, 7, 6, 5, 4, 3, 2, 1 — the
monotone descent, visible.

## What Changed

- **The exact search runs on every board.** `exactSearch` loses its `when` field
  entirely: with both consumers wanting the same thing, when to spend the search
  is not a decision a game legitimately makes differently, so it stops being one
  (`AGENTS.md` § "Convention over configuration"). `SlidePlan.usedExactSearch`
  goes too — it existed only so a game's tests could assert the gate still gated.
- **The search was rewritten to afford it.** Ungated at the old speed a hint cost
  4–6 s. Packing boards into 31-bit words in a flat pool behind an
  open-addressed index — no per-node object, no string key — made the same search
  **4.5–7× faster** and brought always-on into range: Sixteen 5×5 now hints in
  ~0.7 s mean, 1.5 s worst. Verified differentially against the old
  implementation over 426 boards, 0 mismatches.
- **Netslide was measured rather than assumed**, as the tasks required. It never
  showed the cycle, but it showed the signature — plan lengths falling 19, 18,
  17, 16, 15, 14 and rising to 16 as the heuristic took back over. Converted, its
  walks are *shorter* (4×4 medium 20 → 12 moves, 5×5 easy 28 → 22) for a worst
  hint of 1.27 s against 0.88 s.
- **`walkedPresets`' untiered blind spot is closed.** It keyed on tier, which
  collapses every preset of an untiered game to one — reinstating the
  first-preset blindness the widening existed to remove, for twelve games, on the
  day it removed it. An untiered game is now sliced first-and-last by size.
  Landed *with* the fix, and proved to catch it: restoring the gate alone turns
  the gate slice red with the very error at the top of this document.
- **A hint may now tell the player to undo the slide they just made**, where that
  is the move that finishes the board. The veto against it cannot be applied to a
  shortest plan without destroying the property that makes the plan converge, and
  from one slide off a finished board the undo is the only correct advice.

## What it did not fix

**Sixteen 5×5 strands the player at four tiles from finished in about 19% of
games.** Pre-existing, unrelated to the cycle, and reachable only now that the
cycle is gone. Such a board is exactly 9 moves from home and the search reaches
8; crossing 9 costs 18–24 M states, ~10 s and most of a gigabyte, so no budget
fixes it. Filed with its measurements as `fix-sixteen-endgame-stranding`.

## Impact

- Affected specs: `ts-engine` (the planner requirement is replaced, and the hint
  walk's slice rule modified), `sixteen`. `netslide` needs no delta — its
  requirement asks for an exact shortest search and is satisfied more completely
  than before.
- Affected code: `src/engine/slide-planner.ts`, `src/games/sixteen/index.ts`,
  `src/games/netslide/hint.ts`, `src/engine/hint-resume.test.ts`.
- Owner acceptance: **yes.** This is a hint a player follows, on a board size
  that ships, and the fix changes which moves it suggests — in Netslide's case on
  every preset.
