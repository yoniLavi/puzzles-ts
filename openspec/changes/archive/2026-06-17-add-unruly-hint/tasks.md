# Tasks: Add an explained hint + placement animation to Unruly

## 1. Solver: recording deduction
- [x] 1.1 Add `HintReason` (threes / complete / singlegap / unique / nearcomplete)
  and `HintMove` ({ index, value, reason, continuesPrevious }) and a `Recorder`
  callback type.
- [x] 1.2 Thread an optional `rec?: Recorder` through the five techniques and
  `fillRow` (a `fillRow` firing is one journey: first cell new, rest continue).
  Generation path passes no recorder (zero overhead).
- [x] 1.3 `deduceHintPlan(state)`: run the techniques to fixpoint at unlimited
  difficulty from the player's current grid, returning the recorded `HintMove[]`
  in deduction order (easiest technique first, per the solve loop's priority).

## 2. index.ts: hint + animation wiring
- [x] 2.1 `UnrulyHint` highlight type: `{ target: {x,y,value}, area: number[],
  ring: number[] }`.
- [x] 2.2 `narrate(reason)` per technique + `buildHighlights(reason, target)`
  producing area (sibling forced empties, light shade) and ring (filled premise
  cells / reserved window, COL_HINT outline).
- [x] 2.3 `hint(state)`: refuse on solved / non-empty `findMistakes`; else map
  `deduceHintPlan` to narrated `HintStep`s carrying `continuesPrevious`.
- [x] 2.4 `hintKeepTrack(move, step, state)`: `"completed"` iff the move sets the
  step's target cell to its value, else `"off"`.
- [x] 2.5 `animLength`: a short base duration for a `place` move that changes a
  cell (0 for solve / no-op); wire `hint`, `hintKeepTrack` into the Game object.

## 3. render.ts: hint render + placement animation
- [x] 3.1 Palette: add `COL_HINT` (blue) and `COL_HINT_CELL` (light blue) at new
  indices beyond the dark-mode override range (3–8).
- [x] 3.2 Hint render: from the displayed `HintStep`, fill the target `COL_HINT`
  + forced-colour preview; light-shade `area` empties; ring `ring` cells. Fold
  hint bits into the packed cache key.
- [x] 3.3 Placement animation: when `prev` differs and `animTime < animLength`,
  draw the prev colour as base and grow the new colour from the centre (the
  Flip always-redraw sentinel for animating cells).

## 4. Tests
- [x] 4.1 Tier-1: each technique's recorded reason + premise on a crafted board;
  plan validity (steps legal + plan solves); refusal solved / on mistakes;
  `hintKeepTrack` completed/off; continuesPrevious grouping for a row-fill.
- [x] 4.2 Visible-evidence invariant: every step has a non-empty area or ring.
- [x] 4.3 Tier-2: a render-op test for the growing-fill animation frame.
- [x] 4.4 Tier-2.5: `renderScenario` to a hint frame — targeted ops (COL_HINT
  target present, area/ring drawn, clues still drawn) + `toMatchSnapshot`.

## 5. Gate + docs
- [x] 5.1 Pre-commit gate green (`tsc -b --noEmit` → biome → vitest → vite build).
- [x] 5.2 Update `docs/porting/hint-authoring.md` (live wiki) with anything the
  guide didn't tell us (the filled-evidence → ring convention; grouping a
  fillRow firing; the placement-animation-as-hint-motion pattern).
- [x] 5.3 `openspec validate add-unruly-hint --strict`.

## 6. Parity gate
- [~] 6.1 Owner acceptance: hint correctness + readability across techniques,
  auto-hint motion, animation feel; then archive. Dev-verified in-browser
  (2026-06-17): threes hint renders (blue target + white preview + ringed black
  pair + narrated banner), Auto Hint steps through, the placement grow animates
  each fill, 0 console errors. Remaining for owner acceptance: the area-shaded
  complete / near-complete / unique hints (unit-verified, not yet eyeballed),
  manual follow-the-hint, touch.
