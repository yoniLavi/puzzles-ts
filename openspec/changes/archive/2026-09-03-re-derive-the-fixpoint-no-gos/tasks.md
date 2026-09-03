# re-derive-the-fixpoint-no-gos — tasks

## 1. The interface

- [x] 1.1 `solved` → `settled`, with the honest contract (design D4). Three real
      call sites, found by reading rather than by a blanket replace — see
      Findings 2.
- [x] 1.2 The conditional-technique convention stated in the module header: a
      technique that is conditionally available guards itself in `run` and
      returns `0`; the runner grows no `when` predicate, deliberately.

## 2. Adopt the three that need no new surface

- [x] 2.1 **Singles** — drain as technique 0, flag as the `-1` arm, `maxTier`
      (design D1), with the progress-before-flag ordering reproduced exactly.
- [x] 2.2 Singles: 81 tests green, **24 byte-match fixtures unchanged**.
- [x] 2.3 **Clusters** — two techniques, verdict captured by `settled` (D2).
- [x] 2.4 Clusters: 53 tests green, differential unchanged.
- [x] 2.5 **Spokes** — `maxTier: Math.max(diff, DIFF_EASY)`, the Tricky
      look-ahead self-gated on `diff === DIFF_TRICKY`, `total` accumulated in
      the two techniques that accumulate it upstream, both early-outs in
      `settled` (D3).
- [x] 2.6 Spokes: 83 tests green, 25 differential fixtures unchanged — **Easy,
      Tricky and Hard all byte-match**, which is what exercises the cap clamp,
      the exact-Tricky self-gate and the `DIFF_LIMITED` action bound (reached
      through the Tricky look-ahead's recursion).

## 3. Record the two hatch cases

- [x] 3.1 Module header re-derived: each reason now names **the promise this
      runner makes that the game must break** — Loopy breaks *a pass attempts
      every technique at or below the cap*, Lightup breaks *return after first
      firing* — rather than describing its loop's shape.
- [x] 3.2 Obligations recorded per game, including the honest **unmet** one:
      Loopy ships no `hint()`, so its narratability obligation is vacuous.

## 4. Docs and spec

- [x] 4.1 `docs/games/solver-and-generator.md` — exemplar list became a
      what-to-read-this-for table (nine call sites), the no-go table became the
      two-row promise-breaking record, plus the conditional-technique convention
      and a "what a bespoke loop still owes" table.
- [x] 4.2 `docs/games/engine-catalog.md` — `settled`, nine call sites, two
      hatches, no `when` predicate.
- [x] 4.3 `ts-engine` delta: `settled`'s contract, the no-`when` decision, the
      re-derivation test for a recorded reason, and the bespoke-loop obligations
      with "vacuous is recorded as unmet".
- [x] 4.4 `docs/framework-rdd/deduction.md` — its no-go list re-derived, and its
      **"Tell" corrected**: it listed "accumulated-cost tiers" as a hatch case
      and Spokes falsified that. See Findings 3.

## 5. Close out

- [x] 5.1 Probe anchors: one re-anchored (`solved?.()` → `settled?.()`);
      `--verify` clean at 176 cases / 18 modules.
- [x] 5.2 Diff shape-checked: every changed `src/` line is the rename, a removed
      hand-rolled loop, a technique declaration, structural braces, or an import.
- [x] 5.3 Full gate green — 280 files, 7835 tests, production build clean.
- [x] 5.4 Filed `census-the-hintless-logic-games` — see Findings 4.
- [x] 5.5 Commit and archive.

## Findings

1. **Three of five no-gos never needed anything added.** Singles, Clusters and
   Spokes adopted with **no new option on the runner** — the test this change
   set itself. Their recorded reasons had been written against a runner that
   graded by array position and were then read as facts about the games:
   Singles' op-queue drain is a technique in position 0 that never fires (the
   restart rule already guarantees it runs once per iteration, at the top);
   Clusters' three-valued early-out is a local variable; Spokes' "accumulated
   action count" is not its grade at all — `spokesSolve` returns a *status*, and
   the accumulator is `DIFF_LIMITED`'s bound. **The generalizable form: a reason
   that describes a loop's syntax is not evidence; only one naming a promise the
   runner makes, that the game must break, is.** Both survivors pass that test
   and both are stated that way now.

2. **The rename had to be read, not swept.** `grep "solved:"` across the engine
   and every solver returns sixteen hits; **three** are the runner's option. The
   rest are unrelated fields on other objects (`{ solved: boolean; board }` in
   Filling and Mosaic, `solved: Uint8Array` in Mosaic's scratch, `solved:
   SubsetsState` in Subsets, four in Undead's own result type). A blanket
   replace would have compiled — `solved: boolean` renamed to `settled: boolean`
   consistently within a file still type-checks — and silently renamed four
   unrelated APIs. AGENTS.md's "verify a bulk edit by shape" is what caught it,
   before the edit rather than after.

3. **A "Tell" in the design fiction was falsified by this work, and corrected.**
   `docs/framework-rdd/deduction.md` listed "accumulated-cost tiers" among the
   signs you need the bespoke hatch. Spokes has exactly that and adopted. The
   Tell now says what actually distinguishes the two cases, and records that a
   cost accumulated across firings, a flag standing in for a `-1` return, a
   per-iteration pre-pass and a verdict richer than a boolean **all read as
   structural and all fit**, because a technique may hold state and guard itself.
   A Tell that misfires is worse than no Tell: it is the reason three games sat
   unadopted.

4. **Pulling on one vacuous obligation found a nineteen-game gap.** Loopy's
   narratability obligation had to be recorded unmet because Loopy ships no
   `hint()`. Checking whether that was peculiar to Loopy: **19** game
   directories hold a `solver.ts` and are absent from `testing/hint-games.ts`.
   That number is a grep heuristic and is filed as one — it certainly
   over-counts, since several of those solvers are searches or movement planners
   — so `census-the-hintless-logic-games` makes establishing the real list its
   first task rather than its premise, following the
   `adopt-shared-deduction-fixpoint` precedent where "~29 candidates" did not
   survive verification. It also carries the owner decision this sets up:
   whether "nothing ships hintless" is a bar the collection adopts now, later,
   or with named exemptions.

5. **The runner's surface did not grow, and that was the constraint that made
   the design work.** Nine call sites now share one loop with six options
   (`techniques`, `maxTier`, `baseGrade`, `budget`, `beforeTechnique`,
   `settled`) — the same six it had before this change, one of them renamed. The
   discipline that produced that was refusing every per-game hook and asking
   instead what the game could express itself: `impossible?` became the `-1`
   arm, the pre-pass became a technique, `when?` became a guard inside `run`,
   and a typed verdict became a closure.
