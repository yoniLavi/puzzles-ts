# retire-the-incentre-c-fixture — tasks

## 0. Before deleting anything

- [x] 0.1 Re-read `design.md` D3. The fixture asserts three things, not one; a
      replacement that covers only the incentre quality silently drops the case
      enumeration and the face count.
- [x] 0.2 Confirm the survey still holds — `find` for `.c`/`.h`/`.but`/CMake
      outside `openspec/changes/*/reference/`, and check no npm script has
      grown a C dependency. If it has, that is the finding and this change is
      not the response to it. **Holds**: the same 2 reference files, and no
      script touches a toolchain.

## 1. The yardstick

- [x] 1.1 Decide the cost strategy from `design.md` D2 **by measuring**, not by
      picking. Recorded in D2: the ~4 s estimate was ~3.5× too high (it
      extrapolated from a *test file's* runtime, mostly import and transform).
      Full resolution over all eighteen tilings is **1,271 ms**, so all four
      mitigations are declined and the sweep runs at step 1 over every face.
- [x] 1.2 Hoist the yardstick — `src/engine/testing/polygon-yardstick.ts`, with
      its header stating the two rules that keep it a yardstick (never import
      `grid-geometry.ts`; take a plain ring, not a `GridFace`, so the separate
      derivation is structural rather than a convention).
- [x] 1.3 Prove the replacement is stronger before trusting it. **Partly, and
      the shortfall is the finding** — see D6. The distance-to-edge defect is
      caught (two tilings fail). The 3-subset enumeration defect is caught by
      neither the old comparison nor the new sweep, and the test that claimed to
      cover it does not; renamed to what it actually pins, with the arm recorded
      as unpinned and measured (2 of 400 shapes, ≤1%).

## 2. The swap

- [x] 2.1 Enumerate the tilings from the barrel's own list, not from the
      fixture. `CASES` is checked against `ALL_GRID_TYPES` by its own test, so a
      new tiling fails loudly instead of being silently unswept. The four
      aperiodic tilings join the sweep for the first time — their descs come
      from `gridNewDesc` under a fixed seed, needing no capture at all.
- [x] 2.2 Assert a face count from the grid — the "how many things did I look
      at?" guard, before any per-face assertion.
- [x] 2.3 Delete `grid-incentre-c-reference.json`, the skip scaffold and the
      tautological `reports which tilings were skipped` test (D4).
- [x] 2.4 Rewrite the file header.

## 3. What the yardstick found (unplanned; owner-approved during the session)

- [x] 3.1 Fix the rounding: `Math.trunc(v + 0.5)` → `Math.round(v)`. Worst
      shortfall 1.229 → 0.053 over 1,816 faces. See D5.
- [x] 3.2 Re-point the probe case that anchored on the old line at the
      *regression* it now guards, and confirm `--verify` passes.
- [x] 3.3 Add the negative-coordinate rounding case to `grid-geometry.test.ts`,
      which is where the defect is expressible in three lines.
- [x] 3.4 Check the blast radius rather than assume it: the only consumer is
      `loopy/render.ts`, and `loopy-render-scenario.test.ts.snap` does **not**
      move because its scenario is the square tiling — the one tiling with
      non-negative coordinates, where the two expressions agree. Noted in D5 as
      a coverage gap this change does not close.

## 4. The wider C-remnant sweep (owner-requested alongside)

- [x] 4.1 Delete the `savePreferences`/`loadPreferences` chain across
      `engine-surface.ts`, `worker-adapter.ts` and `puzzle.ts` — dead, and worse
      than dead (a public method silently returning an empty buffer). See D7.
- [x] 4.2 Correct `AGENTS.md`, which contradicted itself about `src/assets/`
      (`manual/` generated — the directory is gone) and still said everything
      under `build/` is gitignored (also gone).
- [x] 4.3 Record the rest of the sweep's verdict in D7: every remaining
      `puzzles/*.c` mention in `src/` is provenance, and the two one-implementer
      keeps already carry their reason at the site.

## 5. Close out

- [x] 5.1 Update `docs/test-strength.md` — new §4a, the boundary between a
      fixture recording the underivable and one standing in for a yardstick.
- [x] 5.2 Report the gate's cost change: `grid-incentre.test.ts` 171 ms → 2.5 s
      of test time. Under +4% of the full suite.
- [x] 5.3 `npm run probe -- grid-geometry` reports **14/14 (100%)** with 4
      equivalents, and `--verify` passes (173 cases across 18 modules, 56 engine
      test files, floor 50).
- [x] 5.4 Spec deltas: `repo-layout` (the added rule), `grid` (the requirement
      still mandated the peer bar — "within a small tolerance of upstream's" —
      so it is MODIFIED, not merely supplemented), `ts-engine` (the prefs
      no-op permission is withdrawn).
- [x] 5.5 Full gate green — 254 files, 6758 passed, 6 skipped; `vitest` ∥ `vite build` both clean.
