# Tasks: Add an explained deduction hint to Solo

> Solo is the first Latin-family hint whose solver is **bespoke** (not
> `engine/latin.ts`), so §1 is real net-new recording work, not a thread-through.
> Read `docs/porting/hint-authoring.md` §9 and the archived `add-keen-hint` first.

## 1. Recording solver (`solo/solver.ts`)
- [ ] 1.1 `SoloReason` union covering every recorded technique: `single`,
  `positional`/`hiddenSingle` (named by region: row/column/block/diagonal),
  `dup`, `intersect` (two regions), `set` (digit set + region), `forcing`, and the
  killer reasons `cageSingle`/`cageMinMax`/`cageSums`/`cageIntersect` (cage cells +
  sum clue). `HintOp extends DeductionRecord` with `{ kind: "place" | "elim",
  x, y, n, group, reason }`.
- [ ] 1.2 Add an opt-in, nullable `recorder` to `SolverUsage`; write a record at
  each `place`/`elim`/`intersect`/`set`/`forcing` site and at each killer-deduction
  site, gated on the recorder. **Return per firing on the recording path** (one
  region/cell/cage = one `group`) so a step never mixes regions. Recorder-off path
  byte-for-byte unchanged — re-run the C differential to prove it.
- [ ] 1.3 `recordSoloDeductions(state, maxdiff, maxkdiff)` returns the ordered op
  script (capped below `DIFF_RECURSIVE`).

## 2. Hint plan (`solo/index.ts`)
- [ ] 2.1 `narrate(reason, ns)`: quality-bar prose (indication → reasoning →
  necessity conclusion); strike-vs-place voice; the firing region named (row N /
  this column / this block / this diagonal), and the killer cage named by a goal
  phrase ("this cage must sum to V").
- [ ] 2.2 `buildSteps(state, autoClean)`: naked single → lazy `pencilAll` populate
  → basic-region dup strikes (placed/given values, generalised to block + X
  diagonals) → next deductive elimination → forced placement; one firing = one
  (possibly multi-leg) journey; `emitPlacement` folds or teaches the trivial dups
  by `autoClean`.
- [ ] 2.2a `placementReason`/`placementArea`: re-derive a placement's *why* from
  the working board (naked single vs positional/hidden single in a region), since
  the recorded `place` reason conflates them; shade the forcing region as evidence
  for a positional/hidden single.
- [ ] 2.3 `hint(state, aux?, ui?)`: refuse on solved / on `findMistakes`; cap at
  `DIFF_EXTREME` + `DIFF_KINTERSECT` (deductive only); read auto-pencil off `ui`.
- [ ] 2.4 `hintKeepTrack`: populate match; placement match; `pencilStrike` subset
  → `onTrack` (shrink in place) / `completed`; else `off` (pre-move state).
- [ ] 2.5 `refreshHintStep`: drop dead `pencilStrike` marks (resolve when none
  live); a placement step resolved once its cell is filled; populate resolved once
  every empty cell has notes.

## 3. Rendering (`solo/render.ts`)
- [ ] 3.1 Append `COL_HINT` / `COL_HINT_CELL` past the fork pencil-body (index 9);
  per-cell `hintPacked`/`drawnHint` `Int32Array` sidecar folded into the diff key
  (the third sidecar alongside `pencil`/`drawnWrong`).
- [ ] 3.2 `drawNumber`: evidence region → `COL_HINT_CELL` bg; placement target
  (no strike) → `COL_HINT` bg; struck candidate → cross-through in the pencil grid
  (normal `COL_PENCIL` on a non-`COL_HINT` background so the digit stays legible).
  Element-type colour legend when a step names ≥2 region types.
- [ ] 3.3 `redraw` consumes the displayed `HintStep` (pack target/area/marks).
- [ ] 3.4 `SoloHint` highlight payload type (`area`/`targets`/`marks`).

## 4. Wiring (`solo/index.ts`)
- [ ] 4.1 Register `hint`/`hintKeepTrack`/`refreshHintStep` on `soloGame`.

## 5. Tests
- [ ] 5.1 Tier-1: a recorded reason per technique (incl. one killer deduction and
  one X-diagonal deduction); replayed placements complete a generated board;
  `narrate` necessity-voice guard; naked single surfaced first; populate before
  first elimination; basic-region dups taught (auto-pencil off) / folded (on);
  refusal on solved / mistakes; `hintKeepTrack` verdicts.
- [ ] 5.2 `soloGame` added to `engine/hint-resume.test.ts` (resume to solved, fresh
  recompute each step) — exercise standard, X, jigsaw, and killer.
- [ ] 5.3 Tier-2.5: a `renderScenario` elimination journey frame (struck candidate
  `COL_HINT`/strikethrough, evidence `COL_HINT_CELL`, region/clues still drawn) +
  `toMatchSnapshot`.

## 6. Close-out
- [ ] 6.1 Full gate green (`tsc -b --noEmit` → `biome lint` → `vitest run` →
  `vite build`); the byte-match C differential still green (recorder-off path
  unchanged); update `docs/porting/hint-authoring.md` §9 with anything this hint
  surfaced (esp. the bespoke-solver recording note — the first non-`latin.ts`
  Latin-family hint).
- [ ] 6.2 Owner acceptance (stage 2): owner plays the hint across the four
  variants; on sign-off, commit + `openspec archive add-solo-hint --yes`.
