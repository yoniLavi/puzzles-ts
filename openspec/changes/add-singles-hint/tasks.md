# Tasks: Add an explained deduction hint to Singles

## 1. Recording deduction (`solver.ts`)
- [x] 1.1 `SinglesReason` discriminated union + `HintRecord` type (cell, op,
  reason, group).
- [x] 1.2 Extend `Op`/`SolverState` with reason + group; `solverOpAdd` carries
  them; `newGroup(ss)` helper. Recording gated on `ss.records`.
- [x] 1.3 Attach reasons in every primary rule (sandwich/doubles/the three
  corner cases/offset-pair/all-black-but-one/remove-splits) and the cascade
  (`solverOpCircle`→`adjBlack`, `solverOpBlacken`→`sameLine`); group the two-cell
  firings (corner-4, offset-pair).
- [x] 1.4 `solverOpsDo` records each applied op; `solveSpecific` takes an
  optional `ss`; `deduceHintPlan(state)` returns the ordered records.
- [x] 1.5 Unit tests: each rule records its expected reason on a crafted board;
  generator path unchanged (existing differential still byte-matches).

## 2. Hint + keep-track (`index.ts`)
- [x] 2.1 `SinglesHint` highlight type (targets, area, rings).
- [x] 2.2 `hint(state)`: refuse on solved / non-empty `findMistakes`, else merge
  `deduceHintPlan` records by group into narrated `HintStep`s (per-reason
  "why"); build highlights from each reason.
- [x] 2.3 `hintKeepTrack`: single-cell completed/off; multi-cell subset→onTrack
  (shrink in place) / completed / off.
- [x] 2.4 Wire `hint`/`hintKeepTrack` into the Game object.
- [x] 2.5 Unit tests: plan solves the board, every step move legal, refusal
  cases, keep-track completed/onTrack/off, visible-evidence invariant.

## 3. Hint rendering (`render.ts`)
- [x] 3.1 `COL_HINT` + `COL_HINT_CELL` palette entries; hint cache bits.
- [x] 3.2 `redraw` accepts the displayed `HintStep`; fill target cells `COL_HINT`
  + forced-mark preview; shade undecided-number evidence `COL_HINT_CELL`; ring
  decided premises `COL_HINT`; fold into the cache-miss check.
- [x] 3.3 Tier-2.5 render-scenario snapshot of a hint frame (target `COL_HINT`,
  evidence present, numbers still drawn).

## 4. Gate + guides + smoke
- [x] 4.1 Update `docs/porting/hint-authoring.md` (live wiki) with the op-queue
  recording shape if it teaches something new.
- [x] 4.2 Full gate: `tsc -b --noEmit` → `biome lint` → `vitest run` →
  `vite build` — all green.
- [x] 4.3 `npm run dev` smoke (Playwright): Hint reveals a narrated forced cell
  with the blue target + preview + evidence; Auto-Hint steps through and solves
  the board; 0 console errors.

## 4b. Visual + copy iteration (owner-reviewed)
- [x] 4b.1 Trim every narration to one sentence (terse directive,
  `hint-authoring.md`); verified live banner reads clean.
- [x] 4b.2 Corner deductions: split the highlight into distinct roles —
  matching pair (shaded evidence) vs. protected **corner** (new amber
  `COL_HINT_STRAND`/`DS_HINT_STRAND`), disjoint from the target (owner-reported
  confusion). Test for disjoint roles; in-process render-scenario confirms three
  distinct colours. Guide updated (distinct-roles-distinct-colours).
- [x] 4b.3 Corner narration made **value-aware** (reads the board numbers via
  `narrate(…, state)`) and reordered into the proof-by-contradiction arc the
  owner asked for: signal (touching pair) → ruled-out move → consequence
  (corner boxed in) → deduction — e.g. "One of the two touching 3s must be
  shaded. Shading this 5 … leaving the corner boxed in … — so the 5 stays
  white." Test asserts the
  value-aware wording; live render-scenario confirms text matches the picture.
  Guide updated (concrete-values + contradiction-arc lesson).

## 5. Owner acceptance
- [ ] 5.1 Owner follows hints / Auto-Hint to verify Singles plays correctly.
- [ ] 5.2 Commit (parity-gated) + archive on acceptance.
