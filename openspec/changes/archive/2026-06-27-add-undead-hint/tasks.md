# Tasks: Add an explained deduction hint to Undead

## 0. Decision gate (D8) — Tricky's forcing-hint approach — **RESOLVED (owner-accepted)**
- [x] 0.1 Measured the typical forcing-chain length on Tricky boards. Finding: forcing
  is **rare** on 5×5 Tricky (a minority of boards, a handful of eliminations when it
  fires — counting + sightline carry the solve), and each forcing deduction is one
  self-contained sentence, **measured max 130 chars** — *shorter* than the routine
  sightline hint (max 282 chars) that already ships on Easy/Normal.
- [x] 0.2 / 0.3 **Decision: keep forcing on Tricky as a single-step hint** (owner-accepted
  2026-06-27). Neither the guided what-if walk (0.2) nor the `Unreasonable` regrade (0.3)
  was built — both were unnecessary given the measurement. The what-if-walk visualisation
  is parked as a possible future enhancement, not a debt against this change. See design D8.

## 1. Recording solver (`undead/solver.ts`)
- [x] 1.1 `UndeadReason` union: `sightline` (the firing path), `total` (the exhausted
  monster type), `onlyCells` (counting's dual — a type forced into exactly its
  remaining cells), `forcing` (the hypothesised candidate), `single` (planner-derived
  naked-single placement). `HintOp` carries `{ kind, cell, monster, reason, group }`.
- [x] 1.2 `recordUndeadDeductions(common, placed)`: runs the ladder (counting →
  sightline → forcing) seeded from the **placed grid only** (D1), recording each
  firing in dependency order. Implemented as **separate code** from
  `gradeUndead`/`findUndeadSolution`, so the generate/solve path is byte-for-byte
  unchanged by construction (no recorder flag to thread). One pass = one firing = one
  `group`.
- [x] 1.3 C differential green (`undead-differential.test.ts` unchanged — the recorder
  is never on that path).

## 2. Move + UI (`undead/state.ts`)
- [x] 2.1 Added `{ type: "pencilStrike"; marks: { cell; monster }[] }` to `UndeadMove`;
  `executeMove` clears each candidate bit (idempotent AND-NOT).
- [x] 2.2 `recomputeErrors`/`solved` unaffected by `pencilStrike` (notes only).

## 3. Hint plan (`undead/index.ts`)
- [x] 3.1 `narrate(common, reason, bits, continues)`: mirror-sighting prose (indication
  → reasoning → necessity conclusion); strike-vs-place voice (§2.6); counts phrased
  "shows exactly N … and N", safe at the extremes 0 / line length (§2.7/D6).
- [x] 3.2 `buildSteps(state)`: naked single → forced placement (`onlyCells`) → lazy
  `markAll` populate → next elimination firing (sightline split by cell into a
  `continuesPrevious` journey; total/forcing as one step). **No solution-walk fallback**
  (D3). _Caveat:_ forcing narration is single-step (D8 open).
- [x] 3.3 `hint(state, aux?, ui?)`: refuses on solved / on `findMistakes`; deductive
  only; `ui` ignored (D4).
- [x] 3.4 `hintKeepTrack` (pre-move state): `markAll`/`set` match; `pencil` toggle
  clearing a strike mark → `onTrack` (shrink) / `completed`; else `off`.
- [x] 3.5 `refreshHintStep`: drop dead strike marks (resolve when none live); a
  placement step resolved once its cell is filled; populate resolved once every empty
  cell has notes.
- [x] 3.6 Registered `hint`/`hintKeepTrack`/`refreshHintStep` on `undeadGame`.

## 4. Rendering (`undead/render.ts`)
- [x] 4.1 Appended `COL_HINT` / `COL_HINT_CELL`; per-cell `hintPacked`/`drawnHint`
  `Int32Array` sidecar folded into the diff key (D7).
- [x] 4.2 Sightline area → `COL_HINT_CELL` shade; placement target → solid `COL_HINT`
  (no monster glyph, §5.1); struck candidate → normal glyph + `COL_HINT` strikethrough
  on a non-`COL_HINT` background (§5.3).
- [x] 4.3 `redraw` consumes the displayed `HintStep`; `UndeadHint` payload
  (`area`/`targets`/`marks`).

## 5. Tests
- [x] 5.1 Tier-1 (`undead-hint.test.ts`): a recorded reason per kind (sightline / total
  / onlyCells / forcing); recorder soundness (never strikes the solution monster);
  replayed plan solves a generated board (all tiers); narration necessity-voice +
  extremes guards; naked single first; populate before first strike; sightline-strike
  marks all on the narrated path; refusal on solved / mistakes; `hintKeepTrack`.
- [x] 5.2 `undeadGame` added to `engine/hint-resume.test.ts` (4×4 easy); `undead-hint.test.ts`
  resumes on 5×5 Normal / Tricky — every shipped tier solved by genuine deduction.
- [x] 5.3 Tier-2.5: a `renderScenario` sightline-elimination frame (struck strikethrough
  `COL_HINT`, sightline `COL_HINT_CELL`, clue glyphs drawn) + `toMatchSnapshot`.

## 6. Close-out
- [x] 6.1 Full gate green (`tsc -b --noEmit` → `biome lint` → `vitest run` (1731) →
  `vite build`); `docs/porting/hint-authoring.md` §9.4 added (non-Latin recorder,
  total/onlyCells kinds, deductive-only plan, the D8 forcing caveat).
- [x] 6.2 **Owner acceptance (stage 2):** D8 resolved (keep forcing on Tricky,
  single-step) and the owner completed acceptance testing across difficulties
  (2026-06-27). Commit + `openspec archive add-undead-hint --yes`.
