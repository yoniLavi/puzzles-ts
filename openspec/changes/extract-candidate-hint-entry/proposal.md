# Proposal: Extract the shared candidate-elimination `hint()` entry wrapper

**Status**: Proposed (follow-up to `extract-candidate-hint-plan`. Small, low-risk, do
anytime.)

## Why

All four candidate-elimination games' `hint(state, _aux, ui)` are byte-identical except
for the `buildSteps` call and the type names:

```
if (state.completed) return { ok: false, error: "This board is already solved." };
if (findMistakes(state).length > 0)
  return { ok: false, error: "Fix the highlighted mistakes first — …" };
const autoClean = ui?.autoPencil ?? true;
const steps = buildSteps(state, autoClean);
if (steps.length === 0)
  return { ok: false, error: "No further move can be deduced from this position." };
return { ok: true, steps };
```

That's ~12 lines of identical control flow (and three identical user-facing error
strings) duplicated four times — the kind of thing that drifts when one game's wording is
tweaked and the others aren't.

## What Changes

- **A shared `candidateHint(state, ui, findMistakes, buildSteps)`** in
  `engine/candidate-hint.ts` owning the completed-check, the mistake refusal, the
  `autoPencil` default, the empty-plan refusal, and the three shared error strings. Each
  game's `hint` becomes a one-line call passing its own `findMistakes` + `buildSteps`.
- No behaviour change; the refusal/plan strings move verbatim into the shared helper.

## Impact

- **Affected specs:** `ts-engine` (ADDED — the shared candidate-hint entry).
- **Affected code:** `engine/candidate-hint.ts` (+ test for the refusal branches);
  the `hint` of `keen`, `towers`, `unequal`, `solo`. Gated by the per-game hint suites.

## Out of scope

- The `buildSteps` walk (per-game by design) and Undead (its `hint` differs — no
  `autoPencil`, different deduction model).
