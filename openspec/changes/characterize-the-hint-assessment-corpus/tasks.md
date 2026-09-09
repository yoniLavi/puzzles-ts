# characterize-the-hint-assessment-corpus — tasks

Scaffolded by `re-derive-the-fixpoint-no-gos`; rescoped 2026-09-04 after the
owner clarified that the hintless games are a deliberate assessment corpus
rather than a gap. **Done 2026-09-09** — the deliverable is
[`audit.md`](./audit.md).

## 1. Establish the real list

- [x] 1.1 Read each candidate's solver and classify it by shape. Seven classes,
      27 games, in `audit.md` §1.3. The proposal's 19 **survives on membership**
      and is wrong about composition: six of the nineteen are already on
      `runDeductionFixpoint` and one is on the Latin engine.
- [x] 1.2 Record what the grep over-counted, with the reason (§1.2). Four games,
      not the proposal's five — and its guess was wrong in *both* directions:
      `rect` is also not a ladder, while `map` and `signpost` are.
- [x] 1.3 Vacuity guard: 57 games offered by the registry, 57 read; 30 hinted,
      27 not; 19 of the 27 hold a `solver.ts`. 26 hint introductions located in
      git, all 26 verified by their commit subject naming the game.

## 2. Characterize, so the corpus is an instrument

- [x] 2.1 Per game, what it would press on — board model, substrate, planner
      stability, rung granularity (§2.4).
- [x] 2.2 Per game, what exists to build on versus what must be built (§2.4),
      **plus the baseline that makes the comparison possible**: what a hint has
      cost, measured over all 26 introductions (§2.1), and the one clean control
      — Galaxies, class A1, hinted four weeks before it was wired to the runner,
      at +1,138 game lines of which **+387 is the recording projection** (§2.2).
- [x] 2.3 Generator narratability: **yes for all six on the runner**, each
      solver-gated at its target tier, all six also rejecting too-easy boards
      (two mechanisms, §2.5). No board moves; the narratable-deduction policy
      does not have to run first.

## 3. Recommend an assessment order

- [x] 3.1 **Tracks, then Bridges, then Seismic if the first two disagree** —
      each with what it falsifies (§3). Mathrax, Loopy, Slide and the eight
      solverless games are declined *with reasons*, which is the part that keeps
      this a corpus rather than a queue.
- [x] 3.2 Handed to `add-tracks-hint`, written against today's machinery with no
      contract chosen in advance. The evidence is its cost against §2.2's
      control.

## Findings

Full text in [`audit.md`](./audit.md). The four that change something:

1. **Six hintless games are on the runner, not five.** `magnets` was adopted
   before `adopt-the-deduction-runner-where-it-rewires` and is named by neither
   that change nor this one's proposal. It is a corpus member.
2. **The runner carries the loop, not the record** (§2.3). Its `run` returns a
   `number` and its own header says it is "oblivious" to a firing's content; the
   `onFiring` seam reports a **rung id** and exists for
   `ladder-equivalence.ts`'s census. Three documents say "the runner is what
   carries the recorder"; that sentence is an aspiration, and the corpus is where
   it gets tested. **Filling is the only game in the tree that threads a
   recorder through the solve path**; Clusters, Subsets and Undead each wrote a
   *parallel* one, for a stated reason of which only half survives AGENTS.md.
3. **The framework surface a hint needs stopped growing in early August.** Engine
   lines added is 0 in twelve of the twenty-six introductions, every non-zero
   figure is a named extraction, and the last four deductive hints added ≤2 —
   those two being the `hint-games.ts` enrollment line, which
   `derive-hint-enrollment` has since deleted. Today it is zero.
4. **Magnets is on the shared runner with no ladder-equivalence test** (§2.6),
   so its ten rungs across two call sites have no firing census. Tracks proved
   that a whole rung can be deleted with every test still green. Filed as
   `certify-the-magnets-ladder` — not reported as a loose observation.
