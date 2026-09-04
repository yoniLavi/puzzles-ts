# derive-hint-enrollment

Realizes: `docs/framework-rdd/guarantees.md` § "The standing principle" —
*"Declaring a capability enrolls its guards… retires the hand-lists
(`testing/hint-games.ts`)"*.

## Why

**A game with a working `hint()` gets zero cross-game hint guards until someone
remembers to add a line to a list.** `src/engine/testing/hint-games.ts` hand-maintains
`HINT_GAMES`, thirty games long, and **six** guards iterate it: `hint-resume`
(plan convergence, purity, no-op-free plans), `hint-overlay`, `hint-quality`,
`hint-mark`, `hint-ordinal` and `scripts/checks/hint-deixis`. Its own header
advertises the coupling as a feature — *"a newly ported game with a `hint()`
enrolls in **all** of them by adding one line here"* — and that sentence is the
defect: the enrollment is a thing a session must remember, so the failure mode is
silent and total. Nothing anywhere asserts that `HINT_GAMES` is complete.

**The repo has already decided this is a defect class, twice.** The framework
vision states it as a principle — *"a list a session must remember to edit is a
defect class, not a convention"* — and, more persuasively, the repo has already
**solved this exact problem once**: `difficulty-contract.test.ts` derives its
enrolled set from the registry (a game is tiered iff its `paramConfig` offers a
difficulty choice), and its header says why in terms that transfer verbatim —
*"A hand-maintained list would eventually go stale, and the naming convention
that would replace it has already failed once… A guard blind to a game cannot
fire on it."*

**The list happens to be complete today, and that is not reassurance.** Checked
on 2026-09-03: the four games whose `index.ts` mentions `hint` but which are
absent from `HINT_GAMES` (`ascent`, `magnets`, `tents`, `guess`) are all false
positives — three name it only as an unused `redraw` parameter and Guess has an
unrelated `ui.hint`. So the list is correct *now*, which is exactly the state in
which its absence of a guard is invisible.

## What Changes

- **Derive the enrolled set from the registry**: a game is enrolled iff it
  declares `hint`, which the registry already knows. `HINT_GAMES` stops being
  authored and becomes computed.
- **Carry the vacuity guard the derivation needs.** Every sweep opens by
  asserting the size of the population it sweeps — the shape this repo has hit
  six times — so the derived set asserts a floor and asserts that the registry
  itself is fully enumerated, exactly as `difficulty-contract.test.ts` does.
- **Prove the derivation fires.** A game with a `hint()` that would previously
  have been forgotten must now be enrolled without any edit to a list; the
  guard for that is a test that the derived set and a game's declaration cannot
  disagree in either direction.
- Keep `declaresNoMarks`, `markRoles` and `firstLeaf`, which are shared judgment
  helpers rather than enrollment.

## Impact

- Affected specs: `ts-engine` (hint-system guards), possibly `repo-layout`.
- Affected code: `src/engine/testing/hint-games.ts` and the six guards that
  import it (no change expected at the call sites — they iterate a list either
  way).
- **No behavior change and no new coverage expected on today's tree**, because
  the hand list is currently complete. The value is entirely in the failure that
  stops being possible; say so rather than claiming a fix.
- Cheap, self-contained, and it removes a per-game step — which is why it is
  early in the "tidy before adding games" order.
