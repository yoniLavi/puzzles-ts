# Tasks

## 1. The shared type

- [ ] 1.1 Rename `engine/hint-sidecar.ts` → `engine/overlay-sidecar.ts`,
      `HintSidecar` → `OverlaySidecar`; update the five render imports and the unit
      test (no behaviour change; this is the say-what-it-is rename).
- [ ] 1.2 Add `packCells(cells, index)` (or equivalent) for the `findMistakes` list
      shape: each listed cell gets a non-zero word, everything else clears — the
      `wrong.fill(0)` + set-1 dance as one call.

## 2. Convert the mistake sidecar, one game at a time (suite green each step)

- [ ] 2.1 Towers (`wrong`/`drawnWrong` → second `OverlaySidecar`; keep the existing
      per-game "highlights a mistake even when the cell was already drawn" test green —
      it is the guard for exactly this plumbing).
- [ ] 2.2 Unequal.
- [ ] 2.3 Keen.
- [ ] 2.4 Solo.
- [ ] 2.5 Undead.
- [ ] 2.6 Galaxies `wrongEdges`: evaluate; convert only if it fits without contortion,
      else record the no-go with the reason in `design.md`.

## 3. Riding micro-item

- [ ] 3.1 Hoist the duplicated `noMarks`/`declaresNoMarks` predicate from
      `hint-overlay.test.ts` + `hint-quality.test.ts` into `testing/hint-games.ts`.

## 4. Docs + gate

- [ ] 4.1 Playbook §3.2: the mistake-overlay paragraph points at `OverlaySidecar`; the
      per-game paint-twice *test* prescription stays (no generic mistaken board).
- [ ] 4.2 `tsc -b --noEmit` → `biome lint` → `vitest run` → `vite build`; snapshots
      unchanged (byte-identical render output is the acceptance bar, as it was for the
      hint conversion).
- [ ] 4.3 `openspec validate generalize-overlay-sidecar --strict`.
- [ ] 4.4 Owner acceptance; archive.
