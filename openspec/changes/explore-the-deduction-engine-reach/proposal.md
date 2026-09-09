# explore-the-deduction-engine-reach

Realizes: `docs/framework-rdd/deduction.md` — "the center of the framework",
and, after `explore-the-tile-loop-inversion`, **the only part of the vision with
substance left**.

**Readiness: NOT ready. Task 0 is the sweep, and this change may be withdrawn by
it.** That is the shape rows 3, 4 and 5 established and the tile loop confirmed:
a not-yet-ready change holds the ordering and the constraints and defers the
design to a measurement, so a falsifier can fire before a line of framework is
written. Four have.

## Why this one is left

Every other part of the vision has reported. The definition end shipped twice as
helpers and was withdrawn three times; `re-express-the-collection` archived done;
the generator projection was measured and found a near-zero correctness case; the
tile renderer was withdrawn on 2026-09-09 with its headline number inverted.

**What is left is not a claim about lines — it is a question about reach.**

Measured 2026-09-09: **21 of the 46 games with a `solver.ts` sit on a shared
deduction organ** (`runDeductionFixpoint`, `latin.ts`, `candidate-hint.ts`).
**Twenty-five do not**, and twelve of those ship a hint:

| | games |
| --- | --- |
| **on** a shared organ | abcd ascent boats clusters crossing filling group keen loopy magnets mathrax pattern salad singles solo spokes tents towers undead unequal unruly |
| **off**, with a hint | bricks dominosa fifteen flood galaxies inertia lightup palisade range slant sticks subsets |
| **off**, hintless | bridges map mines mosaic net pearl rect rome seismic separate signpost slide tracks |

Some of the twenty-five are non-deductive and always will be — Fifteen, Flood,
Inertia and Slide plan rather than deduce. The rest have never been asked the
question.

**And the question has a sharp criterion already**, written on the runner
itself: *can you name a promise this runner makes that your loop must break?*
`re-derive-the-fixpoint-no-gos` applied it to the six recorded no-gos and **three
of them dissolved** — Singles, Clusters and Spokes adopted with no new option on
the runner at all, because their recorded reasons had described C-shaped loops
rather than naming a promise. Only Loopy and Lightup survive as genuine hatches.

**Nobody has applied that criterion to the other twenty-five.** They were never
no-gos; they were never candidates either.

## Why this is worth measuring rather than assuming

Two priors point in opposite directions, which is exactly when a measurement is
worth its cost.

**For:** the last time this criterion was applied to a population, half of it
dissolved. Solo's solver is a textbook fixpoint written out by hand — a
`mainloop: while (true)` with `continue mainloop` on every firing and
`diff = Math.max(diff, …)` grading — across 1,553 lines. If a handful more
games are that shape, the engine's reach is the vision's one remaining real win,
and it is the win that makes the *next* game cheap.

**Against:** the runner's own header warns that the ladder shape is
near-universal while the bookkeeping around it is per-game, *and that the
bookkeeping is often what decides which puzzles exist*. It says in terms that a
solver whose loop **looks** like this one is not evidence that it **is** this
one. Two separate handoffs have already asserted that Loopy fits when it does
not. And the vision's record is five predictions of a framework organ that
turned out to want a guard.

## What this change is

**A sweep and a go/no-go, not an adoption.** It ends in one of three places:

- **Withdrawn**, with a postmortem, if the population that adopts without
  contortion is small. The deduction end has then reported like the rest, and
  the vision is closed.
- **Rescoped** to whichever games actually fit, as an ordinary adoption change
  per game or family — the shape `re-derive-the-fixpoint-no-gos` already used.
- **Promoted** to a ready change if the sweep finds enough that the *runner*
  should grow, in which case what it grows is named by the games that needed it.

## What needs deciding, and by whom

Nothing, yet. The owner has already answered the ordering question (2026-09-09:
framework work continues before the next greenfield game). If the sweep finds a
change to the runner's contract worth making, that is a design decision this
change will bring back with the measurement attached.

## Impact

- Affected specs: none until the sweep reports.
- Affected code: none in this change.
- The sweep must not write into this change directory after it starts reporting,
  per the `openspec archive` rename hazard; findings go in `tasks.md`.
