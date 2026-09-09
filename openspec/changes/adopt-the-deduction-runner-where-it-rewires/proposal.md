# adopt-the-deduction-runner-where-it-rewires

**Readiness: ready.** The population is derived by reading all 30 off-engine
solvers, the bar is one this repo has already met three times, and there is no
design decision left in it — a game that needs one is not in the population.

Realizes: `docs/framework-rdd/deduction.md` — "one deduction engine, five
projections". Found by `explore-the-deduction-engine-reach` (2026-09-09).

## The finding

**`runDeductionFixpoint` reaches 16 of the 46 games with a solver. Seven more
already write its shape by hand and need only rewiring.**

Tracks is the clearest case in the collection. Its driver is eight repetitions
of

```ts
if (diff >= TIER && technique(b)) { maxDiff = Math.max(maxDiff, TIER); continue; }
```

which is the runner's signature transcribed. Rome, Seismic, Ascent, Subsets,
Galaxies and Bridges are the same shape with different technique counts, and in
all seven the techniques are **already separate functions** — so adoption is a
wiring change, not a restructuring.

The other 23 are out, each for a stated reason: six sweep every technique before
restarting (adoption would change deduction order on a solver-gated generator),
four have one or two rungs and nothing to share, three are earned hatches, and
seven are not deduction ladders at all. `explore-the-deduction-engine-reach`'s
findings carry the table.

## Why do it, given the line count is 21 a game

**Because lines were never this end's argument**, and obeying a line-count
falsifier here would be copying the *presentation* end's reasoning into a place
it does not apply. `deduction.md`: *"The framework does not make the logic easier
… it makes the wiring impossible to get wrong."*

Two instances of that wiring drift surfaced in four days, neither found by a
framework:

- **Undead** — `solveAtCap` ran arc-consistency unbounded where the generator
  bounded it at three passes, so every Normal board graded Easy-solvable with
  the whole suite green (`assert-that-tiers-bind`).
- **Solo** — `solve` and `findMistakes` are two hand-wired consumers of one
  solver; `solve` corrupted every generated board across sixteen presets and
  declared the puzzle complete (`fix-solo-solve-from-aux`).

**And the real payoff is the hint.** Five of the seven ship none (tracks, rome,
seismic, ascent, bridges), and the runner is what carries the recorder — the
"one engine, two projections" that turns a solver into a narratable hint. Those
five are `characterize-the-hint-assessment-corpus`'s corpus, which the owner set
aside precisely so that writing their hints would be the test of the framework
work.

## The bar, which is not negotiable and is not new

Exactly `re-derive-the-fixpoint-no-gos`'s, which met it three times:

1. **No new option on the runner.** A game that needs one stays where it is and
   its reason is recorded. The runner must not become a configuration language;
   a conditionally-available technique guards itself in `run` and returns `0`.
2. **Every frozen fixture byte-unchanged.** All seven are solver-gated
   generators with C-reference differentials. A moved fixture means the adoption
   is wrong, and is never resolved by re-recording.
3. **The grade must mean the same thing.** The runner grades by *highest tier
   that fired*. A game whose loop means *deepest tier reached* is a different
   number — that is Boats' recorded reason for staying out, and it must be
   checked per game rather than assumed. Where they provably coincide (Seismic:
   the tier bump is immediately followed by the only technique at that tier, and
   not firing ends the solve), say so.

## Order

**Tracks first**, as the exemplar: the most exact transcription of the runner's
shape, hintless, with a frozen differential to prove the adoption changed
nothing. Then the remaining six, one commit each, each proved by its own
differential.

## Impact

- Affected specs: none — the runner's contract does not change. That is rule 1.
- Affected code: `src/games/{tracks,rome,seismic,ascent,subsets,galaxies,bridges}/solver.ts`.
- **Behavior must not change**, and each game's own differential is the proof.
