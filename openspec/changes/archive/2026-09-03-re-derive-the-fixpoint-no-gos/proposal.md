# re-derive-the-fixpoint-no-gos

## Why

**`declare-deduction-techniques` wrote a rule and then broke it in the same
commit.** It established that a no-go record *"SHALL be re-derived rather than
carried forward when the contract changes — a reason that a game did not fit an
earlier runner is not evidence about the current one"*, and then filled its own
five-row table by reading the *previous* reasons and inventing the hook each
would need. Reading the five solvers instead — five function bodies, which
AGENTS.md says to read rather than heuristic over — contradicts three of the
five rows:

| Game | What the table claimed it needs | What reading it shows |
| --- | --- | --- |
| Singles | "an `impossible?` predicate and a per-iteration pre-pass" | neither. Its op-queue drain **is** a technique in position 0 that always returns `0` — the ladder restarts from the top on every firing, so such a technique runs exactly once per iteration, at the top. Its `state.impossible` flag is checked after *each* technique, so each technique returns `-1` when the flag went up, which is the existing contract. |
| Clusters | "a `settled?` returning the caller's own verdict type" | a local variable. Its three-valued `clustersValidate` is captured in a closure by the early-out and returned by the function. |
| Spokes | "a cost accumulator" | its tiers are `maxTier` after all (`DIFF_LIMITED < EASY < TRICKY < HARD`). The accumulator is not its grade — `spokesSolve` returns a *status*, and `total` is only the internal `DIFF_LIMITED` tier's action bound, which is an early-out. |
| Loopy | "a per-firing 'restart from' return" | correct, and the reason is sharper than the row: each firing narrows *which techniques the next pass may attempt*. |
| Lightup | "none would help" | correct, and the reason is sharper: it has no ladder at all. |

**And the hook count was the wrong question.** `adopt-shared-deduction-fixpoint`
Finding 2 warned that "adding a hook for each would turn the runner into a
configuration language", which is true — but it framed adoption as "what does
this game need *added*", when for three of the five the answer is "nothing, once
a technique can declare its own tier". The tier was the missing concept; the five
hooks were an artifact of not having it.

## What Changes

- **Singles, Clusters and Spokes adopt the runner**, each with **no new runner
  surface**. That is the whole test, and it is the same test Unruly met.
- **One convention is stated rather than re-invented per game**: a technique that
  is *conditionally available* guards itself inside `run` and returns `0`. Unruly
  set the precedent (`view.unique` is a rule of the board, not a rung ordering
  question); Spokes needs it for a rung that runs at *exactly* Tricky rather than
  at Tricky-and-above. **The runner deliberately grows no `when` predicate** — it
  would be indistinguishable from returning `0` and would exist only to
  document, which is how a runner becomes a configuration language.
- **`solved` is renamed `settled`, and its contract is made honest.** The hook's
  own doc already admitted it means two things ("fully solved (or a contradiction
  has surfaced)"), and Undead has always used it for a *contradiction*. With
  Clusters and Spokes joining, it also carries "refuted" and "this game's own
  action budget is spent". `settled` says what all five callers actually mean:
  the ladder should stop because there is nothing left for it to do.
- **Loopy and Lightup are recorded as bespoke-loop hatch cases** — the shape
  `docs/framework-rdd/deduction.md` § "Escape hatches carry obligations" designs
  for, and which it says is part of the framework rather than a failure of it —
  with their reasons re-derived and their obligations stated.

Explicitly not in this change: any technique, any ordering, any tier's meaning,
and any new option on the runner. If an adoption needed one, that game stayed a
hatch.

## Impact

- Affected specs: `ts-engine` (the shared deduction-fixpoint scaffold).
- Affected code: `src/engine/deduction-fixpoint.ts` (the rename), its five
  existing call sites plus Unruly (the rename), and
  `games/{singles,clusters,spokes}/solver.ts` (adopting).
- **Behavior must not change.** All three adopting games are solver-gated
  generators carrying frozen byte-match C fixtures
  (`{singles,clusters,spokes}-c-reference.json`, each with a
  `*-differential.test.ts` in the ordinary gate). A moved fixture means the
  adoption is wrong and is never resolved by re-recording.
- The runner ends this change with **nine call sites** (`latin.ts` + eight games)
  and **two** recorded hatch cases, from five call sites and six no-gos before
  `declare-deduction-techniques`.
