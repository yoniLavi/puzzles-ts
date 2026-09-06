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
- [x] B3 The coordinate pair — **done**
      (`one-spelling-of-the-pixel-to-cell-map`). Seventeen games converged onto
      `engine/geometry.ts`'s `fromCoord`, equivalence proven numerically; the six
      `Math.trunc` games keep their override, which is now legible *as* one.
- [x] B4 The render layer's residue — **done**
      (`promote-the-thick-rect-outline`). One primitive promoted from eight
      copies; six pairs declined with their reasons, as predicted. Surfaced B8.
- [x] B5 Structure — **done**. The four aliased capability wirings converged in
      `converge-capability-names-and-the-additive-rule`; the four renderers moved
      to `render.ts` in `move-renderers-into-render-ts`, which also collapsed
      Flip's four copies of the board origin.
- [ ] B7 flip and pegs are still single-file for state, moves and generation —
      found while doing B5, and a weaker case than B5 was. See `survey.md`.
- [x] B8 **Ratcheted** (`ratchet-the-mistake-overlay-coverage`). The gap is
      wider than B4 saw — 19 of the 39 games offering `findMistakes` never paint
      the overlay in a test — and it cannot be closed by one guard, because both
      reaching a mistaken board and the mark it draws are per-game. So it is a
      derived ledger that may only shrink, now at **17**: clusters and crossing
      closed. Still a coverage gap rather than a convergence one, so it was
      never part of "done".
- [x] B6 The sliding-tile family — **done**, and it turned out to already have a
      change: `unify-the-raised-tile-bevel`, surveyed 2026-09-05 and
      owner-approved in principle, *was* this batch. The clone the survey found
      between fifteen and sixteen is the raised tile, and the same idiom reached
      four more games. Six converged on `drawRaisedBevel` + `raisedBevelWidth`,
      in two commits (extraction with snapshots unmoved, then the thickness
      change with 440 reviewed coordinate lines).

## Checks every batch runs

*(Lettered `P`, not `B`: these used to be `B1`–`B4` and collided with the batch
names above, which cost a reader one confused lookup — mine.)*

- [x] P1 Capability diff per game: same capability set before and after —
      hints, mistakes, prefs, keypad, reference aid, difficulty tiers. **Derived,
      never declared** — the set is read off the game object and its `Ui`, so a
      change that drops a member cannot also drop its own entry. Run by every
      batch; unmoved throughout.
- [x] P2 Frozen differentials byte-clean; narration strings byte-identical;
      render snapshots unchanged or every changed line explainable. Held: **no
      fixture or differential file changed anywhere in the sweep**, and the only
      snapshots that moved are the four in the bevel's declared visual commit.
- [x] P3 **Two-lane acceptance**: five of the six batches re-baselined nothing
      and took the cheap lane; the one that moved snapshots
      (`unify-the-raised-tile-bevel`) was the one the owner had already approved
      in principle, and it was run in the browser on all six games.
- [x] P4 A game that keeps a bespoke input/render hatch still converges on
      everything else. Held: Twiddle keeps its trapezoids and Pegs its
      outside-the-cell relief, and both took every other convergence.

## Standing constraints

- [x] C1 Game IDs and descs are player promises: zero bytes change. **Checked,
      not assumed** — no file under any `__fixtures__/` and no `*-differential`
      test changed anywhere between the survey and here.
- [x] C2 The midend, worker, app shell and save format stay untouched. Checked
      the same way: nothing under `src/puzzle/`, `src/screens/`,
      `src/components/`, and no `midend`/`worker`/`save` file, appears in the
      sweep's diff. The whole sweep lives in `src/games/` and seven
      `src/engine/` files.
- [x] C3 No batch found the shared shapes moving under it. The one contract
      question that did surface — whether the cursor frame and the error frame
      are the same primitive — was **declined rather than pushed through**
      (B4), which is this constraint working.

## Findings

The sweep's own instruments were wrong three times, and each correction is worth
more than the batch that produced it:

- **jscpd oversells as well as undersells.** B1 was scoped at ~380 duplicated
  lines and worth nine comment blocks: ~100 of those lines were *import blocks*,
  ~72 were a move literal already declined with a reason, and the rest were
  loops whose per-game bodies are the whole content. **A clone cluster is a
  place to look, never a finding.**
- **A scan keyed on where a thing is defined misses the copies that share a
  file.** `unify-the-board-origin` swept eight games for the duplicated board
  origin and reported Flip clean; Flip had four copies, all inside `index.ts`.
- **My own alias count was wrong and the fifth was a comment.** A scan for
  `member: name` cannot tell a wiring line from prose containing a colon.

And one about the work rather than the instruments: **five of six batches
re-baselined nothing at all.** The convergences that mattered were wide and
shallow — one spelling, one name, one primitive — which is exactly the shape a
duplication metric cannot see. `jscpd` fell only 994 → 975 lines across the
whole sweep.
