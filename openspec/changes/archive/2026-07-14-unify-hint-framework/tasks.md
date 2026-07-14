# Tasks

> Phase 0 and Phase 1 are the whole of this change's *committed* scope. Phase 2 is entered
> only if Phase 1 says go, and each seam may be split into its own change if it grows.

## 0. Audit — read what we actually shipped

- [x] 0.1 Inventory all 20 hinting games: what each one's hint is (deductive / movement /
      objective), which shared modules it uses, and which mechanics it re-derives. Table
      goes in `design.md`.
- [x] 0.2 Classify all 24 hint `fix(...)` commits into the six recurrence classes (or new
      ones the reading turns up). A class with one game is not a class. **Result: 22
      commits classified (design.md §0.2). Classes 4/5/6/7 recurred across games; class 1
      hit only Netslide; class 3's shipped fixes hit only Sixteen; class 2's evidence is
      real but lives outside `fix(hint)` commits (playbook §3.2).**
- [x] 0.3 **Check the live latent bugs the Netslide fix implies**: do Sixteen and Fifteen
      mis-place their hint marks mid-animation (the S1 bug, same structure)? Reach the
      frame with the tier-2.5 harness, as `netslide-hint.test.ts` does. If yes, that is
      both a bug to fix and the strongest possible evidence for S1. **Result: not live —
      both mark tiles by identity, not cell index; mid-slide-frame guards added to
      `sixteen.test.ts` and `fifteen-render.test.ts` (design.md §0.3).**
- [x] 0.4 Check whether every hinting game is actually enrolled in `hint-resume.test.ts`.
      Any that is not is an unguarded plan-stability regression waiting to happen.
      **Result: all 20 enrolled, in all three cross-game guards (design.md §0.4).**
- [x] 0.5 For each rule in `hint-authoring.md`, mark it: *structural* (the code prevents
      the mistake), *guarded* (a test prevents it), or *remembered* (only review prevents
      it). The "remembered" list is the target list. **Result: 70 rules — ~8 structural,
      5 guarded (all in `hint-resume.test.ts`), ~57 remembered (design.md §0.5).**

## 1. Decide — go/no-go per seam

- [x] 1.1 Score S1–S5 against the four criteria in `design.md`. Write the verdict and the
      reasoning for each, including the no-gos. **Result (design.md Phase 1): S1 no-go
      (closed by Phase-0 guards), S2 no-go, S3 GO (cross-game narration guards), S4 GO
      (cross-game paint-twice guard only), S5 no-go (already done).**
- [x] 1.2 Confirm with the owner before any extraction begins. A survey that concludes
      "leave it alone" is a valid, successful outcome — say so plainly if that is what the
      evidence says. **Owner 2026-07-14: GO on both guards (S3+S4), and the criteria were
      too harsh — "noticeably cleaner" abstractions are also in scope (design.md "Owner
      decision" section; Phase 2b worklist).**
- [x] 1.3 If go: sequence the seams into changes (one seam per change if any is large;
      S2 never shares a change with another seam). **Sequenced inside this change:
      2a guards (S4 then S3), then 2b cleanliness refactors one at a time (design.md).**

## 2. Extract (only if 1.2 says go)

- [x] 2.1 Per seam: land the shared machinery + its cross-game guard *before* converting
      any game. **Done for both GO seams: `testing/hint-games.ts` (shared enrollment) +
      `hint-overlay.test.ts` (S4) + `hint-quality.test.ts` (S3); flushed and fixed a real
      `Midend.playMoves` stale-plan bug (design.md Phase 2a).**
- [x] 2.2 Convert games one at a time, suite green at each step, exemplar hints (Palisade,
      Inertia, Towers, Filling) re-read word-for-word to confirm no narration was lost.
      **No game conversions were needed — both seams are guards; no narration changed
      (the S3 guard asserts form only, and the exemplar idioms are declared, not
      reworded).**
- [x] 2.3 Every seam that lands retires its rule(s) from `hint-authoring.md`. Record the
      guide's before/after line count in the change — the shrinkage is the metric.
      **Recorded honestly in design.md Phase 2a: ~1,600 lines before and after — the
      truer metric moved: rules guarded cross-game went 5 → 9 (§2.1, §2.5, §5.2,
      overlay-to-cache), enrollment collapsed to one line, and the guide now teaches +
      points instead of prescribing per-game tests.**
- [x] 2.4 (owner-relaxed bar, 2026-07-14) Cleanliness refactors from the Phase 2b
      worklist: overlay-plumbing helper, Towers/Unequal hint-stack dedupe (now including
      the `ensurePopulated`/populate-text copies across the candidate family), recorder
      vocab alignment, dead-module sweep. **Landed: populate opener hoisted into
      candidate-hint (4 games), `HintSidecar` render helper (5 games converted, output
      identical). Declined with reasons (design.md Phase 2b): recorder vocab renaming
      (cosmetic, byte-match blast radius), further Towers/Unequal dedupe (what remains
      differs genuinely), key-bits overlay helper (parameter soup; guard covers the
      class). Dead-module sweep: no `hint-entry.ts` exists — nothing to delete.**

## 3. Gate

- [ ] 3.1 `tsc -b --noEmit` → `biome lint` → `vitest run` → `vite build` at every step.
- [ ] 3.2 Owner acceptance on a real board per converted game — a green suite is not
      parity, and hint rendering is exactly where that has bitten before.
- [ ] 3.3 `openspec validate unify-hint-framework --strict`.
