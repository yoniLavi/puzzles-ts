# Tasks: Add an explained deduction hint to Keen

## 1. Recording solver (`keen/solver.ts`)
- [x] 1.1 `KeenReason` union: `cage` (the EASY/NORMAL per-square pruning — no cage
  layout leaves this candidate possible; carries the cage's op, value and cells),
  `cageLine` (the HARD cross-line pruning — a digit required in the cage along a
  row/column, ruled out elsewhere; carries op, value, cells, and orientation).
  `HintReason = KeenReason | LatinReason`; `HintOp extends DeductionRecord`.
- [x] 1.2 Record each elimination in `solverCommon` (gated on `solver.recorder`),
  and **return per firing on the recording path** (one cage = one `group` for the
  EASY/NORMAL prune; one line = one `group` for the HARD prune) so a step never
  mixes cages. Recorder-off path byte-for-byte unchanged.
- [x] 1.3 `recordKeenDeductions(w, clues, grid, maxdiff)` returns the ordered op
  script.

## 2. Hint plan (`keen/index.ts`)
- [x] 2.1 `narrate(reason, ns, w)`: quality-bar prose (indication → reasoning →
  necessity conclusion); strike-vs-place voice (§2.6); the cage clue named by a
  per-operation goal phrase that reads across `+`/`−`/`×`/`÷`.
- [x] 2.2 `buildSteps(state, autoClean)`: naked single → lazy `pencilAll` populate
  → basic Latin row/column dup strikes (placed values) → cage elimination → forced
  placement; one firing = one (possibly multi-leg) journey; `emitPlacement` folds
  or teaches the trivial dups by `autoClean`.
- [x] 2.2a `placementReason`/`placementArea`: re-derive a placement's *why* from the
  working board (the recorded `single` reason conflates naked and hidden singles) —
  naked single ("ruled out in this cell") vs hidden single in a row/column ("N can go
  in only this cell", shading the whole line). (Owner-flagged 2026-06-23.)
- [x] 2.3 `hint(state, aux?, ui?)`: refuse on solved / on `findMistakes`; cap at
  `DIFF_EXTREME` (deductive only); read auto-pencil off `ui`.
- [x] 2.4 `hintKeepTrack`: populate match; placement match; `pencilStrike` subset
  → `onTrack` (shrink in place) / `completed`; else `off` (pre-move state).
- [x] 2.5 `refreshHintStep`: drop dead `pencilStrike` marks (resolve when none
  live); a placement step resolved once its cell is filled; populate resolved once
  every empty cell has notes.

## 3. Rendering (`keen/render.ts`)
- [x] 3.1 Append `COL_HINT` / `COL_HINT_CELL`; per-cell `hintPacked`/`drawnHint`
  `Int32Array` sidecar folded into the diff key.
- [x] 3.2 `drawTile`: evidence → `COL_HINT_CELL` bg; placement target (no strike)
  → `COL_HINT` bg; struck candidate → cross-through in the pencil grid (normal
  `COL_PENCIL` on a non-`COL_HINT` background so the digit stays legible).
- [x] 3.3 `redraw` consumes the displayed `HintStep` (pack target/area/marks).
- [x] 3.4 `KeenHint` highlight payload type (`area`/`targets`/`marks`).

## 4. Wiring (`keen/index.ts`)
- [x] 4.1 Register `hint`/`hintKeepTrack`/`refreshHintStep` on `keenGame`.

## 5. Tests
- [x] 5.1 Tier-1: recorded cage reason; replayed placements complete a generated
  board; `narrate` necessity-voice guard; naked single surfaced first; populate
  before first elimination; cage-strike marks lie on the narrated cage's cells (or
  its line of sight for `cageLine`); auto-pencil on folds / off teaches the dups;
  refusal on solved / mistakes; `hintKeepTrack` verdicts.
- [x] 5.2 `keenGame` added to `engine/hint-resume.test.ts` (resume to solved, fresh
  recompute each step).
- [x] 5.3 Tier-2.5: a `renderScenario` cage-elimination journey frame (struck
  candidate `COL_HINT`/strikethrough, evidence `COL_HINT_CELL`, cage clue glyphs
  still drawn) + `toMatchSnapshot`.

## 6. Close-out
- [x] 6.1 Full gate green (`tsc -b --noEmit` → `biome lint` → `vitest run` →
  `vite build`); update `docs/porting/hint-authoring.md` with anything this hint
  surfaced.
- [ ] 6.2 Owner acceptance (stage 2): owner plays the hint; on sign-off, commit +
  `openspec archive add-keen-hint --yes`.
