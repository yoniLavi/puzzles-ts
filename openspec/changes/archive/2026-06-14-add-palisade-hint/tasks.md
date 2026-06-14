## 1. Solver: hint-mode deduction recorder

- [x] 1.1 Add `ForcedEdge` / `SolverRule` types and an optional `record`
      field + `rule` tag to `SolverCtx`; record new walls in `disconnect`.
- [x] 1.2 Add `connectEdge(i, dir)` (merge + record a forced no-wall when the
      edge is newly connected) and a `seedNoWall(playerBorders)` DSF seed.
- [x] 1.3 Route `numberExhausted` / `equivalentEdges` connect branches through
      `connectEdge`; record `notTooSmall`'s unique growth edge. Verify the
      no-`record` path is unchanged (solve/findMistakes/generator).
- [x] 1.4 Export `deduceForcedEdges(p, clues, playerBorders): ForcedEdge[]`
      that seeds from the player state and runs the recorded fixpoint.

## 2. Game hooks: hint() + hintKeepTrack()

- [x] 2.1 Add `PalisadeHint` highlight type and a `forcedEdgeToStep` mapper
      (edge → two-sided `edges` move + per-rule narration + highlights).
- [x] 2.2 Implement `hint(state)`: solved/mistake guards, then the deduced
      plan; wire `hint` + `hintKeepTrack` onto `palisadeGame`.

## 3. Render: COL_HINT + highlight

- [x] 3.1 Add `COL_HINT`, `HINT_EDGE`/`F_HINT_CLUE` packed bits, edge-colour
      override, and a clue-cell outline.
- [x] 3.2 Fold the displayed `hint.highlights` into per-tile flags in `redraw`.
- [x] 3.3 Shell polish (surfaced by Palisade's full-sentence narrations): cap the
      shared hint banner (`puzzle-view.ts`) to the board width and wrap it, so a
      long hint grows downward instead of widening the game element — mirrors the
      statusbar's existing `max-width: canvasSize.w`.

## 4. Tests

- [x] 4.1 Solver: a rim-seeded deduction chain solves a generated board;
      seeding a no-wall mark suppresses its redundant hint.
- [x] 4.2 hint(): error on solved + on a board with a planted wrong wall; a
      valid plan otherwise. hintKeepTrack: completed on the hinted edit, off on
      the wrong button / a different edge.
- [x] 4.3 Render (tier-2): a hint step paints `COL_HINT` on the target edge and
      outlines the clue cell; clears when no hint.
- [x] 4.4 Midend integration: `hint()` then following the plan advances/solves.

## 5. Gate + acceptance

- [x] 5.1 `tsc -b --noEmit` → `biome` → `vitest run` → `vite build` green.
- [x] 5.2 Dev-verify in-browser (Playwright): Hint surfaces the first deduction
      with narration + blue edge/clue highlight; following the hinted edge draws
      the wall and clears the banner (one-hint-per-request); Auto Hint plays the
      whole chain to a solved board + win modal; 0 console errors, TS badge.

## 6. Post-review polish (owner feedback)

- [x] 6.1 Grammar: phrase every narration as advice not-yet-applied ("must be a
      wall" / "can't be a wall"), so a hint no longer reads as already done.
- [x] 6.2 Reference highlighting: the solver records each deduction's evidence
      (`cells` = clue pair / region, `siblings` = "these two edges"); the step's
      `PalisadeHint` carries them; `redraw` paints all referenced edges
      `COL_HINT` and shades referenced cells `COL_HINT_CELL`. No overhead on the
      no-recorder path (context computed only when `ctx.record` is set).
- [x] 6.3 Dev-verify: clue-pair both shaded ("Clues 3 and 3 … must be a wall"),
      `notTooBig` shades both regions ("Joining these regions … must be a wall");
      0 console errors.

## 7. equivalentEdges clarity (owner feedback round 2)

- [x] 7.1 Distinct sibling colour: `COL_HINT_SIBLING` (orange) for the *related*
      edge vs `COL_HINT` (blue) for the edge to act on; sibling edges ride a
      `sibCache` sidecar (no free packed-flag bits) folded into the cache check.
- [x] 7.2 Shade only the actual region for `equivalentEdges` (exclude the clue
      cell — it's the decider, not part of the region); clearer narration
      ("Both highlighted edges border the same shaded region; …").
- [x] 7.3 Dev-verify (Playwright): action edge blue, sibling orange, region
      shaded (clue not), narration concrete; 0 console errors.

- [x] 8.1 Owner acceptance (2026-06-14), commit + archive the change together.
