# add-sticks-difficulty-tiers — design (spike result: **withdrawn**)

Task 0 was a gating spike, with an explicit licence to end the change: *"If the
spike finds no rung that is both real and narratable, that is a finding that
legitimately ends the change — better learned in a spike than after building a
tier the generator cannot fill."* It found no usable rung. This file records
what was measured, so nobody re-derives it.

## S1: The headline — the shipped solver has no headroom

Of **300** candidate fills drawn exactly as `newSticksDesc` draws them (7×7,
20% black, ROT2):

| outcome | count |
|---|---|
| the shipped solver finishes it | 22 |
| **genuinely ambiguous** (more than one solution) | 278 |
| **uniquely solvable but the shipped solver fails** | **0** |

That last row is the whole finding. On this game, at these sizes, every board
the shipped deduction declines is one that *no* sound solver could finish,
because it has more than one solution. A harder tier needs boards in that empty
row, so there is nothing for a second rung to be *for*.

`sticksValidate` is stronger than its one-line summary suggests — it is not just
"is this board legal" but a reachability argument (can this segment still reach
its clue, given what walls it in), and `sticksTry` applies it to both
orientations of every blank cell. Empirically that is already a complete decision
procedure for the boards this generator makes.

**This measurement is the third the spike took and the first that meant
anything.** The first two both fell into the same trap, in different disguises:
they counted "the solver did not finish this board" as evidence about the
solver's *strength*, when it is overwhelmingly evidence that the board is
**ambiguous**. Refusing an ambiguous board is a solver behaving correctly. The
fix was an independent uniqueness oracle — propagate, then branch — and it
inverted the reading of both earlier runs. *A solver's own verdict cannot serve
as the uniqueness oracle in a measurement about that solver.*

## S2: Candidate rung A — the one-level hypothetical (Clusters' shape)

Assume an orientation, run the direct rung to a fixpoint from there, and if
*that* reaches a contradiction the opposite orientation is forced. This is
exactly Clusters' Tricky rung, it is a proof by contradiction rather than a
guess (so it satisfies the guess-free-generation policy), and it subsumes the
direct rung, so cap-monotonicity would have been free.

It is a **real** rung — it does produce boards the direct rung cannot do — but
only via clue minimisation, and both the yield and the cost rule it out:

- Re-minimising a generated board under the deep rung strips further on roughly
  **1 in 5** boards in one sample and **1 in 12** in another; retrying with up
  to **8** fresh minimisation orders reached a Tricky board on **1 of 12**
  boards at 7×7 and **1 of 12** at 10×10.
- One deep minimisation pass costs ~1.5 s at 10×10. Twelve boards × eight
  shuffles took **141 s**. A Tricky board would therefore cost roughly **8–15 s**
  at 10×10, before counting regeneration.

Slide's measured 1.5 s median already earned a caveat on its help page. This is
an order of magnitude worse, for a tier the generator fills about one time in
ten. Task 0.3's own bar — *"a tier the generator can rarely fill is worse than no
tier"* — is decisive.

## S3: Candidate rung B — correcting the `x > 1` / `y > 1` reachability bugs

The other candidate the proposal named, with the opposite cost profile: no
nested search at all, one character each. `maxSizeHorizontal` /
`maxSizeVertical` bound their look-behind at `x > 1` where the geometry wants
`x > 0`, so the shipped checker is weaker than intended. A stronger checker
solves more boards, so it should strip more clues.

**It strips none.** Re-minimising under the corrected checker: **0 of 15**
boards stripped a single extra clue, and **0 of 15** escaped the shipped solver,
at *both* 7×7 and 10×10.

So task 2.2's open question is answered, and it is worth recording on its own
account: **the two ported quirks are inert.** They are real bugs, they are never
reached on a real board, and keeping them costs nothing while preserving the
byte-match. Keep them, with this measurement as the reason rather than "upstream
did it".

## S4: What this change ships instead

One test, in `sticks.test.ts`: **every generated board has exactly one solution,
and the shipped deduction finds it**, at both presets, with the spike's
uniqueness oracle as an independent witness.

That is the honest residue. For a one-tier game, "graded honestly" *means* that
property, and it was previously unasserted — `sticksSolveGame` returning
`complete` covers the deduction half but says nothing about uniqueness, because
a solver only reports on the line of play it followed. The oracle is proved
non-vacuous in the same test (an unclued board must count 2), for the reason S1
gives: it is the instrument the whole finding rests on.

## S5: What would reopen this

Not a better search — S1 says the search has nothing to find. It would take a
change to the **generator**, so that boards outside the shipped solver's reach
can exist at all: a different clue-selection strategy, or a fill that is not
uniform-random. That is a different and much larger change than "add a
difficulty parameter", and nobody has asked for it. Sticks' `blackpc` and
`symm` parameters remain what varies a board here.
