# Tasks — add-spokes-hint

## 1. Survey and shape

- [ ] 1.1 Read `docs/porting/hint-authoring.md` end-to-end, plus a recent deductive
      exemplar (`bricks/`, `clusters/`) for the recording-pass + `HintSidecar`
      shape, and the Palisade bar text in `AGENTS.md`.
- [ ] 1.2 Confirm no engine change is needed: hooks, `ActiveHint` lifecycle,
      `continuesPrevious`, auto-hint pacing and overlay clearing all exist.

## 2. The recording deduction pass (design D1, D2)

- [ ] 2.1 `deduceSpokesPlan(board)` in `solver.ts`: replay the rungs in
      `spokesSolve`'s order, returning one *firing* at a time with the spokes it
      forces, its rung, and its evidence hubs/spokes; apply and repeat. Cap at
      `HINT_PLAN_MAX`.
- [ ] 2.2 Leave `spokesSolve` and every generator/solve caller untouched — assert
      it by re-running `spokes-differential.test.ts` (still 25/25 byte-for-byte).
- [ ] 2.3 Capture the look-ahead's hypothesis and the cells where the board breaks,
      so D3's contradiction narration has real evidence rather than an assertion.

## 3. `hint()` / `hintKeepTrack()` (design D2, D3, D4)

- [ ] 3.1 Build the `HintResult`: one journey per firing, continuation legs flagged
      `continuesPrevious`, every leg of a firing in the **same** colour.
- [ ] 3.2 Narration per rung, in the necessity voice, with the premise stated
      before the conclusion — especially the two-ones rule, which must name the
      connectivity constraint it rests on.
- [ ] 3.3 Refusals: solved board; `findMistakes()` non-empty (standard banner);
      live-invalid board; no rung fires.
- [ ] 3.4 Resolve **D3a** (contradiction narration depth) against real generated
      boards and record the answer in `design.md`.

## 4. Rendering (design D5)

- [ ] 4.1 `COL_HINT` spoke + `COL_HINT_CELL` evidence ring, in the per-hub cache
      key (playbook §3.2).
- [ ] 4.2 A diagonal hint spoke must also invalidate its corner entry, reusing the
      `CORNER_WRONG` mechanism — otherwise it paints with a hole where the four
      cells meet.

## 5. Tests

- [ ] 5.1 `spokes-hint.test.ts`: one board per rung, built so that rung fires
      first, asserting the forced spokes **and** the narration's claims.
- [ ] 5.2 A saturated-hub firing emits one multi-leg journey, not N hints, and all
      legs share a colour.
- [ ] 5.3 Recompute stability: following a step and re-asking continues the plan
      rather than restarting or reversing it (cross-game `hint-resume.test.ts`).
- [ ] 5.4 Cross-game `hint-overlay.test.ts` guard; a tier-2.5 render-scenario hint
      frame including a **diagonal** hint (the corner-invalidations case).
- [ ] 5.5 Refusal paths, including that a mistaken board gets the banner rather
      than a hint.

## 6. Close-out

- [ ] 6.1 Full gate green; `openspec validate add-spokes-hint --strict`.
- [ ] 6.2 Dev-verify in the browser: Hint and Auto-Hint on Easy, Tricky and Hard
      boards; read the narration as a player would and check every sentence is
      one the code has actually checked.
- [ ] 6.3 Update `docs/porting/hint-authoring.md` with anything this surfaced.
- [ ] 6.4 Owner acceptance, then archive.
