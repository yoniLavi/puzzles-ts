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

### D2 resolved: the wipe never had to move at all

**Implemented differently, and more cheaply, than the plan above.** The wipe is
in `sticksSolveGame`; the *fixpoint* it wraps is already reusable, and
`deduceHintPlan` supplies a loop of exactly that shape. So the recorder is a
**parallel** function beside the generator's solver — `nextSticksFiring` /
`deduceSticksPlan` — and `sticksSolveGame` was not touched. This is Bricks'
shape (§5.6a′) rather than Slant's threaded recorder, and it is strictly better
here: the generator's byte-identity is true *by construction* rather than by
proof, and the only surface the two paths share is `sticksValidate`'s new
optional `violations` out-param, whose every allocation is behind that check.

Both consequences the plan named still hold and are still checked:

- The differential fixtures are unmoved — all 13 byte-match.
- Unlike Singles (§7.1), Sticks needs **no cascade priming**: its technique
  rescans every blank square on every call rather than propagating from squares
  it changed. *Confirmed, not assumed* — `sticks-hint.test.ts` "resumes from a
  position the player reached by their own moves" plays three plan squares back
  out of order and asks for a fresh hint, and the cross-game
  `hint-resume.test.ts` walks a whole board one freshly-recomputed hint at a
  time.

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

### D3 settled: the blue bar

**Shipped as the blue bar**, confirmed against rendered frames (`toSvg` on the
tier-2.5 records for all three shapes of argument) and by owner acceptance.
The frames settle it beyond the argument above: a `COL_HINT` bar in the same
geometry the game draws a real line reads immediately as *"this square is
vertical"*, and nothing else could have said which orientation. `COL_LINE`
green and `COL_HINT` blue are never confusable — `sticks-hint.test.ts` asserts
the hint bar is non-square (its long axis **is** the message) and that a hinted
fresh board draws no `COL_LINE` bar at all, so the hint can never be caught
pre-placing the move (§5.1).

## D3a: the cursor had already spent the hint's colour (not foreseen)

Upstream's `COL_CURSOR` is plain `BLUE`, and `HINT_ACTION` **is** `BLUE`. A
keyboard cursor and a hint bar can sit on the same square, so that is one hue
for two roles (§5.3), and it had to be resolved before the hint could ship.

The hint did not move. Blue is a *cross-game* learned meaning — the same colour
means "the hint acts here" in twenty-eight games — whereas a cursor is already
per-game, and the palette's own doc comment sanctions the reach: *"A game whose
board has spent green reaches past this for a named colour and says why at the
assignment."* Sticks has spent green on its lines. The collection has answered
this exact question twice already, both times with **purple** (Spokes, and
Subsets, whose comment reads *"Purple, because Subsets has spent the usual two:
the hint's decided slot is blue and the player's own entries are green"*), so
Sticks copies the precedent rather than inventing a third answer.

This is a player-visible divergence from upstream, caused by this change and
justified by it: the alternative was a cursor indistinguishable in hue from the
hint.

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

### D4 resolved, plus the one thing it got backwards

Shipped as designed — each kind's evidence is the list the validator built *at
the point of detection*, so `maxSizeHorizontal`/`Vertical` gained an optional
`span` out-param and the shaded run is the walk's own bounds, never an
approximation. Two refinements the plan did not have:

- **The evidence list keeps the acted-on square for the three length arguments
  and drops it for the two black-clue ones.** Excluding it everywhere is the
  obvious first cut (it is what Bricks does) and it is wrong here: the run a
  length argument *measures* contains the square being decided — "would run the
  2's line to 3 squares" shades all three, with the blue bar on the one to act
  on — whereas the lines a black clue already counts do not include the one
  being ruled out. The first cut left an `unreachable` step whose entire span
  **was** the target, so the frame showed no evidence at all: §5.2's Range
  `connect` case, caught by the per-game "every step shows evidence" assertion
  the guide recommends and not by any cross-game guard.
- **A black clue is ringed, not washed** (§5.4): the fill would hide the very
  blackness the argument is about. White squares are washed, and the clue digit
  and any placed line draw over the wash — so one `evidence` list, and the
  renderer branches on the square's own state.

Each list is also *countable against its sentence*, which is the strongest form
of "the words and the picture agree": `segment.length === size`,
`span.length === max`, `lines.length === value + 1`,
`open.length === value - 1`. All four are asserted.

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

### D5 resolved: the expectation was wrong, and measuring is what showed it

**Grouping was needed.** Reading `sticksTry` says one firing decides one square,
and that reading is what the design above recorded — but it describes the
*solver's control flow*, not the deduction. Scanning 20 generated 7×7 boards
(810 firings) found that **21% decide more than one square** (mean 1.2, max 5),
and that the black-clue rules cluster hardest (mean 1.5 squares each): a black 0
rules out *every* neighbour that could point into it, and telling the player
that four separate times is four hints for one insight.

The squares in a group are forced on the board **as handed in** — the probe
computed them all against one board — so they are simultaneous, not a chain, and
rule 2 applies rather than §3's "a genuine chain stays separate steps".

So `nextSticksFiring` keeps scanning past its first success and returns every
square the same `(rule, clue)` forces, and `hint()` emits them as one journey
with `continuesPrevious` on the later legs. Each leg keeps **its own** sentence
and **its own** evidence (Slant's leg convention, §5.6b) rather than one shared
multi-square step (Filling's, §5.5): a leg's numbers really do differ — two
squares can each pen the same clue in to *different* amounts of room — so one
sentence for the group would have had to be vaguer than each leg can be.

The transferable half: **"one firing = one move" is a claim about the deduction,
and a solver that returns early cannot tell you whether it is true.** D5 was
right to demand a seed scan and wrong about what the scan would say.

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
