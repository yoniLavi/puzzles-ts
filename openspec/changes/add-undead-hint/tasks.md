# Tasks: Add an explained deduction hint to Undead

## 0. Decision gate (D8) — Tricky's forcing-hint approach
- [ ] 0.1 Measure the typical forcing-chain length on Tricky boards (how many cells a
  hypothesis forces before the contradiction) to inform the choice.
- [ ] 0.2 Attempt the **guided what-if walk** for Tricky forcing (tentative-mark
  `continuesPrevious` journey, each leg one glance-able step, only the final strike
  real). Owner wants to see whether this can be made to work cleanly.
- [ ] 0.3 If it can't be made clean, take the owner's **fallback**: regrade the
  forcing-rung bucket to a new `Unreasonable` `Difficulty` (the small delta
  `strengthen-undead-deduction` D3 designed), leaving Easy/Normal/Tricky direct-only,
  and keep every shipped non-`Unreasonable` hint straightforward. (Adjusts the §3
  plan — no forcing narration in shipped tiers — and `state.ts`/`index.ts` per
  `strengthen-undead-deduction` tasks 4.1/4.2.)

## 1. Recording solver (`undead/solver.ts`)
- [ ] 1.1 `UndeadReason` union: `sightline` (the firing path + which clue/end + its
  count + the struck monster), `total` (the exhausted monster type), `forcing` (the
  hypothesised candidate + the clue/total it contradicts), `single` (a naked-single
  placement). `HintOp` carries `{ cell, monster, reason, group }`.
- [ ] 1.2 `recordUndeadDeductions(common, placed)`: run the iterative narrowing
  seeded from the **placed grid only** (D1), recording each elimination with its
  reason, gated on a recorder flag so `gradeUndead`/`findUndeadSolution` run
  byte-for-byte unchanged. One pass over one path = one `group`.
- [ ] 1.3 Confirm the recorder-off path is unchanged against the C differential
  (`undead-differential.test.ts` still green).

## 2. Move + UI (`undead/state.ts`)
- [ ] 2.1 Add `{ type: "pencilStrike"; marks: { cell: number; monster: number }[] }`
  to `UndeadMove`; `executeMove` clears each listed candidate bit (idempotent).
- [ ] 2.2 `recomputeErrors`/`solved` unaffected by `pencilStrike` (notes only).

## 3. Hint plan (`undead/index.ts`)
- [ ] 3.1 `narrate(reason, ...)`: mirror-sighting prose (indication → reasoning →
  necessity conclusion, §2.1/§2.2); strike-vs-place voice (§2.6); counts read
  correctly at the degenerate clue extremes 0 / line length (§2.7/D6).
- [ ] 3.2 `buildSteps(state)`: naked single → lazy `markAll` populate → total
  exhaustion → sightline elimination → forcing deduction → forced placement (D2);
  sightline firing split by cell into a `continuesPrevious` journey (§9.3). **No
  solution-walk fallback** — the strengthened deductive ladder
  (`strengthen-undead-deduction`) always has a real deduction to narrate (D3).
- [ ] 3.3 `hint(state, aux?, ui?)`: refuse on solved / on `findMistakes`; deductive
  only (no brute-force narration); `ui` ignored (D4).
- [ ] 3.4 `hintKeepTrack` (pre-move state, §3): populate match; placement match;
  `pencil`/`pencilStrike` subset → `onTrack` (shrink) / `completed`; else `off`.
- [ ] 3.5 `refreshHintStep`: drop dead strike marks (resolve when none live); a
  placement step resolved once its cell is filled; populate resolved once every empty
  cell has notes.
- [ ] 3.6 Register `hint`/`hintKeepTrack`/`refreshHintStep` on `undeadGame`.

## 4. Rendering (`undead/render.ts`)
- [ ] 4.1 Append `COL_HINT` / `COL_HINT_CELL`; per-cell `hintPacked`/`drawnHint`
  `Int32Array` sidecar folded into the diff key (D7).
- [ ] 4.2 Sightline area → `COL_HINT_CELL` shade; placement target → `COL_HINT` fill
  (no monster glyph, §5.1); struck candidate → strikethrough in normal pencil colour
  on a non-`COL_HINT` background (§5.3 contrast rule).
- [ ] 4.3 `redraw` consumes the displayed `HintStep`; `UndeadHint` payload type
  (`area`/`targets`/`marks`).

## 5. Tests
- [ ] 5.1 Tier-1: a recorded reason per kind (sightline / total / forcing / single); replayed
  steps complete a generated board; `narrate` necessity-voice + extremes guards;
  naked single surfaced first; populate before first strike; a sightline-strike
  step's marks all lie on the narrated path's cells (no bleed across paths); refusal
  on solved / mistakes; `hintKeepTrack` verdicts.
- [ ] 5.2 `undeadGame` added to `engine/hint-resume.test.ts` — resume to solved, a
  freshly-recomputed hint each step, on Easy / Normal / Tricky seeds (every shipped
  guess-free tier solved by genuine deduction, no fallback).
- [ ] 5.3 Tier-2.5: a `renderScenario` sightline-elimination journey frame (struck
  candidate strikethrough, sightline `COL_HINT_CELL`, clue/count glyphs still drawn)
  + `toMatchSnapshot`.

## 6. Close-out
- [ ] 6.1 Full gate green (`tsc -b --noEmit` → `biome lint` → `vitest run` →
  `vite build`); update `docs/porting/hint-authoring.md` §9 with what this port
  surfaced — the first non-Latin candidate-elimination hint (own recorder), the
  total-exhaustion deduction kind, and the deductive-only plan (no solution-walk
  fallback, guaranteed by `strengthen-undead-deduction`'s guess-free ladder).
- [ ] 6.2 Owner acceptance (stage 2): owner plays the hint across difficulties; on
  sign-off, commit + `openspec archive add-undead-hint --yes`.
