# retire-the-incentre-c-fixture — tasks

## 0. Before deleting anything

- [ ] 0.1 Re-read `design.md` D3. The fixture asserts three things, not one; a
      replacement that covers only the incentre quality silently drops the case
      enumeration and the face count.
- [ ] 0.2 Confirm the survey still holds — `find` for `.c`/`.h`/`.but`/CMake
      outside `openspec/changes/*/reference/`, and check no npm script has
      grown a C dependency. If it has, that is the finding and this change is
      not the response to it.

## 1. The yardstick

- [ ] 1.1 Decide the cost strategy from `design.md` D2 **by measuring**, not by
      picking. Record the numbers in `design.md` next to the estimate they
      replace.
- [ ] 1.2 Hoist `bestByBruteForce` / `inscribedRadius` / `insidePolygon` out of
      `grid-geometry.test.ts` if both files want them — but keep each
      derivation independent of `grid-geometry.ts` itself, which is the whole
      point of them. A shared *test* helper is fine; sharing with the
      implementation is not.
- [ ] 1.3 Prove the replacement is stronger before trusting it: re-run the two
      probe cases `probe-shared-hint-machinery` recorded for this module (the
      distance-to-edge foot bounds, and the 3-subset enumeration bound) and
      confirm the new sweep catches both. The C comparison caught neither.

## 2. The swap

- [ ] 2.1 Enumerate the tilings from the barrel's own list, not from the
      fixture, so a newly added tiling joins the sweep automatically.
- [ ] 2.2 Assert a face count from the grid — the "how many things did I look
      at?" guard, so a sweep that iterates nothing cannot read as a pass.
- [ ] 2.3 Delete `grid-incentre-c-reference.json`, the skip scaffold and the
      tautological `reports which tilings were skipped` test (D4).
- [ ] 2.4 Rewrite the file header: it currently explains at length why this is
      *not* a byte-match differential against C, which stops being the
      interesting fact once there is no C in it.

## 3. Close out

- [ ] 3.1 Update `docs/test-strength.md` — it discusses the boundary between
      local tests and differentials, and this change moves one case across it.
- [ ] 3.2 Report the gate's cost change in CPU time, as
      `probe-shared-hint-machinery` did.
- [ ] 3.3 Confirm `npm run probe -- grid-geometry` still reports 14/14 with 4
      equivalents, and that `--verify` still passes (the corpus quotes lines in
      `grid-geometry.ts`, which this change does not touch — if that count
      moves, something else did).
- [ ] 3.4 Full gate green.
