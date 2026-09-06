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
- [x] 0.4 **Surveyed; the end state is `survey.md`.** Five instruments, each
      with its vacuity number: jscpd over 284 game files (53 clones, 994
      duplicated lines — down from 1,262 on 2026-09-05 because
      `unify-the-note-taking-cell` landed between the runs, which is the only
      reason the delta means anything), a per-game file listing, an aliased-
      wiring scan, the coordinate-pair partition, and the run-length encoder
      scan. Six batches, B1–B6, with the games named.
- [x] 0.5 **Split into B1–B6**, sequenced in `survey.md` by what each teaches.
      B2 already has its own change (`share-the-run-length-desc-scanner`); the
      rest are scaffolded as they are started. **This directory holds the plan;
      it does not hold the work.**
- [x] 0.6 Sequenced: B1 first (largest cluster, and the receiving module already
      exists, so a contract adjustment shows there); B4 late and expected to
      decline pairs; B6 after B5, because B5 creates the files B6 unifies.

## The batches

Each is its own change, scaffolded when started. `survey.md` holds the
measurement; this is the tracking list, and it is the only place a batch's
status lives.

- [x] B1 **Dissolved.** Scoped at ~380 duplicated lines; worth nine comment
      blocks, which shipped in
      `converge-capability-names-and-the-additive-rule`. `survey.md` carries the
      decomposition and the instrument lesson.
- [ ] B2 The desc codec — `share-the-run-length-desc-scanner` (scaffolded; may
      legitimately decline after its task 0 sizing).
- [ ] B3 The coordinate pair — one spelling of the pixel↔cell conversion.
- [ ] B4 The render layer's residue — expected to decline more pairs than it
      takes; every decline recorded with its reason.
- [x] B5 Structure — **done**. The four aliased capability wirings converged in
      `converge-capability-names-and-the-additive-rule`; the four renderers moved
      to `render.ts` in `move-renderers-into-render-ts`, which also collapsed
      Flip's four copies of the board origin.
- [ ] B7 flip and pegs are still single-file for state, moves and generation —
      found while doing B5, and a weaker case than B5 was. See `survey.md`.
- [ ] B6 The sliding-tile family — after B5.

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
