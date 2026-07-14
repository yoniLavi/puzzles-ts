# Tasks

## 1. The shared type

- [x] 1.1 Rename `engine/hint-sidecar.ts` → `engine/overlay-sidecar.ts`,
      `HintSidecar` → `OverlaySidecar`; update the five render imports and the unit
      test (no behaviour change; this is the say-what-it-is rename).
- [x] 1.2 Add `packCells(cells, index)` for the `findMistakes` list shape (each listed
      cell gets `OVERLAY_FLAG`, everything else clears — the `wrong.fill(0)` + set-1
      dance as one call), plus the `clear()`/`add(i, bits)` primitives it and `pack()`
      are written in terms of, so a game with its own overlay topology (Galaxies) can
      pack itself without a contortion. `at(i)` is the per-cell "is it flagged".

## 2. Convert the mistake sidecar, one game at a time (suite green each step)

- [x] 2.1 Towers (`wrong`/`drawnWrong` → second `OverlaySidecar`; the per-game
      "highlights a mistake even when the cell was already drawn" test stayed green —
      it is the guard for exactly this plumbing).
- [x] 2.2 Unequal.
- [x] 2.3 Keen.
- [x] 2.4 Solo.
- [x] 2.5 Undead.
- [x] 2.6 Galaxies `wrongEdges`: **converted** — it fits `clear()`/`add()` cleanly and
      the code got smaller (the per-frame `Set` + four per-tile lookups became a
      pre-pass over the mistake list). Reasoning in `design.md` D2.
- [x] 2.7 (Found while converting.) Galaxies' wall-overlay render test painted only a
      *cold* frame, which cannot fail for the bug it guards. Added the paint-twice
      guard the playbook prescribes, incl. the overlay-clears-again half (`design.md`
      D3).

## 3. Riding micro-item

- [x] 3.1 Hoist the duplicated `noMarks`/`declaresNoMarks` predicate from
      `hint-overlay.test.ts` + `hint-quality.test.ts` into `testing/hint-games.ts`.

## 4. Docs + gate

- [x] 4.1 Playbook §3.2: the overlay paragraph now points at `OverlaySidecar` for
      *every* overlay (a three-row table: highlights / cell list / own topology), and
      the paint-twice prescription says why a cold-frame test proves nothing.
- [x] 4.2 `tsc -b --noEmit` → `biome lint` → `vitest run` (2596 passed) → `vite build`;
      snapshots unchanged — render output is byte-identical, the acceptance bar.
- [x] 4.3 `openspec validate generalize-overlay-sidecar --strict`.
- [x] 4.4 Owner acceptance (2026-07-14); archive.
