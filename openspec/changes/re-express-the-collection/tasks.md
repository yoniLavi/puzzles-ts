# re-express-the-collection — tasks

Scaffolded 2026-09-04. **Waiting on one owner answer, not on a contract.** The
framework definition this was to port games into does not exist — all four
declarations reported and the adapter is withdrawn
(`openspec/postmortems/2026-09-06-game-definition-adapter-withdrawal.md`). Read
the proposal's readiness block first: the argument survives, the route changed,
and whether the new route is what was asked for is the owner's call.

## 0. Get the route settled, then split

- [ ] 0.1 **Ask the owner the question in the readiness block**: continuous
      per-concern convergence (which is already running and has archived five
      passes), or a bounded family-batch sweep with an end state someone can
      declare done? Do not start, split or close this change before that is
      answered — it is owner-named work and the two routes produce different
      changes.
- [ ] 0.2 **Build the capability diff first, whichever route wins.** Derived
      from `testing/enrollment.ts`'s `builtGames()` — the optional `Game`
      members a game has plus the `Ui` fields its `newUi` returns, snapshotted
      and diffed. Silent capability loss is this change's characteristic risk at
      any batch size, and by the time a sweep is running it is too late to add.
- [ ] 0.3 **Prove it fails**: drop a capability from one game deliberately and
      watch the diff catch it.
- [ ] 0.4 Then split — one change per batch, each archivable on its own. A
      single 57-game change cannot be reviewed or reverted, and keeping it whole
      would break "one change per coherent unit of work". **This directory holds
      the plan; it should not hold the work.**
- [ ] 0.5 Sequence the batches by what each teaches, hardest-first where the
      shared shape is still soft, mechanical-last.

## Per batch

- [ ] B1 Capability diff per game: same capability set before and after —
      hints, mistakes, prefs, keypad, reference aid, difficulty tiers. **Derived,
      never declared** — the set is read off the game object and its `Ui`, so a
      change that drops a member cannot also drop its own entry.
- [ ] B2 Frozen differentials byte-clean; narration strings byte-identical;
      render snapshots unchanged or every changed line explainable.
- [ ] B3 **Two-lane acceptance**: entirely-unchanged guard set ⇒ batched spot
      acceptance; any re-baselined snapshot ⇒ full owner acceptance. Do not
      silently take the cheap lane for a game whose snapshots moved.
- [ ] B4 A game that keeps a bespoke input/render hatch still converges on
      everything else — the shared vocabulary, the tier names, the cursor
      contract — and still gains every cross-game guard its behavior enrolls it
      in.

## Standing constraints

- [ ] C1 Game IDs and descs are player promises: zero bytes change.
- [ ] C2 The midend, worker, app shell and save format stay untouched. This was
      billed as the adapter's gift; it is not, and it costs nothing — four rows
      have landed or been withdrawn and none of them proposed to touch these.
      Check it anyway, per batch: a property nobody threatens is still one worth
      asserting, and asserting it is how it stays true.
- [ ] C3 If a batch shows the contract is still moving, **stop and fix the
      contract**, then resume. Pushing a sweep through a soft contract is how 57
      games acquire the same defect.

## Findings

_(none yet — not started)_
