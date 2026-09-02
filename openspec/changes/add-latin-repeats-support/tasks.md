# Tasks — add-latin-repeats-support

Implemented 2026-09-02. The decisions are in `design.md`; the one that changed
the shape of the change is **D5**: the byte-match oracle survives the rewrite,
so it is kept, and the boards do not change.

## 0. Gate: the shared cube must stay inert for its existing consumers

- [x] 0.1 Opt-in via `LatinSolverConfig.repeats: { times }` (design D1); with
      it unset, `symbols = o`, every multiplicity is 1 and every path is the
      C's (D2's table). `latin-repeats.test.ts` pins the shape.
- [x] 0.2 Proven: all ten other `latin.ts` consumers' byte-match differentials
      (ABCD, Ascent, Group, Keen, Mathrax, Singles, Solo, Tents, Towers,
      Unequal — the proposal's "Undead" does not use the module) green
      unedited, in the full-suite run. Salad's own, see 3.1.

## 1. The cube

- [x] 1.1 The **last** symbol repeats `times` per line; `cubepos` strides by
      `symbols`; the row/column ledgers count. `LatinRepeatReason` is kept apart
      from `LatinReason` so the Latin-square games' exhaustive narrations are
      not asked about a case they cannot meet (D2).
- [x] 1.2 Positional elimination with multiplicity; the line strike once a line
      holds all `times`; `setGeneral` (D3) for sets with multiplicity, in place
      of the C's `set` only when a repeat is declared; forcing chains never link
      through the repeated symbol; recursion loops over `symbols`.
- [x] 1.3 `src/engine/latin-repeats.test.ts`: inertness (shape, stride,
      constructor bounds), each deduction with the repeated symbol, and solving
      a 5×5 pseudo-Latin puzzle in the cube — deduction, ambiguity, contradiction
      (including a hole given three times in a line), recursion. Probe cases
      re-anchored; the ledger case reclassified from *equivalent* to a real
      probe, since the count is now load-bearing; one new case on the
      multiplicity path.

## 2. Salad

- [x] 2.1 `salad/solver.ts` rewritten on the cube (D4): `holeSymbol(nums) =
      nums + 1`; a cross is the hole placed, a ball the hole struck; the marker
      array is read back off `cubeOut`; the border deduction reads the cube.
      `latinholes_solver_sync`, `_count`, `_place_cross`, `_place_circle` and
      the note at the file's head are gone. Number Ball has no user-solver left.
- [x] 2.2 The techniques the shape makes expressible are the cube's generic
      ones (1.2) — and they turned out to be **exactly as strong** as the
      translation layer on every board the C reference records (D5). No
      Salad-specific technique was added, because none was found that the
      generic rungs do not already make.
- [x] 2.3 No re-grading was needed: the boards are unchanged (D5), and the
      tier property from `grade-difficulty-tiers-honestly` (every preset, both
      tiers) still holds in `salad.test.ts`.
- [x] 2.4 The Number Ball gate (`DIFF_HOLESONLY`) runs as a hole-only fixpoint
      on the cube. **Its boards are unchanged**, so there is nothing new to
      judge by playing; the author's complaint about the mode's generator stands
      as an open design, now with the solver support it was waiting on. Recorded
      in `generator.ts`'s header and D5 rather than dressed up.

## 3. Assurance

- [x] 3.1 **Not retired — kept.** The differential was rewritten as
      verdict-only, run, and then the descriptions were surveyed: 15/15 Normal
      byte-identical, every Extreme difference the tier gate's. The original
      differential (loose gate) against the new solver: **28/28 byte-identical**.
      The verdict-only rewrite was discarded and the file kept, its header
      recording what it just proved (D5).
- [x] 3.2 The C fixtures' solver verdicts (`extra`) are unchanged and still
      asserted, both directions.
- [x] 3.3 Hint re-checked: the marker architecture is unchanged, the fixpoint
      markers now come off the cube, hole-symbol strikes are still dropped from
      the strike walk (header point 1, `repeatFull` narratable if that changes),
      and every `salad-hint.test.ts` narration passes as written. `hints.md`'s
      Salad passage rewritten for the new encoding.

## 4. Close out

- [x] 4.1 Spec deltas: `latin-solver` (ADDED the repeatable symbol; MODIFIED the
      cube-index sentence to `(x·o + y)·symbols + (n−1)`), `salad` (ADDED the
      direct-reasoning requirement with the kept-oracle scenario; MODIFIED the
      consumer requirement's "some squares empty" sentence — grepped, it lives
      in "Salad ports the solver as a shared Latin-square consumer").
      `docs/games/solver-and-generator.md` § "The Latin family" rewritten for
      the declared repeat.
- [x] 4.2 Full gate green (full suite: 7693 tests). **Owner acceptance on how
      Salad plays is moot** — every board and every hint sentence is what it
      was; the change is internal, and is archived on that basis.
