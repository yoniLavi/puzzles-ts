# Tasks: Add an explained deduction hint to Filling

## 1. Recording deduction (`solver.ts`)
- [x] 1.1 `FillingHintReason` type (discriminated by technique: blocked /
  capacity / lonely / bitmap, each carrying its evidence cells).
- [x] 1.2 Thread an optional `record(cell, value, reason)` recorder through the
  four `learn_*` techniques (called at each fill), capturing the evidence
  cells (region members / pinning neighbours) at firing time.
- [x] 1.3 `deduceHintPlan(board, w, h)`: run the recording solver from the
  current board, return the ordered `(cell, value, reason)` list.
- [x] 1.4 Unit tests: each technique records the expected reason on a crafted
  board.

## 2. Hint + keep-track (`index.ts`)
- [x] 2.1 `FillingHint` highlight type (target cell+value, evidence area).
- [x] 2.2 `hint(state)`: refuse on solved / on non-empty `findMistakes`, else
  map `deduceHintPlan` to narrated `HintStep`s (per-technique "why" narration).
- [x] 2.3 `hintKeepTrack(m, step, state)`: completed iff the move sets the
  hinted cell to the hinted value, else off.
- [x] 2.4 Wire `hint`/`hintKeepTrack` into the Game object.
- [x] 2.5 Unit tests: plan solves the board, every step move legal, refusal
  cases, keep-track completed/off.

## 3. Hint rendering (`render.ts`)
- [x] 3.1 `COL_HINT` + `COL_HINT_CELL` palette entries; hint cache bits +
  packed forced digit.
- [x] 3.2 `redraw` accepts the displayed `HintStep`; shade the target cell
  `COL_HINT` and draw the forced digit in it, shade the evidence area
  `COL_HINT_CELL` (digits stay visible); fold into the cache-miss check.
- [x] 3.3 Tier-2.5 render-scenario snapshot of a hint frame (target `COL_HINT`,
  area `COL_HINT_CELL`, clues still drawn).

## 4. Gate + smoke
- [x] 4.1 Full gate: `tsc -b --noEmit` → `biome lint` → `vitest run` →
  `vite build` — all green.
- [x] 4.2 `npm run dev` smoke: Hint reveals a narrated forced cell with the blue
  target + forced digit + light-blue evidence shade; Auto-Hint steps through and
  solves the board; 0 console errors.
- [x] 4.3 Dev guides updated (live-wiki): hint-authoring with any Filling lesson.
- [x] 4.4 Commit (parity-gated; owner acceptance testing pending).

## 4b. Visual + wording iteration (owner-requested 2026-06-18)
- [x] 4b.1 Target cell is a **mild "fill here" highlight with no digit** (was a
  strong blue with the forced number drawn in) — a dark filled-in answer didn't
  read as a call to action. `COL_HINT` softened; the packed forced-digit field
  and the target-digit draw branch removed; `target.value` kept for keep-track.
- [x] 4b.2 All four narrations shortened without losing the *why* (e.g. blocked:
  "This is the only empty square that the shaded region of N could grow into.").
  Lean on the shaded picture + implied value ("the region of N") so the words
  name only the single reason.
- [x] 4b.3 Snapshot re-baselined; full gate green; dev smoke re-verified (mild
  target, terse banner, 0 console errors). Hint-authoring guide updated
  (shade-vs-ring "no preview digit for a numeric forced value" + "keep narration
  terse").

## 4c. Grouped multi-square hints (owner-requested 2026-06-18)
- [x] 4c.1 Region-growth deduction *grouped*: `nextRegionGroup` returns all the
  empty squares a region can't complete without (capacity-flood per
  reachable cell), as one step; `exact` flag when they complete the region.
  Single-cell `firstSolverMove` fallback for lonely / bitmap / only-one-growth.
  `deduceHintPlan` rebuilt on a working board (apply group → recompute), so each
  step's evidence reflects the board as it fires. Plan completeness re-verified
  (53/53 scanned boards solve; ~29% of steps group >1 square, up to 8).
- [x] 4c.2 `FillingHint` carries `cells: number[]` (multi-target); narrations
  reworded terse + number-light with exact/partial + singular/plural forms
  ("…fits exactly into these squares" / "…can't fully grow without these
  squares"). `hintKeepTrack` gains `"onTrack"` (subset fill shrinks the step
  in place) + completed/off. `render.ts` highlights all target cells.
- [x] 4c.3 Tests updated for the grouped shape (grouped exact step, multi-square
  4x1 case, onTrack partial-fill, plan-solves invariant); snapshot rebaselined;
  full gate green (1331 vitest); dev smoke re-verified (multi-square "fits
  exactly into these squares" frame, 0 console errors). Hint-authoring guide +
  spec delta updated for grouped firings.

## 5. Owner acceptance
- [x] 5.1 Owner follows hints / Auto-Hint to verify Filling plays correctly
      (accepted 2026-06-19: "Fabulous work", incl. the grouped multi-square
      "fits exactly into these squares" hints and the terse narration).
- [x] 5.2 Archive the change.
