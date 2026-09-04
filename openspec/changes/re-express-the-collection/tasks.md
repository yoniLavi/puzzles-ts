# re-express-the-collection — tasks

Scaffolded 2026-09-04. **Blocked, and deliberately last.** Do not start before
the exemplars have hardened the contract — a premature sweep multiplies every
contract change by 57.

## 0. Split this change before implementing it

- [ ] 0.1 One change per family batch (Latin, edge, planner, bespoke-hatch),
      each archivable on its own. A single 57-game change cannot be reviewed or
      reverted, and keeping it whole would break "one change per coherent unit
      of work". **This directory holds the plan; it should not hold the work.**
- [ ] 0.2 Sequence the batches by what each teaches, hardest-first where the
      contract is still soft, mechanical-last.

## Per batch

- [ ] B1 Capability-manifest diff per game: same capability set before and
      after — hints, mistakes, prefs, keypad, reference aid, difficulty tiers.
- [ ] B2 Frozen differentials byte-clean; narration strings byte-identical;
      render snapshots unchanged or every changed line explainable.
- [ ] B3 **Two-lane acceptance**: entirely-unchanged guard set ⇒ batched spot
      acceptance; any re-baselined snapshot ⇒ full owner acceptance. Do not
      silently take the cheap lane for a game whose snapshots moved.
- [ ] B4 A game that keeps a bespoke input/render hatch still adopts the
      definition and still gains conformance enrollment.

## Standing constraints

- [ ] C1 Game IDs and descs are player promises: zero bytes change.
- [ ] C2 The midend, worker, app shell and save format stay untouched — the
      property that keeps this abortable.
- [ ] C3 If a batch shows the contract is still moving, **stop and fix the
      contract**, then resume. Pushing a sweep through a soft contract is how 57
      games acquire the same defect.

## Findings

_(none yet — not started)_
