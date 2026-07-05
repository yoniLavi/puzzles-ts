# Tasks — add-signpost-ts-port

## 1. Scaffold + state/codec

- [x] 1.1 `scripts/new-game-port.sh signpost`; fill `state.ts`: params
      (`w`/`h`/`forceCornerStart`), encode/decode/validate params (`NxM`,
      square `N`, trailing `c`), desc codec (per-cell `<num?><dir a–h>`,
      leading `S` for solve), `newState`/`cloneState` (typed arrays + `Dsf`
      clone), the move union (D2). (`Dsf.clone()` added to the engine leaf.)
- [x] 1.2 Tier-1 tests: params round-trip, desc round-trip, `validateDesc`
      rejections (bad char, wrong cell count).

## 2. Chain model: links, numbering, colouring

- [x] 2.1 `state.ts`: `updateNumbers` + `headNumber` / `connectNumbers`
      port — the `next`/`prev` walk, `Dsf` region binding, derived
      `nums`/`numsi`, and the 16-way `COLOUR`/`START` colour-group
      assignment with the exact four-case merge rule (D3).
- [x] 2.2 `checkCompletion` port: `FLAG_ERROR` recompute, `completed`
      latch, `impossible` carry (D5).
- [x] 2.3 Covered by the differential (byte-match proves the numbering /
      completion path) + the findMistakes/solve tier-1 tests.

## 3. Solver + generator (byte-match-critical)

- [x] 3.1 `solver.ts`: `solveSingle` (forced sole-next / sole-prev link via
      the `from[]` accumulator, `moveCouldFit` gating) iterated with
      `updateNumbers` to a fixpoint; return codes solved / stuck /
      impossible.
- [x] 3.2 `generator.ts`: `newGameFill` (head+tail random walk, `cellAdj`
      enumeration, re-roll on non-aligned finish), `newGameStrip` (shuffle
      indices, add-immutables-until-solvable then remove-redundant),
      `generateDesc` — RNG call order verbatim (D8).
- [x] 3.3 C trace harness `puzzles/auxiliary/signpost-trace.c` (+ CMake
      line); built pure-C (`USE_TS_RANDOM=0`); recorded 10 fixtures (6
      presets + 4 non-preset sizes) to `__fixtures__/`.
- [x] 3.4 Gated differential `signpost-differential.test.ts` via
      `describeDescDifferential` — **byte-match green on all 10 fixtures,
      first run**.
- [x] 3.5 Tier-1 solver tests: generated boards uniquely solvable across
      presets; `solve()` recovers the chain from a dirty mid-game state.

## 4. Game glue + rendering

- [x] 4.1 `index.ts` + `moves.ts`: `interpretMove` (mouse drag-to-link both
      directions, off-grid unlink, keyboard cursor + select/select2
      from/to, `x`/`X` unlink), `executeMove` (link/unlink/solve, error +
      completion recompute), `solve()`, `findMistakes` (D4), `prefs`
      (`flash-type`), `paramConfig` + `describeParams` (D7), text format,
      flash length.
- [x] 4.2 `render.ts`: palette index-for-index incl. the four 16-entry
      ramps (D6), per-cell diff cache (`cache`/`nums`/`dirp`) with the
      findMistakes overlay folded into the per-frame flags word (in the
      diff key by construction), tile draw (background gradient, arrow /
      final-cell star, number styling, predecessor dot, error red, cursor
      corners), blitter drag sprite + in-progress-drag preview, spin
      win-flash (both pref modes), first-draw background + grid frame.
- [x] 4.3 Tier-1 input/`executeMove` tests; tier-2.5 render scenario +
      snapshot (opener frame; mistake overlay recolours a number red).
- [x] 4.4 Icons: n/a (signpost already has committed icons from the C
      build).

## 5. Stage 1 — register + verify

- [x] 5.1 Register in `ts-ported-ids.ts` + `games/index.ts`;
      `augmentation.test.ts` + registration guards green.
- [x] 5.2 Full gate green (`tsc`, `biome lint`, `vitest run` 2176, `vite build`).
- [x] 5.3 Dev-server Playwright smoke on the TS path (dev-verified
      2026-07-05): TS badge served; drag-to-link both a numbered region
      (1→2, arrow dims, predecessor dot clears) and two blank cells (salmon
      coloured region with "a"/"a+1" spreadsheet naming); the final cell
      renders as a star; Check & Save refused a wrong link with the
      offending cell recoloured red ("1 mistake found"); Solve filled the
      full chain + fired the completion dialog; game menu (Solve /
      Check & save / Preferences / …) renders; **0 console errors**.
- [x] 5.4 Owner smoke-test / acceptance pass. **Accepted 2026-07-05** (hint
      deferred to a later `add-signpost-hint` change).

## 6. Stage 2 — on owner acceptance only

- [x] 6.1 `TS_PORTED` in `puzzles/CMakeLists.txt`, deleted
      `puzzles/signpost.c` + `puzzles/auxiliary/signpost-trace.c` (+ its
      CMake line); `rm -rf build/wasm` + rebuilt; signpost in catalog, no
      wasm. No shared C leaf deleted (`dsf` is TS-only).
- [x] 6.2 Updated `docs/porting/game-port-playbook.md` (moves.ts cycle-break
      + blitter-drag 2nd exemplar §3.2; display-only-sort byte-match note
      §4.3); archived this change in the same commit.
