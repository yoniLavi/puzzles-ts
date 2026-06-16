# Tasks: Add an explained deduction hint to Range

## 1. Recording deduction (`solver.ts`)
- [x] 1.1 `HintReason` type (discriminated by rule: adjacency / satisfied /
  overrun / reach / connect, each carrying its premise cells).
- [x] 1.2 Thread an optional `record(r, c, value, reason)` callback through the
  three rules (called at each successful `makeMove`), and through `applyRules`.
- [x] 1.3 `deduceHintPlan(grid, w, h)`: run the recording deduction on a clone
  from the current marks, return the ordered `(r, c, value, reason)` list.
- [x] 1.4 Unit tests: each rule records the expected reason on a crafted board.

## 2. Hint + keep-track (`index.ts`)
- [x] 2.1 `RangeHint` highlight type (target cell+value, premise refs).
- [x] 2.2 `hint(state)`: refuse on solved / on non-empty `findMistakes`, else
  map `deduceHintPlan` to narrated `HintStep`s (per-rule "why" narration).
- [x] 2.3 `hintKeepTrack(m, step, state)`: completed iff the move sets the
  hinted cell to the hinted value, else off.
- [x] 2.4 Wire `hint`/`hintKeepTrack` into the Game object.
- [x] 2.5 Unit tests: plan solves the board, every step move legal, refusal
  cases, keep-track completed/off.

## 3. Hint rendering (`render.ts`)
- [x] 3.1 `COL_HINT` + `COL_HINT_CELL` palette entries; hint cache bits.
- [x] 3.2 `redraw` accepts the displayed `HintStep`; fill the target cell
  `COL_HINT` with a move preview (black inset / dot), light-shade premise refs
  `COL_HINT_CELL`; fold into the cache-miss check.
- [x] 3.3 Tier-2.5 render-scenario snapshot of a hint frame (target `COL_HINT`,
  refs `COL_HINT_CELL`, clues still drawn).

## 4. Engine fix — hint banner without a status bar
- [x] 4.1 `Midend.emitStatusBar` emits the `status-bar-change` notification
  (which carries the hint explanation) for any game with a status bar OR a
  `hint` capability, so a no-status-bar hint game (Range) shows and clears the
  banner. `ts-engine` spec delta + a midend test (banner appears, then clears
  on a real `processInput` move).

## 4b. Engine fix — a refused hint highlights the board's mistakes
- [x] 4b.1 `Midend.computeHintPlan` calls `findMistakes()` on a refusal, so a
  hint refused because the board is wrong lights up the same overlay Check &
  Save uses (the refusal message promised "fix the highlighted mistakes" but
  highlighted nothing). Generic across all refusal paths (manual + Auto-Hint).
  `ts-engine` spec delta + midend tests (refusal-with-mistake highlights;
  refusal-without-mistake highlights nothing). Owner-found on Range
  (Auto-Hint claimed a highlight that never rendered); verified live.

## 5. Gate + smoke
- [x] 5.1 Full gate: `tsc -b --noEmit` → `biome lint` → `vitest run` →
  `vite build` — all green.
- [x] 5.2 `npm run dev` smoke (Playwright): Hint reveals a narrated forced cell
  ("Clue 9 can only reach its 9 cells…") with the blue target + white-dot
  preview + light-blue clue shade; Auto-Hint steps through placing blacks/dots
  and solves the board to the "You got it!" modal; 0 console errors.
- [ ] 5.3 Commit (parity-gated; owner acceptance testing pending).

## 6. Owner acceptance
- [ ] 6.1 Owner follows hints / Auto-Hint to verify Range plays correctly.
- [ ] 6.2 Archive the change.
