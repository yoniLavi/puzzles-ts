# Tasks

## 1. State and moves

- [ ] 1.1 Add the `mark` op (`{ kind: "mark"; x; y; ax; ay }`, doubled-grid
      coords) to `GalaxiesOp`; per-tile mark storage in state (typed-array
      parallel to the assoc fields; cheap clone).
- [ ] 1.2 `executeMove` semantics per design D1/D4: toggle-off on same pair,
      replace on different dot, absorbed by `assoc` on the same tile,
      cleared by the solver op; `unassoc` leaves marks alone.
- [ ] 1.3 Tier-1 tests: toggle/replace/absorb/solve-clear; undo restores a
      mark; save→load round-trips marks through the move log.

## 2. Input

- [ ] 2.1 Left-drag tile↔dot (either direction) with drag threshold; plain
      left click remains the edge toggle — tests pin both sides of the
      threshold.
- [ ] 2.2 Drag preview on `Ui` (`UI_UPDATE`), cancel on off-target release;
      `changedState` cancels a dangling mark-drag.
- [ ] 2.3 Touch: verify the gesture survives long-press promotion (key off
      the button class); the collection touch guard stays green.
- [ ] 2.4 Keyboard route (design D3 open question): pick the binding, record
      it in design.md, and test create/replace/remove by keyboard alone.
- [ ] 2.5 Note the mode coverage in `audit-input-mode-parity`'s inventory if
      that change is still open when this lands.

## 3. Rendering

- [ ] 3.1 Mark ghost pointing tile→dot: committed-arrow geometry,
      pencil-grade visual (palette meaning, no new colour value).
- [ ] 3.2 Cache: per-tile mark plane in the diff test (design D5); drag
      preview distinct from a committed mark.
- [ ] 3.3 Tier-2.5 scenario: mark visible after the move; visually distinct
      ops from a committed association; snapshot + targeted assertions;
      erased when absorbed by a real association.

## 4. Mistakes

- [ ] 4.1 `findMistakes` third arm: `{ kind: "mark" }` when a mark
      contradicts the unique solution (design D6).
- [ ] 4.2 Render the mark-mistake highlight; **paint-twice test** (warm
      cache → highlight appears; next transition erases).
- [ ] 4.3 Check & Save refuses on a mark mistake (existing gate; test at the
      midend level).

## 5. Docs, spec, close-out

- [ ] 5.1 Help page `help/games/galaxies.md`: describe the marks and the
      gesture.
- [ ] 5.2 Update `docs/games/` guides where this taught something new
      (entity-valued marks; the tile↔dot drag) — live-wiki obligation.
- [ ] 5.3 Record the framework-substrate notes (what fit poorly) in
      design.md close-out.
- [ ] 5.4 `openspec validate add-galaxies-association-marks --strict`;
      owner acceptance; archive.
