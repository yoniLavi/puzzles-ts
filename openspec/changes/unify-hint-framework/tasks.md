# Tasks

> Phase 0 and Phase 1 are the whole of this change's *committed* scope. Phase 2 is entered
> only if Phase 1 says go, and each seam may be split into its own change if it grows.

## 0. Audit — read what we actually shipped

- [ ] 0.1 Inventory all 20 hinting games: what each one's hint is (deductive / movement /
      objective), which shared modules it uses, and which mechanics it re-derives. Table
      goes in `design.md`.
- [ ] 0.2 Classify all 24 hint `fix(...)` commits into the six recurrence classes (or new
      ones the reading turns up). A class with one game is not a class.
- [ ] 0.3 **Check the live latent bugs the Netslide fix implies**: do Sixteen and Fifteen
      mis-place their hint marks mid-animation (the S1 bug, same structure)? Reach the
      frame with the tier-2.5 harness, as `netslide-hint.test.ts` does. If yes, that is
      both a bug to fix and the strongest possible evidence for S1.
- [ ] 0.4 Check whether every hinting game is actually enrolled in `hint-resume.test.ts`.
      Any that is not is an unguarded plan-stability regression waiting to happen.
- [ ] 0.5 For each rule in `hint-authoring.md`, mark it: *structural* (the code prevents
      the mistake), *guarded* (a test prevents it), or *remembered* (only review prevents
      it). The "remembered" list is the target list.

## 1. Decide — go/no-go per seam

- [ ] 1.1 Score S1–S5 against the four criteria in `design.md`. Write the verdict and the
      reasoning for each, including the no-gos.
- [ ] 1.2 Confirm with the owner before any extraction begins. A survey that concludes
      "leave it alone" is a valid, successful outcome — say so plainly if that is what the
      evidence says.
- [ ] 1.3 If go: sequence the seams into changes (one seam per change if any is large;
      S2 never shares a change with another seam).

## 2. Extract (only if 1.2 says go)

- [ ] 2.1 Per seam: land the shared machinery + its cross-game guard *before* converting
      any game.
- [ ] 2.2 Convert games one at a time, suite green at each step, exemplar hints (Palisade,
      Inertia, Towers, Filling) re-read word-for-word to confirm no narration was lost.
- [ ] 2.3 Every seam that lands retires its rule(s) from `hint-authoring.md`. Record the
      guide's before/after line count in the change — the shrinkage is the metric.

## 3. Gate

- [ ] 3.1 `tsc -b --noEmit` → `biome lint` → `vitest run` → `vite build` at every step.
- [ ] 3.2 Owner acceptance on a real board per converted game — a green suite is not
      parity, and hint rendering is exactly where that has bitten before.
- [ ] 3.3 `openspec validate unify-hint-framework --strict`.
