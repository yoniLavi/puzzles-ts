# add-sticks-hint — design

Read [`docs/porting/hint-authoring.md`](../../../docs/porting/hint-authoring.md)
first; this file records only what is specific to Sticks. Section references
below are to that guide.

## The deduction, as it actually stands

One technique (`sticksTry`): for each blank cell, tentatively place a
horizontal line; if `sticksValidate` calls the board invalid, the cell must be
vertical, and vice versa. `sticksValidate` merges same-orientation neighbours
into segments with a dsf, then checks each clue.

**The contradiction never propagates.** `sticksTry` calls `sticksValidate`
*once* on the tentative board — it does not run the fixpoint from the
hypothesis. That is the fact this whole change rests on, and it is what puts
Sticks on the compliant side of §1B.1: a firing is "put a line here and one
named clue immediately breaks", which is one glance-able inferential step, not
a chain the player must run in their head.

## D1: Five contradiction kinds — the technique set

`sticksValidate` has exactly five ways to fail, all currently collapsed into
one `"invalid"`. Each is a distinct, teachable Tatebo-Yokobo argument and gets
its own reason kind and sentence. Following §2.4's Crossing lesson, the kind is
recorded **where the failure is detected**, not re-derived at narration time.

| kind | `sticksValidate` clause | what the player is being taught |
|---|---|---|
| `tooLong` | `size > target` | a line may not exceed its number |
| `unreachable` | `size < target && maxSize* < target` | a line must still have *room* to reach its number |
| `twoClues` | `lengths[c] === -2` | one line may cover at most one number |
| `overConnected` | `conn > numbers[i]` | a black clue counts the lines touching it |
| `starved` | `other > 4 - numbers[i]` | a black clue's sides that can *never* connect are already spent |

`unreachable` and `starved` are the two worth care: both are "not yet wrong,
but can no longer come right", which is the genuinely instructive half of this
puzzle and the half a player is least likely to have found on their own.

**Narration shape** (§2.2 indication → reasoning → conclusion, §2.1 necessity
voice for a deductive game). Each opens by naming what was spotted, states the
clue that breaks, and concludes with `must be`. Sketches, to be tuned against
real boards rather than adopted verbatim:

- `tooLong` — *"A horizontal line here would join the run through the 3 into a
  run of 4 — longer than its number. So this square must be vertical."*
- `unreachable` — *"A vertical line here would wall the 4 in with only 3
  squares to grow along, so it could never reach its length. So this square
  must be horizontal."*
- `twoClues` — *"A horizontal line here would join the 2 and the 3 into one
  line, and a line may cover only one number. So this square must be
  vertical."*
- `overConnected` — *"This black 1 already has a line touching it, so a
  vertical line here would give it a second. So this square must be
  horizontal."*
- `starved` — *"This black 2 has only two sides that can still take a line, and
  a horizontal line here would close one of them off. So this square must be
  vertical."*

§2.7 applies to all five: re-read each at its degenerate clue value. A black
clue of 0 and of 4, and a length clue of 1, are where "only", "another" and
"still" go wrong.

## D2: The recorder must not reuse `sticksSolveGame` — it wipes the board

`sticksSolveGame` opens by clearing every non-black cell before iterating. That
is right for a generator gate and **fatal for a hint**, which must plan from
the player's current marks (§7.1, and the Boats case in §3 — "a solver that
wipes the board cannot be replayed as-is").

This is not a hypothesis. `add-sticks-difficulty-tiers`' spike had to write a
no-wipe variant (`sticksSolveGameFrom`, still in `sticks.test.ts` supporting
the uniqueness oracle) before its branch search worked at all, because the wipe
discarded the very orientations it had just assumed.

So: factor the wipe out of `sticksSolveGame`, leaving a fixpoint that runs from
whatever board it is given, and have both the generator (wipe, then run) and
the recorder (run from the player's marks) call it. Two consequences to check:

- The generator's call must stay byte-identical — the wipe moves, it does not
  disappear. The differential fixtures are the check.
- Unlike Singles (§7.1), Sticks should need **no cascade priming**: its
  technique rescans every blank cell every iteration rather than propagating
  from cells it changed, so a mid-game board is handled by the same scan. Worth
  confirming with a resumed-from-marks test rather than assuming — that is
  exactly the assumption Singles shipped a bug on.

## D3: What the highlight draws — open question, decide before implementing

Two established precedents point different ways, and Sticks sits between them.

- **Singles / Range / Unruly** (§5.1): tint the target cell `COL_HINT` and let
  the narration say which mark, because pre-rendering the mark obscured the
  cell's own content and read as already-done.
- **Palisade / Spokes** (§5.1a): draw the forced element in the game's own
  vocabulary, recoloured `COL_HINT` — Palisade recolours the forced edge,
  Spokes draws a blue line for a forced connection and a blue dot for a forced
  mark, because forcing every suggestion into one shape made a rule-out read as
  "connect these".

Sticks' move *is* an orientation, and a tinted square cannot express one, so a
plain cell tint pushes the whole content of the hint into the sentence. The
Palisade reading — a `COL_HINT` stroke in the target cell, the same stroke the
game draws for a real line — argues for itself: a white cell has no content to
obscure, so §5.1's first objection does not apply here, and its second (reads
as already-done) is answered by the colour, which is the same answer Palisade
and Spokes rely on.

**Recommendation: the blue stroke.** But confirm against a rendered frame
before committing, and record the call here either way.

## D4: The evidence area (§5.2)

The narration says "the run through the 3", so a run must be shaded, or the
words and the picture disagree. Per kind:

- `tooLong` / `twoClues` — shade the segment(s) the tentative line would join,
  and mark the clue cell(s) named.
- `unreachable` — shade the span `maxSizeHorizontal`/`maxSizeVertical` actually
  walked. This is the one that will be tempting to approximate; the walk's
  bounds are the premise, so shading anything else makes the sentence false
  (§2.3's geometry lesson).
- `overConnected` / `starved` — mark the black clue and its four sides,
  distinguishing the sides that already carry a line from those that can never
  take one.

**Note the two ported reachability quirks.** `maxSizeHorizontal` /
`maxSizeVertical` bound their look-behind at `x > 1` / `y > 1` where the
geometry admits `x > 0` / `y > 0`. `add-sticks-difficulty-tiers` measured them
**inert** — correcting them changed no verdict on any board at either preset —
so they stay. But an `unreachable` highlight is drawn from that walk, so if a
frame ever shows a shaded span that looks one square short at a board edge,
that is the quirk showing through, not a rendering bug. Decide then whether it
is player-visible enough to reopen the correction; the measurement says it
should never fire.

## D5: Grouping — expected to be trivial, verify anyway

Quality-bar rule 2 groups one deduction firing into one multi-leg journey.
`sticksTry` returns after committing a *single* cell, so one firing is one
move and no `continuesPrevious` legs are expected.

Do not conclude that from the code alone. §8's second gotcha is that grouping
must be validated on a **generated** board, not a crafted one. If a single
clue's contradiction genuinely forces several cells at once, they should be one
journey; the way to find out is to scan seeds.

## D6: No `refreshHintStep`

§7.3 requires it for candidate-elimination games with note-clearing side
effects. Sticks has no pencil notes and no preference that mutates the board,
so a kept step cannot go stale in that way. The intrinsic no-op guard in
`hint-resume.test.ts` still applies and is enough.

## D7: Ordering (§2.10)

All five kinds place a line, and every placed line advances the board, so
Sticks has no "forced but useless" move to suppress and no bookkeeping/goal
split to order around — the Spokes problem does not arise. If a rung order is
wanted at all, prefer the kind that is most *visible* on the board first
(`tooLong`, `overConnected`) over the two "can no longer come right" arguments,
so the plan opens on something the player can check at a glance.
