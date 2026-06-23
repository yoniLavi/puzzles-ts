# Tasks: Fix Latin-family hidden-single hint narration

## 1. Shared helper
- [x] 1.1 `src/native/engine/latin-hint.ts`: `classifyPlacement` (naked / hidden /
  forced, only empty cells compete), `singlePlacementReason` (→ `single` /
  `hiddenSingle` / `forcedSingle`), `hiddenSingleLine` (evidence cells).
- [x] 1.2 `latin-hint.test.ts`: the three classifications, the filled-competitor
  edge, the reason mapping, the line cells.

## 2. Keen (refactor onto the helper)
- [x] 2.1 Remove the inline `placementReason`/`placementArea` classifier; import
  `singlePlacementReason` / `hiddenSingleLine`.
- [x] 2.2 Add the `forcedSingle` reason + narration.

## 3. Towers
- [x] 3.1 `hiddenSingle` + `forcedSingle` reasons; the two narrations; `reasonArea`
  shades the line for a hidden single.
- [x] 3.2 Reclassify a recorded `single` placement at `nextPlace` (clue-driven
  placement reasons kept as-is).

## 4. Unequal
- [x] 4.1 `hiddenSingle` + `forcedSingle` reasons; the two narrations; placement
  evidence shades the line for a hidden single.
- [x] 4.2 Reclassify a recorded `single` placement at `nextPlace`.

## 5. Regression guard + gate
- [x] 5.1 `hint-resume.test.ts`: "a Latin-family placement never falsely claims a
  naked single" across Towers, Unequal, Keen.
- [x] 5.2 Probe confirms 0 mis-narrations (was 37 Towers / 13 Unequal); full gate
  green (`tsc -b --noEmit` → `biome lint` → `vitest run` → `vite build`);
  `hint-authoring.md` §9.3a updated.

## 6. Close-out
- [x] 6.1 Owner asked for this fix directly; ship with `add-keen-hint` and archive.
