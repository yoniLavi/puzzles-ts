# Tasks — add-sticks-hint

> Read [`docs/porting/hint-authoring.md`](../../../docs/porting/hint-authoring.md)
> before starting, and **update it in this change** wherever it did not tell you
> something you needed — that edit is part of "done" (see `add-game-dev-guides`).

## 1. Make the deduction resumable (gating — do this first)

- [ ] 1.1 Factor the white-cell wipe out of `sticksSolveGame`, leaving a
      fixpoint that runs from the board it is given. The generator keeps
      wiping-then-running; the recorder runs from the player's marks. Design D2.
- [ ] 1.2 **Prove the generator is byte-identical** — the differential fixtures
      are the check, and they must not move. A moved fixture means the wipe was
      not merely relocated.
- [ ] 1.3 Confirm — do not assume — that a mid-game board needs no cascade
      priming. Sticks rescans every blank cell each iteration rather than
      propagating from what it changed, so it *should* be fine; Singles shipped
      a real bug on exactly this assumption (§7.1). A resumed-from-marks test
      is the evidence.

## 2. The recorder

- [ ] 2.1 Record **which** clue broke and **how**, at the point
      `sticksValidate` detects it — not re-derived at narration time (§2.4).
      Five kinds: `tooLong`, `unreachable`, `twoClues`, `overConnected`,
      `starved`. Design D1.
- [ ] 2.2 Run the plan loop through
      [`engine/hint-plan.ts`](../../../src/engine/hint-plan.ts)'s
      `deduceHintPlan` rather than a sixth hand-rolled copy (§3).
- [ ] 2.3 Tick a [`stepBudget`](../../../src/engine/step-budget.ts) on the
      **recording path only** — gated on the recorder signal, so the generator's
      fixpoint runs unguarded and unchanged (§7.2). A budget that fired during
      generation would break board generation.
- [ ] 2.4 Gate every reason allocation on the recorder so the solve path stays
      allocation-for-allocation as it was (the Singles discipline, §3).

## 3. Narration

- [ ] 3.1 One sentence per kind: indication → reasoning → conclusion (§2.2),
      necessity voice (`must be`, never `is`/`stays` — §2.1), under the
      300-character ceiling (§2.5).
- [ ] 3.2 Name squares by what the player can see — the clue's **number**, not
      "this square" or a bare pronoun (§2.3).
- [ ] 3.3 **Re-read every sentence at its degenerate clue values** (§2.7): a
      black clue of 0 and of 4, a length clue of 1. "only", "another" and
      "still" are where these break.
- [ ] 3.4 Check each premise actually singles out *this* conclusion (§2.4) —
      if two candidate moves satisfy the stated premise, the sentence names the
      wrong reason.
- [ ] 3.5 Keep the rules of the game out of the steps (§2.9) — "a line may
      cover only one number" belongs in `help/games/sticks.md` unless it is the
      technique *this* firing turns on.

## 4. Rendering

- [ ] 4.1 Add `COL_HINT` (and any evidence colour) to Sticks' palette — it has
      none today; the palette is `COL_BACKGROUND`/`GRID`/`LINE`/`NUMBER`/
      `ERROR`/`CURSOR`.
- [ ] 4.2 **Settle D3 against a rendered frame**: a `COL_HINT` stroke in the
      target cell (the Palisade/Spokes reading, recommended) versus a cell tint
      (the Singles reading). Record the call in `design.md` either way.
- [ ] 4.3 Shade the evidence as an **area**, per kind (§5.2, design D4). For
      `unreachable`, shade exactly the span the `maxSize*` walk covered — an
      approximated span makes the sentence false (§2.3).
- [ ] 4.4 Fold the hint bits into the per-tile cache key, or the overlay will
      not repaint (playbook §3.2; `hint-overlay.test.ts` covers the class once
      the game is enrolled).

## 5. Guards

- [ ] 5.1 **Enrol in [`testing/hint-games.ts`](../../../src/engine/testing/hint-games.ts)** —
      one line, and it buys resume, purity, no-op-free plans, overlay reach and
      narration quality at once (§7.1). A per-game "the plan solves from empty"
      test is not a substitute.
- [ ] 5.2 Per-game tier-2.5 render scenarios (§8): reach a frame for each of the
      five kinds by fixed-seed scan, assert targeted ops **plus**
      `toMatchSnapshot`, and commit the regenerated snapshot. Predicate
      `hintUntil` on a phrase **unique to that kind** — a loose predicate stops
      on the wrong frame.
- [ ] 5.3 Validate **grouping** on a *generated* board, not a crafted one
      (§8, design D5). One firing decides one cell here, so no
      `continuesPrevious` legs are expected — confirm by scanning seeds rather
      than by reading `sticksTry`.
- [ ] 5.4 Refusal: Sticks already declares `findMistakes`, so a wrong board
      gets "fix the highlighted mistakes first" with the cells lit, for free
      (§4). Assert it rather than assuming the wiring.
- [ ] 5.5 No `refreshHintStep` (design D6) — state the reason in the code so the
      next reader does not have to re-derive it.

## 6. Close out

- [ ] 6.1 Spec delta `sticks`; add Sticks to the `ts-engine` hint requirement's
      implementers if that list is maintained.
- [ ] 6.2 Update `help/games/sticks.md` — it must teach any vocabulary the hint
      introduces, and a hint and a help page that disagree are worse than either
      alone (§2.8).
- [ ] 6.3 Update `docs/porting/hint-authoring.md` with whatever this change
      learned. Two candidates already visible: **a game whose contradiction does
      not propagate is exempt from §1B.1's forcing warning** (the reason Sticks
      qualifies at all), and **the wipe-vs-resume trap has a second instance**
      beyond Boats.
- [ ] 6.4 Full gate green; differential fixtures unmoved; owner acceptance.
