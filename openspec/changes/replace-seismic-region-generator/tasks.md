# Tasks — replace-seismic-region-generator

## 1. Before you start

- [ ] 1.1 Read the archived port's `design.md` findings **F1** (the measurement
      table and why the bound exists) and **F5** (the C's own timings, recorded
      per fixture in `__fixtures__/seismic-c-reference.json` as `genMs`) —
      `openspec/changes/archive/2026-07-27-add-seismic-ts-port/design.md`.
- [ ] 1.2 Re-run the current measurement so the "before" numbers are yours and
      not inherited: time `newSeismicDesc` over the 28 fixture configurations,
      and count attempts. Keep the script out of `src/` (it is a measurement,
      not a test) and note the numbers in this file.
- [ ] 1.3 Read `add-spokes-ts-port`'s `upstreamDirtyGate` (in
      `src/native/games/spokes/generator.ts`) — the shape D3 copies.

## 2. The constructive generator (design D1)

- [ ] 2.1 A region partitioner: connected regions of sizes drawn from `1..maxSize`
      (Tectonic fixes every region at 5). Seed a cell, accrete random adjacent
      free cells to the drawn size, and handle stranded pockets. Not
      `divvyRectangle` — it partitions into equal-size regions only (design D1
      records the no-go).
- [ ] 2.2 The fill: most-constrained-cell-first search over `solver.ts`'s
      existing `placeNumber` propagation, candidates tried in random order,
      bounded backtracking. Reuse the propagator — do not write a second one.
- [ ] 2.3 Wire both into `newSeismicDesc` ahead of the untouched `genClues` /
      `genDiff` stages (design D2), with `retryLimit` guards on the fill and the
      re-partition, each with its own label.
- [ ] 2.4 Choose the region-size distribution by generating boards and looking at
      them; record the choice and the reasoning in `design.md` (D1 leaves this
      open deliberately — there is no oracle for it).

## 3. Keep the oracle (design D3)

- [ ] 3.1 Add an options object to `newSeismicDesc` with
      `upstreamRegionGrower?: boolean`, keeping upstream's `genNumbers` /
      `genAreas` reachable through it. Comment **at both definitions** that they
      are retained deliberately as the differential's oracle, so a later reader
      does not delete the "unused" branch.
- [ ] 3.2 `seismic-differential.test.ts` sets the option; all 28 fixtures must
      still match the C **byte-for-byte**.
- [ ] 3.3 A test asserting the flag still *changes* the description for some
      seed, so the oracle cannot decay into re-testing the shipped path.

## 4. What replaces the byte-match for the new grower (design D4)

- [ ] 4.1 Structural properties over a fixed-seed sweep: every region connected,
      every region of size `k` holding exactly `{1..k}`, no region above the
      mode's maximum.
- [ ] 4.2 Rule properties: the mode's keep-apart rule holds across the whole
      filled solution, in both modes.
- [ ] 4.3 Puzzle properties: every generated description is uniquely soluble at
      exactly its requested band (soluble at `diff`, not at `diff − 1`) and
      round-trips through the codec.
- [ ] 4.4 Determinism: same seed ⇒ same description.
- [ ] 4.5 Seed-deterministic and never clock-gated (playbook §5.2) — no
      `elapsed < N` assertions anywhere.

## 5. Lift the ceiling (design D5)

- [ ] 5.1 Re-measure the reachable sizes with the new grower, sweeping *shapes*
      and not just square sizes (the old ceiling tracked cell count, and 4×12 and
      6×8 behaved differently at the same 48 cells).
- [ ] 5.2 Re-derive `MAX_CELLS` from that measurement — raise it, or remove it
      and say in the code why no bound is needed. Keep whatever bound the data
      justifies, with its reason, so the Custom dialog can still explain itself.
      Update the measurement table in its doc comment.
- [ ] 5.3 Check whether the *clue-stripping* stage becomes the new wall at large
      sizes (it runs `O(cells)` solver passes, each `O(cells²)`); if so, that is
      the honest limit and it belongs in the same bound.
- [ ] 5.4 Add larger presets — 10×10 at minimum, the author's stated target and
      the common Hakyuu size (design open question 1).
- [ ] 5.5 Re-time every preset and record the numbers next to the old ones
      (7×7 was 12–28 s; the point of the change is that it is not any more).

## 6. Spec, gate, close-out

- [ ] 6.1 Update the `seismic` spec deltas if the implementation lands anywhere
      other than where `specs/seismic/spec.md` in this change says it will.
- [ ] 6.2 Full gate green (`tsc -b --noEmit` → biome → `vitest run` →
      `vite build`).
- [ ] 6.3 `openspec validate replace-seismic-region-generator --strict`.
- [ ] 6.4 Dev-verify in the browser: a 10×10 board in both modes generates
      promptly and plays; the presets appear without a long wait; the Custom
      dialog still explains whatever bound survives.
- [ ] 6.5 Update `docs/porting/game-port-playbook.md` if this surfaces a reusable
      lesson — a *second* use of the keep-the-oracle-behind-a-flag pattern (after
      Spokes) is worth promoting from "Spokes did this" to a named technique.
- [ ] 6.6 Tell the owner, at acceptance, that shared `params#seed` game IDs for
      Seismic now generate different boards (`:desc` IDs and saves are
      unaffected) — a deliberate one-time break, better stated than discovered.

## 7. On owner acceptance

- [ ] 7.1 Archive (`openspec archive replace-seismic-region-generator --yes`) and
      commit the work and the archive together.
