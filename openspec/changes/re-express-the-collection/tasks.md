# re-express-the-collection — tasks

Scaffolded 2026-09-04. **Route decided by the owner 2026-09-06: the full
sweep.** The framework definition this was to port games into does not exist —
all four declarations reported and the adapter is withdrawn
(`openspec/postmortems/2026-09-06-game-definition-adapter-withdrawal.md`) — so
the sweep converges the 57 games onto the shared shapes that *do* exist, to an
end state somebody can declare done. Read the proposal's readiness block first.

## 0. Settle the route, build the net, name the end state

- [x] 0.1 **Route decided**: the full sweep, not open-ended per-concern
      convergence. Recorded in the proposal's readiness block.
- [x] 0.2 **Capability diff built, before any game moves.** Derived, not
      declared: `enrollment.ts`'s `capabilitySets()` reads the optional `Game`
      members a game carries (`Object.hasOwn` against the interface's own
      optional members, read off its AST) plus the fields its `newUi` returned;
      `src/capability-surface.test.ts` snapshots all 57 and pairs the snapshot
      with assertions a careless `vitest -u` cannot erase.
- [x] 0.3 **Proved it fails**: commenting `findMistakes` out of Towers' game
      object turned the snapshot red with a `- "findMistakes"` line, which is
      exactly the reviewable diff a batch needs. Restored.
- [ ] 0.4 **Survey the collection and publish the end state** — the list of
      differences that nobody can defend as belonging to the puzzle. This is the
      sweep's definition of done, and it must be a *measurement*, not a list of
      what somebody noticed: key on shape, count the population, and name the
      games rather than counting them.
- [ ] 0.5 Split into batches from the survey — one change per batch, each
      archivable on its own. A single 57-game change cannot be reviewed or
      reverted, and keeping it whole would break "one change per coherent unit
      of work". **This directory holds the plan; it should not hold the work.**
- [ ] 0.6 Sequence the batches by what each teaches: where the shared shape is
      still soft, go first and let it harden; mechanical last.

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
