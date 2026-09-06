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
- [x] B2 The desc codec — **done**
      (`share-the-run-length-desc-scanner`). Eight games converged on
      `engine/run-length.ts`, not the ten the survey counted: **bricks and
      crossing never had this grammar**, and the scan that said they did keyed
      on the half the two families share. Seven of the eight carry a frozen
      differential and all seven are byte-clean. It also closed the invariant
      the batch was really about (`run-length-desc.test.ts`) and fixed a live
      validate/parse disagreement in Bricks — a game that is *not* an adopter.
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
- [x] B7 **Done** (`give-flip-and-pegs-a-state-module`). 55–2 once measured, not
      the weak case it was filed as. Both games also gained a `generator.ts`,
      and Pegs' grid vocabulary moved out of `render.ts` — undoing the
      import-cycle workaround B5 had to invent for want of a state module.
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

## Done — the instruments re-run, 2026-09-06

The definition of done in `survey.md` is a measurement, so it was re-measured
rather than declared. Every criterion, with what it actually returned:

| Criterion | Then | Now |
| --- | --- | --- |
| 57 games whose renderer lives in `render.ts` | 53 | **57 / 57** |
| One spelling of the pixel↔cell conversion | 36 local / 10 importing | 21 local / 28 importing |
| No aliased capability wiring | 4 | **0** |
| No indefensible clone cluster above ~20 lines | — | **26 clusters, all defended** |
| `jscpd --min-lines 12 --min-tokens 90` | 994 lines / 284 files | **941 / 292** |

The 21 remaining local coordinate maps are the six `Math.trunc` overrides plus
the games whose geometry is genuinely their own (hex, triangular, isometric);
B3 converted every game that could take the shared one, which is why the
importing count rose by 18 while the local count fell by 15 rather than by 18.

**The clone clusters above 20 lines were read, not counted.** Every one is an
import block (jscpd's known over-report, and the top *two* are exactly that), a
`paramConfig` / `paramsCodec` declaration — an input a mechanism consumes, which
`AGENTS.md` calls healthy — or a per-game keypad or move arm already standing on
shared helpers, which is what B1 dissolved into comments. None is a defect
hiding behind a number.

**Ran the app.** All eight games this sweep's last batch touched load and render
correctly in Chrome with zero console errors: singles, magnets, bridges, pearl,
map, loopy, filling, bricks. Map is the one worth naming — its colored regions
*are* the decoded clue list, so a correct board is the end-to-end evidence.

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
- **The `showMistakes` coverage key overstated its gap.** Crossing was listed as
  uncovered while carrying the one test in the collection that caught a break in
  the shared error frame — because it covers its *run-error* frame by a
  different route than the Check-&-Save overlay.
- **A scan can key on the half two grammars share.** B2's roster said ten games
  had the run-length desc; eight do. Bricks and Crossing were caught by the
  letter-run arithmetic, which they genuinely have — but Bricks' other token is
  a multi-digit clue with `_` separators over a padded grid, and Crossing has no
  value character at all: its decimals are a *second kind of run*. This is the
  same instrument failure as the four before it, in its sharpest form — the key
  matched a real shared feature that was not the distinguishing one.
- **"This one varies" is a claim, and it rots like a count in prose.** B7 was
  filed as weak on an unmeasured assertion that the state/generator split is
  loose. Two minutes of `ls`: `state.ts` is 55 of 57, as settled as the renderer
  was, and only `generator.ts`/`solver.ts` genuinely vary.

And two about the work rather than the instruments.

**Seven of eight batches re-baselined nothing at all.** The convergences that
mattered were wide and shallow — one spelling, one name, one primitive, one
grammar — which is exactly the shape a duplication metric cannot see. `jscpd`
fell 994 → 941 lines across the whole sweep, about 5%, while the collection
gained 57 `render.ts` files, 57 `state.ts` files, five shared engine modules and
four cross-game guards. **A sweep that halves a duplication number is measuring
copy-paste; this one was measuring how many times a game had to answer a
question that had only one answer**, and those two quantities barely overlap.

**Three batches found a defect the convergence was not looking for**, which is
the strongest argument for doing this at all. B5's renderer move exposed an
import cycle and a stale ledger. B2 found Bricks' `validateDesc` and `newState`
disagreeing about `A`–`Z`. And the codec extraction it filed as a follow-up
found Singles capped one past the alphabet it writes and Magnets not capped at
all — both able to generate a description the game then refuses to load, both
inherited from upstream and invisible until someone had to state the shared
contract. **Extracting a duplicate makes you say what the contract is, and
saying it is where the defect surfaces.**
