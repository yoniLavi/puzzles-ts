# refuse-honestly-at-every-tier

Realizes: `docs/framework-rdd/guarantees.md` § "What every game gets asserted,
per capability" — the Technique-ladder row's *"N generated boards **per preset**
walk to completion through the hint projection"*. The guard exists; the "per
preset" does not, and this change is what the missing words were hiding.

**Readiness: ready.** The gap was measured, the finding is player-visible in five
games, and the collapse it argues for is supported by the measurement rather than
by taste.

## Why

**`hint-resume.test.ts` walks one preset per game, and it is the first one.**
The cross-game guarantee — *following hints solves the board, from any position*
— is asserted for 30 games over `firstLeaf(game.presets())`, five seeds. The
first leaf is by convention the smallest and easiest board a game offers. So the
strongest hint guard in the collection has never seen a Hard board, an
`Unreasonable` board, or any of the mode variants a game's menu carries.

**Extending the walk to every preset, 2026-09-08: 209 preset cases across 30
games, 13 refusals — and every single one is at a tier that permits search.**

```
bricks   Unreasonable ×2      keen     Unreasonable ×1
galaxies Unreasonable ×3      lightup  Unreasonable ×3
solo     Unreasonable ×1      towers   Unreasonable ×1
undead   Unreasonable ×2
```

Nothing refused on any Easy, Normal, Tricky or Hard board, at any size, in any
mode. That is the guard working as designed and reporting a clean result — and
it is also the evidence for the finding below, which is what it was not able to
see before.

**Those thirteen refusals say three different things for one situation.** The
same board state — sound, unsolved, deduction exhausted, trial and error is the
tier's own promise — produces:

| Game | What the player reads |
| --- | --- |
| Light Up | "No further move can be deduced from this position — this board needs trial and error from here." (`NO_DEDUCTION_LEFT_TRIAL_AND_ERROR`) |
| Galaxies | "Nothing further follows by deduction here. This board's difficulty allows positions that need trial and error: save a checkpoint, try one, and undo if it breaks." (a bespoke literal in `galaxies/index.ts`) |
| Bricks, Keen, Solo, Towers, Undead | "No further move can be deduced from this position." (`NO_DEDUCTION_LEFT`) |

The third row is the defect. A player on Solo Unreasonable is told the hint has
nothing, with no way to tell whether the puzzle demands a guess or the hint is
broken — and `help/features.md` § Hints teaches refusals as a pair whose members
call for opposite responses. `unify-hint-refusals` (2026-09-01) exists precisely
to stop one situation wearing several faces; it converged the *constants* and
could not see this, because seeing it requires walking a board the guard never
walked.

**And the two constants are not two situations.** `NO_DEDUCTION_LEFT`'s own doc
comment says its case is "what an `Unreasonable` tier promises can happen" —
which is the trial-and-error variant's case, in the variant's own words. Light
Up's call site says it outright: *"Only reachable on an Unreasonable board
(Easy/Tricky boards are deduction-complete by generation)."* The measurement
turns that from a per-game belief into a collection-wide fact: **if a sound
board runs out of deduction, it is a board whose tier permitted search.** The
distinction between the two constants was assumed, never measured, and the
measurement dissolves it.

**A fourth spelling, and it is the one that rots — and there turned out to be
three of it.** `engine/candidate-hint.ts` returns `ALREADY_SOLVED`,
`FIX_MISTAKES_FIRST` **and** the out-of-deduction refusal as **string literals**,
not as the constants — in the shared module that builds the entire `hint()` of
eleven candidate games, which is why Keen, Solo and Towers appear in the table
above without appearing in any grep for the constant.

Its own doc comment is what made that invisible: *"the three user-facing refusal
strings … is shared so a wording tweak lands in one place instead of drifting."*
It was one place. It was not the same one place as the other 21 games', so a
tweak to either half left the other lying.

**And `hint-refusal.test.ts` could not see it either**, which is the sharper
half. That guard exists precisely so a new phrasing cannot arrive unnoticed, and
it is *well* built — it walks the AST for every `{ ok: false, error: <literal> }`
wherever it appears, deliberately taking a superset rather than keying on a
function's name, with the reason written in its header. It scanned
`src/games/**` only. **A refusal lives wherever a `hint()` is built, and eleven
of them are not built under `games/`** — so the guard keyed on the right shape
and still swept the wrong place, which is a variant of `AGENTS.md` § "Method"
this repo has not recorded before.

**Why now, ahead of new games.** 27 games are deliberately hintless as the
corpus for assessing this framework work (`characterize-the-hint-assessment-
corpus`). Every hint written against that corpus will need to answer "what do I
say when I run out?", and today the corpus offers three answers and a hardcoded
literal to copy from. Fixing it before the hints are written is cheaper than
after, and the extended walk is the instrument those hints will be judged by.

## What Changes

- **The hint walk covers every preset**, not the first leaf, with the cost
  tiered (the full sweep is ~116 s; the gate slice samples, the matrix runs
  under `PUZZLES_SLOW_TESTS`).
- **The walk asserts what a refusal is allowed to be**: reaching a refusal is
  legal only where the preset's tier permits search, and the message is the one
  message. A refusal on a deduction-complete tier is a defect and fails here.
- **One constant for "deduction has run out on a sound board."** The two
  existing constants collapse into `DEDUCTION_EXHAUSTED`, and Galaxies' bespoke
  sentence becomes its wording — adopted verbatim because it was the only one of
  the three that tells the player what to *do*, and the only one an owner had
  accepted (owner, 2026-08-11). The name changes with the collapse deliberately:
  21 call sites used `NO_DEDUCTION_LEFT`, and keeping that name while changing
  its value would have moved every one of their words with nobody looking at
  them.
- **`candidate-hint.ts` imports all three constants** instead of retyping their
  values, and **`hint-refusal.test.ts` widens its scan** to the engine's hint
  builders.
- `hint-refusal.ts`'s doc comment and `hint-refusal.test.ts`'s list follow.

## Impact

- Affected specs: `ts-engine`.
- Affected code: `src/engine/hint-refusal.ts`, `src/engine/candidate-hint.ts`,
  `src/engine/hint-resume.test.ts`, `src/engine/hint-refusal.test.ts`, and the
  refusal arm of bricks, galaxies, lightup and undead. Keen, Solo and Towers
  change through `candidate-hint.ts` without a per-game edit — which is the
  point of that module, and the reason its literal mattered.
- **No board moves and no move changes**; this is wording and a guard.
- Owner acceptance: **not required, and this is the refinement rather than the
  rule.** It is player-visible wording, but it is a behavior the collection was
  inconsistent about with one plainly better answer (`AGENTS.md` § "Work
  management": *"still yours to decide when one answer is plainly better — make
  the call, say what you decided and why, and run the app yourself"*). The app
  gets run on a Solo Unreasonable board and the decision gets stated.
