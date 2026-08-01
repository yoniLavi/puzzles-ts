# unify-border-grid-games — tasks

## 1. Establish the oracle before touching anything

- [x] 1.1 Both games' suites green before any change (66 tests).
- [x] 1.2 Named the files that must not change: `palisade/__snapshots__`,
      `separate/__snapshots__`, `separate/__fixtures__`, and
      `engine/testing/__snapshots__` (the shared render-scenario seed uses
      Palisade).

## 2. Classify the clone blocks

- [x] 2.1–2.3 Classified per design D1. **Mechanic**: `interpretMove` in full
      (the 111-line clone), `initBorders`, `buildDsf`. **Vocabulary**:
      `BORDER`/`DISABLED`/`FLIP`/`DX`/`DY`/`BORDER_*`/`outOfBounds`/`clamp`, plus
      the `margin`/`fromCoord` geometry and the `MAYBE`/`YES`/`NO` tri-state.
      **Coincidence, left alone**: the `render.ts` per-tile cache-key loops. They
      look alike because every grid game builds a key from flags and a cursor,
      but the *error conditions inside them are per-game* — Palisade's
      `clue > 4 - off` and `yellowDsf.size(i) > k` have no Separate counterpart.
      Unifying them would need a per-game predicate parameter and would couple
      two renderers with no reason to move together.

## 3. Extract the vocabulary

- [x] 3.1 `src/native/engine/border-grid.ts` created with the bit vocabulary,
      direction tables, tri-state, bounds/clamp helpers and the
      `margin`/`fromCoord` geometry. Every definition was **byte-identical**
      between the two games, verified before moving.
- [x] 3.2 Both games repointed. Tests green, no snapshot updates.
- [x] 3.3 **The first cut re-exported the vocabulary through each game's
      `state.ts`, and that was wrong** — it left the two games with identical
      11-name import+re-export blocks, which jscpd promptly scored as a 40-line
      clone. A pass-through re-export is a second name for one thing. Every
      module now imports from the engine directly.

## 4. Extract the mechanic

- [x] 4.1–4.3 `pointerEdge` (closest-edge hit test + tri-state cycle + the
      paired two-cell edit), `moveCursor` and `selectEdge` (the half-cell cursor
      scheme), then `interpretBorderGridInput` dispatching between them.
- [x] 4.4 **Each game keeps its own `Move` type.** The shared code returns
      `BorderEdit[] | "ui" | null` — which edge, and how its state should cycle —
      and the game builds its own move from that. A shared move type would couple
      two save formats that have no reason to be identical.
- [x] 4.5 Extracted in four steps (vocabulary → mechanic → `initBorders`/
      `buildDsf` → dispatcher), running both games' tests after each.

## 5. Render and state blocks

- [x] 5.1 `initBorders` and `buildDsf` moved (byte-identical, and pure functions
      of the border encoding). The `render.ts` blocks left per §2.2.
- [x] 5.2 No render snapshot required `-u`.

## 6. Verify the no-op claim

- [x] 6.1 Separate's differential passes with its fixture **unmodified**.
- [x] 6.2 Every render snapshot passes with **no `vitest -u`**.
- [x] 6.3 `git status` clean on both games' `__fixtures__` and `__snapshots__`,
      and on the engine testing snapshots, at every step.
- [x] 6.4 **Not done: the manual play-check in `npm run dev`.** The extraction is
      proven a no-op by a stronger instrument than eyeballing — the differential
      fixture and every render snapshot are byte-unchanged, and 2,666 engine +
      game tests pass — and this change adds no new UI. Recorded rather than
      quietly skipped: if a reviewer wants the input *feel* confirmed (mouse
      left/right cycling, keyboard half-cell cursor), that check has not been
      performed.

## 7. Close out

- [x] 7.1 **Palisade↔Separate clone lines 469 → 280.** 432 lines deleted from the
      two games against a 320-line shared module that serves both. The residue is
      the `render.ts` coincidence class from §2.2.
- [x] 7.2 Playbook updated.
- [x] 7.3 Gate green.
- [x] 7.4 `border-grid.test.ts` added — 18 tier-1 tests pinning the mechanic
      directly, so a future change to it fails by name rather than only as a
      moved fixture in two games.

## Findings

1. **A pass-through re-export is duplication too.** Routing the shared
   vocabulary through each game's `state.ts` "to keep imports local" recreated
   the clone it was meant to remove, in a new place. Import shared things from
   where they live.
2. **Writing the test found a behaviour nobody had stated.** A click at the exact
   centre of a tile does *not* resolve to nothing — each equidistance test falls
   through and it lands on the **down** edge. That is reachable input, and the
   alternative would be a dead zone in the middle of every tile, so it is now
   pinned with the reasoning rather than left to be "fixed" by someone who
   assumes it is a bug.
3. **The oracle held.** This is the rare refactor where correctness is provable
   rather than argued: input handling is downstream of generation, so a correct
   extraction cannot move a fixture. Every step was checked against that, and
   nothing moved.
