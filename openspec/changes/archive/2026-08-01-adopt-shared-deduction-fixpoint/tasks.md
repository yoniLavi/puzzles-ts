# adopt-shared-deduction-fixpoint — tasks

Depends on `establish-refactor-baseline` and `unify-border-grid-games`.

Full detail in [`audit.md`](./audit.md).

## 1. Establish the real candidate list

- [x] 1.1 Read the runner and its four existing call sites.
- [x] 1.2 **The proposal's "~29 candidates" does not survive verification.** It
      counted movement games whose solver is a *search*, not a ladder (`flood`,
      `fifteen`, `inertia`, `net`, `signpost`, `slide`, `map`), and games whose
      loop is a single technique iterated. Recorded rather than carried forward,
      as this task required.
- [x] 1.3 Read the loop of every strong candidate individually.
- [x] 1.4 `audit.md` published: one adoption, six read no-gos with reasons, and
      ~25 solvers explicitly recorded as **unaudited** rather than silently
      counted as no-gos.

## 2. Establish the conversion pattern

- [x] 2.1 **Magnets** — the cleanest fit, and converted first.
- [x] 2.2 Cap-monotonicity property test added (`magnets.test.ts`). Passes.
- [x] 2.3 Magnets' differential fixture is **unchanged**: no board moved.
- [x] 2.4 Pattern recorded in `audit.md` and the module header.

## 3. Convert, one game at a time

- [x] 3.1–3.4 One game qualified. Magnets converted, its full suite run, its
      fixture verified unchanged. No technique acquired a parameter for another
      game's benefit; the game's file got shorter *and* clearer — see §Findings.

## 4. Report what the conversions found

- [x] 4.1–4.3 **No new cap-monotonicity failure found.** Magnets is monotone.
      Boats remains the single known violation and is a *recorded, worked-around*
      property of that game, not an open bug.

## 5. No-gos

- [x] 5.1 Six recorded with reasons in `audit.md`.
- [x] 5.2 **Module header corrected.** It claimed to be "the one ordered-rung
      loop every logic game's solver/hint hand-rolled". It is not, and that claim
      did real damage — see Findings.
- [x] 5.3 Call-site list updated (it was already stale, omitting that
      `engine/latin.ts` serves eleven games).

## 6. Close out

- [x] 6.1 Metrics re-run.
- [x] 6.2 **Complexity ratchet not lowered.** One conversion does not move a
      distribution of 814 functions, and the ratchet moves only when a change
      earns it. Lowering it here would be exactly the aspirational threshold
      `establish-refactor-baseline` D2 forbids.
- [x] 6.3 Full gate green.
- [x] 6.4 Owner acceptance: not sought (the session was authorised to proceed
      without check-ins). Magnets plays through its full suite including the
      differential; the change is behaviour-preserving by construction.

## Findings

1. **The abstraction was right; its self-description was the defect.** Fitting
   five callers out of forty is a perfectly good abstraction. What did damage was
   the module *documenting itself as universal*: that turns "does this game fit?"
   into "why has this game not been adopted yet?", and it is why two separate
   handoffs asserted Loopy fits when it does not. The header now states the
   no-gos by name. **Generalises: an abstraction's stated scope is part of its
   API, and an overclaim costs more than an under-adoption.**
2. **The bookkeeping is the game, not the loop.** Every no-go has the same shape
   — the ladder is generic, and what wraps it is not: Unruly grades by difficulty
   constant rather than rung index, Singles drains an op queue per iteration,
   Spokes defines a tier by accumulated action count, Clusters' early-out is
   three-valued, Lightup's rungs are fused into one pass whose *scan order* is
   load-bearing for generation. Adding a hook for each would turn the runner into
   a configuration language.
3. **The conversion earned its place beyond deduplication.** Magnets' difficulty
   cap used to be `if (diff < DIFF_TRICKY) break;` sitting between rungs five and
   six, so knowing which techniques Easy may use meant reading the ladder and
   counting. It is now `maxRung: diff < DIFF_TRICKY ? 3 : 7`. A refactor that
   only removed duplication would not have been worth the fixture risk.
4. **Scope honesty.** The cap-monotonicity property is asserted for one game, not
   forty, because there is no uniform way to call the solvers — a cross-game
   version needs a per-game `(generate, solveAtCap)` registry that does not
   exist. Recorded as work not done rather than implied by the spec.
