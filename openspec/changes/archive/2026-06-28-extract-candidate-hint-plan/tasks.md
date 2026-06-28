# Tasks: Extract the shared candidate-elimination hint plan

> Behaviour-preserving refactor. The regression gate is the **existing** per-game hint
> suites + `hint-resume.test.ts` (they already assert narration, journeys, keep-track,
> resume, and the no-stale-step / no-mutate guarantees). A migration is correct when
> those pass with **no snapshot change**. Read `docs/porting/hint-authoring.md` §9 and
> the four games' current `index.ts` hint sections first.

## 1. Tier 1 — pure helpers + keep-track/refresh (`engine/candidate-hint.ts`)
- [x] 1.1 New module `src/native/engine/candidate-hint.ts` with the pure helpers over
  `(grid, pencil, ops)`: `nakedSingle`, `anyEmptyLacksNotes`,
  `firstUnreflectedPlaceIndex`, `nextStrike`, `nextPlace`, `joinNums` — extracted from
  the current copies (verified byte-identical modulo the order var / typed-array type /
  biome wrapping first; Solo's `nextStrike` omitted the dup-filter only because it never
  records a `dup` elim, so the shared filter is a no-op there and load-bearing for the
  others). `nextStrike`/`nextPlace` return the matched `DeductionRecord`(s) so each game
  keeps reading its own reason union.
- [x] 1.2 A structural `CandidateMove` type and generic `keepCandidateHintTrack` /
  `refreshCandidateHintStep` over it + the shared `CandidateHighlights` (D5). One
  documented assertion (`strikeMove`) bridges the lower bound TS can't express
  (`pencilStrike` ∈ every candidate game's `Move`).
- [x] 1.3 `candidate-hint.test.ts`: the helpers' unit behaviour (naked single found,
  strike-group liveness + dup-exclusion, unreflected-place index, keep-track verdicts +
  in-place shrink, refresh drops dead marks / resolves placement + populate). 17 tests.
- [x] 1.4 Routed Keen → Towers → Unequal → Solo onto the tier-1 helpers, deleting each
  inline copy; re-ran each game's hint suite + `hint-resume.test.ts` after each — all
  green, no snapshot change. (Towers/Unequal keep their by-height / by-target
  `nextClueStrike`, a tier-2 strike-split concern; they still adopt the other helpers.)

## 2. Generalise the placement classifier (`engine/latin-hint.ts`)
- [x] 2.1 New `classifyPlacementInRegions(grid, pencil, cell, n, regions)` takes a
  **region list** (`{cells}` + a game tag), returning naked / hidden(region) / forced —
  the generic core of the §9.3a "re-derive the why" rule. `classifyPlacement` (the
  row/column API the Latin games use) is re-implemented over it with `[row, col]` and
  its public `SinglePlacement` shape (so Towers/Unequal/Keen narration is unchanged).
- [x] 2.2 Solo's `soloPlacementReason` folds onto `classifyPlacementInRegions` with
  `[row, col, block, diag0, diag1]` (Solo's bespoke `hiddenIn`/`line` helpers deleted);
  its block/diagonal hidden-single cases keep working (guarded by `solo-hint.test.ts`).
- [x] 2.3 `latin-hint.test.ts` extended for a non-row/column region (a sub-block hidden
  single, plus naked/forced over an arbitrary region). 9 tests.

## 3. Tier 2 — the `buildCandidatePlan` driver — EVALUATED, NOT BUILT (design D2 gate)
> Decision: **stopped after tier 1; the driver is not worth building.** Reading all four
> `buildSteps` walks, they diverge in (a) step *order* — Towers runs `nextExtremeClueLine`
> *before* the populate; the others run their basic-strike *after* it; (b) strike-*split*
> — four distinct policies (Keen by-cell, Solo intersect-or-by-cell, Towers by-height,
> Unequal by-target-cell); (c) continuation tracking — Keen/Solo emit `continuesPrevious`
> inside their journey, Towers/Unequal track `lastStrikeGroup` externally; (d) the emit
> shape itself. The genuinely-shared control flow is a ~6-line loop skeleton; a driver
> would be a callback shell around it with 8+ injection points — exactly the
> over-abstraction the gate guards against, with the per-game `buildSteps` more readable
> as-is. Tier 1 already removed the byte-identical duplication that caused the coordinated
> multi-game fixes (the helpers + keep-track/refresh). Recorded in the dev guide (§5.2).
- [x] 3.1–3.3 N/A — driver not built (see decision above).

## 4. Undead evaluation (non-migration is the expected outcome)
- [x] 4.1 Evaluated — **left on its own copy** (documented non-migration). Undead is not
  a Latin game: empty is `MON_NONE` (not `0`), cells are a 1-D `numTotal`/`op.cell` index
  (not `x/y` over `w`), notes are a monster-type bitmask in a `Uint8Array` where
  `nakedSingle` returns the mask itself as the `monster` (not a digit `n`), and its move
  union is `{set|clear|pencil|pencilStrike|markAll}` over `{cell, monster}` — structurally
  disjoint from the shared `CandidateMove` (`{set|pencilAll|pencilStrike}` over `{x,y,n}`).
  Forcing it onto the shared shape would need a full adapter for negative gain. Recorded
  in `docs/porting/hint-authoring.md` §9.

## 5. Close-out
- [x] 5.1 Full gate green (`tsc -b --noEmit` → `biome lint` (350 files, 0 fixes) →
  `vitest run` (1829 passed) → `vite build` (exit 0)). The C differentials
  (`{towers,keen,unequal,solo}-differential.test.ts`) pass untouched — no solver/
  generator change, only hint-plan plumbing — and no hint snapshot drifted (every
  migration was green with no `-u`).
- [x] 5.2 Updated `docs/porting/hint-authoring.md` §9 intro: a callout points at the
  shared `candidate-hint.ts` (import the helpers, don't copy), records why the per-game
  `buildSteps` walk stays (no shared driver — design D2), and notes the Undead
  non-migration. §9.4/§9.5 left intact (their per-game detail still holds).
- [ ] 5.3 Owner acceptance: spot-check a hint in each migrated game still reads and
  plays identically; on sign-off, commit + `openspec archive extract-candidate-hint-plan`.
