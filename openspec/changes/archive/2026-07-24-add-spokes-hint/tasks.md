# Tasks — add-spokes-hint

## 1. Survey and shape

- [x] 1.1 Read `docs/porting/hint-authoring.md` end-to-end, plus a recent deductive
      exemplar (`bricks/`) for the recording-pass + `OverlaySidecar` shape, and the
      Palisade bar text in `AGENTS.md`.
- [x] 1.2 Confirm no engine change is needed: hooks, `ActiveHint` lifecycle,
      `continuesPrevious`, auto-hint pacing and overlay clearing all exist. (True —
      Spokes is a new *implementer* only.)

## 2. The recording deduction pass (design D1, D2)

- [x] 2.1 `deduceSpokesPlan(board)` in `solver.ts`: replay the rungs in
      `spokesSolve`'s order, returning one *firing* at a time with the spokes it
      forces, its rung, and its evidence hubs/spokes; apply and repeat. Capped at
      `HINT_PLAN_MAX`.
- [x] 2.2 Leave `spokesSolve` and every generator/solve caller untouched — asserted
      by re-running `spokes-differential.test.ts` (still 25/25 byte-for-byte).
- [x] 2.3 Capture the look-ahead's hypothesis and the break hubs (`analyseBreak`), so
      D3's contradiction narration has real evidence rather than an assertion.

## 3. `hint()` / `hintKeepTrack()` (design D2, D3, D4)

- [x] 3.1 Build the `HintResult`: one journey per firing, continuation legs flagged
      `continuesPrevious`, every leg of a firing carrying the same highlight (all its
      forced spokes, shown in one colour).
- [x] 3.2 Narration per rung, in the necessity voice, premise before conclusion —
      the two-ones rule names the connectivity constraint it rests on.
- [x] 3.3 Refusals: solved board; `findMistakes()` non-empty (standard banner);
      undecidable board; no rung fires. (Live-invalid boards are caught by
      `findMistakes`, which compares against the unique solution.)
- [x] 3.4 Resolved **D3a** (contradiction narration depth) against real generated
      boards; recorded in `design.md` with the measured firing frequencies.

## 4. Rendering (design D5)

- [x] 4.1 `COL_HINT` spoke + `COL_HINT_CELL` evidence ring, in a per-hub hint
      `OverlaySidecar` (playbook §3.2).
- [x] 4.2 A diagonal *line* hint invalidates its corner entry (`CORNER_HINT`),
      reusing the `CORNER_WRONG` mechanism — otherwise it paints with a hole where
      the four cells meet.
- [x] 4.3 (Added) A rule-out (`SPOKE_MARKED`) suggestion is a `COL_HINT` *dot*, not a
      line — a line for a rule-out reads as "connect these" (design D5 refinement).

## 5. Tests

- [x] 5.1 `spokes-hint.test.ts`: each rung's forced spokes match the unique solution,
      and each narration states the claim it rests on.
- [x] 5.2 A saturated-hub firing emits one multi-leg journey (continuation legs, one
      shared highlight), not N hints.
- [x] 5.3 Recompute stability + purity + no-op-free plans + solve-from-any-position:
      free via enrolment in the cross-game `hint-resume.test.ts`.
- [x] 5.4 Cross-game `hint-overlay.test.ts` + `hint-quality.test.ts` guards (enrolled
      in `hint-games.ts` / the DEDUCTIVE set); a tier-2.5 render-scenario hint frame
      including a **diagonal line** hint (the corner-invalidation case).
- [x] 5.5 Refusal paths, including that a mistaken board gets the banner + the
      offenders flagged, rather than a hint.

## 6. Close-out

- [x] 6.1 Full gate green (tsc + biome + 4547 vitest + vite build);
      `openspec validate add-spokes-hint --strict` passes.
- [x] 6.2 Dev-verified in the browser on the real canvas: two-ones hint (ring +
      hint dots + connectivity narration) and the show→apply stepper on Easy;
      Auto-Hint on Hard (exhaustion narration, satisfied-hub greying, line/mark
      rendering); 0 console errors throughout. Saturation / diagonal-line /
      contradiction frames verified in-process via SVG + the tier-2.5 test (same
      render path). Owner's own read-through of the narration still welcome at 6.4.
- [x] 6.3 Update `docs/porting/hint-authoring.md` with what this surfaced
      (line-vs-mark rendering; forcing-tier narration stance; §2.10 goal-oriented
      hinting — hint the move that advances the goal, not every forced move).
- [x] 6.4 Owner acceptance (2026-07-24), then archive.

## 7. Owner-driven refinements (post-first-acceptance, 2026-07-24)

- [x] 7.1 Goal-first ordering + no useless rule-outs (`markHelps`; saturation
      before mark rungs); condensed every narration to one line (120-char ceiling).
- [x] 7.2 Automatic crossing rule-out: `syncDiagonalBlock` (auto-mark on draw,
      clear on erase, inert while blocked); the diagonal hint rung deleted as
      redundant. Dev-verified live (draw → auto-mark, erase → clear).
