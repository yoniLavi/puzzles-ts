# Design — add-boats-hint

## Context

Boats (Battleships) locates a known fleet from row/column occupancy numbers, a
handful of given segments, and the rule that no two boats touch even diagonally.
Its ported solver (`src/native/games/boats/solver.ts`) runs four tiers of named
techniques to a fixpoint and **never guesses** — the Hard tier's "attempt"
techniques try a single square and keep the result only when the trial is
*immediately* contradictory, which is refutation, not search.

That makes every solver firing narratable, which is the precondition the hint
quality bar asks for (hint-authoring §1A). The work is therefore not "invent a
deduction engine" but "project the existing one twice": recorder off to solve,
recorder on to narrate.

**The C is gone.** `puzzles/unreleased/boats.c` was deleted at stage-2
acceptance, and the 34-fixture differential now runs against a frozen fixture.
There is no oracle left to catch a change in `solveBoats`, so this change must
not touch it — the recording pass is a strictly parallel entry point
(hint-authoring §5.6a).

## Decisions

### D1 — The hint is a second projection of the solver, replayed one firing at a time

`deduceBoatsPlan(board, maxDiff)` clones the board and repeatedly asks
`nextBoatsFiring(board, …)` for the *single next* technique that fires,
applies it, and records it — the shape Spokes, Bricks, Clusters and Subsets all
converged on. A `BoatsFiring` carries:

```ts
interface BoatsFiring {
  technique: BoatsTechnique;        // discriminated; see D3
  squares: { x: number; y: number; to: "ship" | "water" }[];
  evidence: BoatsEvidence;          // the line + its number, the run, the boat
}
```

The **squares** are what the player will place; the **evidence** is what the
narration and the render highlight. `solveBoats` is untouched.

### D2 — Replay ascending through the difficulty caps, never straight at the maximum

The `boats` spec records that the solver is **not monotone in its cap**: the
unfinished-boat dsf check (Normal and above) can report a contradiction the board
does not have and abandon the solve, which strands 13–17 of 20 Easy boards.
`solveAtAnyTier` exists for exactly this and the hint must not re-introduce the
bug by replaying at `DIFFCOUNT`.

So `hint()` finds the lowest cap at which the board actually solves and replays
at *that* cap. This is not merely a workaround — it is also the pedagogically
right answer: a hint on an Easy board should teach the Easy technique that
suffices, not a Hard refutation that happens to reach the same square.

### D3 — One narratable technique per solver function, in goal-first order

The technique union mirrors the solver's own functions. Each gets a narration
whose premise singles out its conclusion (hint-authoring §2.4), stated in the
necessity voice for a deduction (§2.1) and led by the *indication* — the pattern
a player should learn to spot (§2.2):

| Tier | Technique | Narration shape |
| --- | --- | --- |
| Easy | `lineSatisfied` (`checkCounts`, ships met) | "Row 4 already shows all 3 of its ships, so every other square in it is water." |
| Easy | `lineForced` (`checkCounts`, water met) | "Only 3 squares are left in column 2 and it still needs 3 ships, so all of them are ships." |
| Easy | `allWaterPlaced` (`checkFill`) | "Every square of water is accounted for, so the rest of the grid is boats." |
| Easy | `centreForced` (`centersTrivial`) | "The middle segment at c4 has water beside it, so its boat must run up and down." |
| Easy | `isolated` / `mustExtend` (`removeSingles`) | "Every 1-boat is already placed, so this square — hemmed in on all four sides — can hold no boat." |
| Normal | `centreCount` (`centersNormal`) | "Row 6 can take only one more ship, but a horizontal boat through c4 needs two — so it runs vertically." |
| Normal | `growTooLong` (`maxExpandDsf`) | "Filling this square would join two runs into a boat of 5, and the largest boat left is 4." |
| Normal | `mustGrow` (`minExpandDsf`) | "Every 2-boat is placed, so this unfinished boat cannot stop at 2 — it must continue here." |
| Normal | `runTooShort` (`splitRuns`) | "Every 3-boat is placed, so this run of exactly 3 must not be filled." |
| Normal/Tricky | `onlyRunsLeft` (`findMaxFleet`) | "Two 4-boats are still missing and only two runs can still hold one, so both are used — these squares are in every placement." |
| Tricky | `sharedDiagonal` (`sharedDiagonals`) | "One of these two squares must be a ship, and they share these diagonal neighbours — so both neighbours are water." |
| Tricky | `borderNumber` (`borderCluesLast`) | "Every other column number is known and the fleet holds 20 squares, so the hidden number here is 4." |
| Hard | `refuted` (the three `attempt*` techniques) | "If this square were water, row 4 could only be completed by putting three boats in contact — so it is a ship." |

Order is **goal-first** (hint-authoring §2.10): the plan prefers a firing that
*places* part of the fleet over one that only rules squares out, and prefers a
cheaper tier over a more expensive one, so the player is taught the simplest
sufficient technique.

### D4 — The Hard tier reads its reason off the validator, with no separate recorder

Boats' Hard techniques set a trial square, fill the line, and ask
`validateState() === STATUS_INVALID`. The Bricks pattern (hint-authoring §5.6a′)
applies verbatim: re-run the *rejected* trial with the error arrays the
validation family already fills —

- `countShips(errs)` → the line whose number is now exceeded or unreachable;
- `checkCollision(errs)` → the 2×2 where two boats would touch;
- `checkFleet(errs)` → the boat whose size the fleet cannot accommodate;
- `validateGridClues(errs)` → the given segment the trial contradicts

— and classify by a fixed priority (collision → line count → fleet → given clue)
when several fire. **The reason is the rejected trial's flags, not the accepted
move's**: the move is "this square is a ship", and the *why* lives in what
watering it would have broken.

### D5 — Refusal couples to `findMistakes` + the banner, including the wrong-but-legal case

Three refusals (hint-authoring §4):

1. **Board already solved** → "This board is already solved."
2. **A provably-wrong square** → refuse and surface `findMistakes` with the
   standard banner. Boats' `findMistakes` is a *re-solve*, so this catches the
   locally-legal-but-impossible placement too — deducing onward from a doomed
   board would produce confident nonsense.
3. **Deduction exhausted with the board consistent** → "I can't find a next step
   from here." Reachable only on a hand-entered `:desc` id, since every generated
   board is solver-gated.

### D6 — One firing is one journey, even when it forces a dozen squares

`checkCounts` can fill a whole line, and every `placeShip` additionally waters
four diagonal neighbours. Emitting those as separate hints would be a stream of
disjoint one-square nags. Per hint-authoring §5.5 / the cross-game convention, a
firing becomes **one multi-leg journey**: the first leg carries the narration,
the rest are flagged `continuesPrevious` so the midend keeps the hint displayed
across the legs and auto-play walks them as one.

The diagonal waters that follow a ship placement are **not** separate legs — they
are a consequence of the same rule and are shown as part of the same step's
highlight, not narrated separately (§2.9: the *rules* of the game belong in the
help, not in every hint).

### D7 — Extract the plan-accumulation loop: `engine/hint-plan.ts`

This is the shared abstraction the request was reaching for. Four games have
independently written the identical loop:

```
clone the board
while (plan.length < CAP) {
  if (status(board) !== "incomplete") break;
  const firing = nextFiring(board);
  if (!firing) break;
  apply(board, firing);
  plan.push(firing);
}
```

`spokes/solver.ts deduceSpokesPlan`, `bricks/solver.ts deduceBricksPlan`,
`clusters/solver.ts deduceHintPlan` and `subsets/solver.ts deduceHintPlan` differ
only in the four callbacks and in whether they bound with a plan cap
(`HINT_PLAN_MAX = 40`) or a `stepBudget`. Boats would be the fifth copy.

Extract `deduceHintPlan({ clone, status, next, apply, budget })` returning
`{ verdict, plan }`. Per the owner's standing directive, "makes the codebase
noticeably cleaner" is sufficient justification, and the shape is stable — it has
not changed across four independent arrivals, and the things that *do* vary
(budget kind, verdict type) are already parameters.

**Guardrails, because this touches four shipped hints:**

- Each refactor must be **behaviour-preserving**, proved by that game's existing
  hint tests staying green *without edits*. A test that has to change is a signal
  the extraction changed behaviour — stop and re-evaluate, don't update the test.
- **Unify the bound, don't average it.** Spokes/Bricks cap the plan length;
  Clusters/Subsets use `stepBudget`. The helper takes both (a plan cap and an
  optional step budget) rather than picking one and silently retuning two games.
- **No narration moves.** Only the loop is shared; every `nextFiring`, every
  reason type and every string stays in its game. An exemplar hint never loses a
  word to an abstraction.

### D8 — The fleet-list aid is a separate change, not part of this one

Crossing's clickable clue list (playbook §3.9) has a natural Boats analogue:
click a size in the fleet display, and every run that can still hold that boat is
ghosted. It is attractive and it is *not* a hint:

- it derives from the player's own board, never from the solution (that is what
  makes it an aid);
- Crossing's own decision, recorded in `numberFitsRun`'s comment, is that judging
  a candidate by whether it leaves the rest satisfiable "belongs to a hint rather
  than to an input aid";
- it needs the `reference`/`selectReference` seam (or a `Ui` field plus a render
  bit), a different surface from `hint()`.

Folding it in would blur the two and make this change's acceptance test ambiguous.
Proposed as **`add-boats-fleet-aid`**, to be scaffolded after this lands.

## Risks

- **The plan-loop extraction touches four accepted, shipped hints.** The mitigation
  is the "existing tests green without edits" rule in D7; if any game resists,
  leave that game alone and land the helper with the consumers that fit. A partial
  extraction is a fine outcome; a silently retuned Spokes hint is not.
- **`solveBoats` must not move.** The differential is frozen and C-free, so a
  regression there is now undetectable by the oracle. Keep the recording pass
  parallel and re-run the differential after every solver-adjacent edit.
- **Narration volume.** Thirteen techniques is the widest narration surface of any
  hint in the collection so far (Spokes has ~6). Budget review time for reading
  the prose out loud (hint-authoring §6.4) rather than only asserting on it, and
  hold the 120-character ceiling per step.
- **The Hard tier's evidence can be genuinely non-local** — a refutation may fail
  three rows away. Where the contradiction is not adjacent to the move, say so
  honestly (§5.6) rather than ringing a misleading "cause".

## Open questions for the owner

1. **Auto-place the diagonal waters?** When a hint places a ship, the four
   diagonal neighbours are water by rule. The port already applies them in
   `executeMove`, so the hint's move does the right thing — the question is only
   whether the *highlight* should show them (teaching the rule) or stay on the
   ship alone (less noise). Recommendation: show them shaded, not narrated.
2. **Should the fleet aid (D8) be scaffolded now or after acceptance?** It is
   independent; scaffolding it early costs nothing but adds an open change.
