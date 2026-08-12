# Tasks

## 1. Clusters first — it establishes the pattern most cheaply

- [ ] 1.1 Its chain is already captured (`ClustersReason`'s `chain.steps`) and
      already rendered; only the *delivery* changes, from one step to a
      `continuesPrevious` journey. Median 2–3 legs.
- [ ] 1.2 Decide what each leg marks: the existing what-if overlay bits paint
      every forced cell at once, so a walk wants them revealed leg by leg.
- [ ] 1.3 Remove its `PENDING_WALK` entry from `hint-quality.test.ts`.

## 2. The Latin family — one shared walk, six games

- [ ] 2.1 `latin.ts` `forcing()`: record the BFS path. The parent pointers exist
      inside the loop; the measurement scaffold in `audit-guessing-tier-names`
      showed how to recover depth from them (recover it from git if useful —
      `git log -S LATIN_FORCING_CHAINS`).
- [ ] 2.2 Extend the `forcing` reason to carry the chain, and narrate it in
      `latin-hint.ts` as a journey through `LatinVocab` so Towers' heights,
      Group's elements and Salad's letters all read correctly.
- [ ] 2.3 **The case split is load-bearing** — the conclusion needs *both*
      branches, and a walk that narrates only the chain has a final leg that does
      not follow from its own premises. State it.
- [ ] 2.4 Towers and Solo keep their own `narrate`; give them the same legs.
- [ ] 2.5 Remove each game's `PENDING_WALK` entry as it lands.

## 3. Guards

- [ ] 3.1 The walk must satisfy the *existing* bars, not just this one: every leg
      terse (`MAX_NARRATION_CHARS`), necessity-voiced, and showing something.
      `hint-quality.test.ts` already checks all three per step.
- [ ] 3.2 `hint-resume.test.ts` — a multi-leg journey must survive recompute; a
      chain re-derived from a changed board must not ping-pong.
- [ ] 3.3 A tier-2.5 render scenario per game family, walked to a middle leg.

## 4. Close out

- [ ] 4.1 `ts-engine` spec delta: the Tactic walk bar.
- [ ] 4.2 `PENDING_WALK` is empty; delete the list and its scaffolding comment.
- [ ] 4.3 `openspec validate --strict`; owner acceptance; archive.
