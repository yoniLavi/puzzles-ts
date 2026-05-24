# Tasks: add-galaxies-ts-port

## 1. DSF leaf port (D1)

- [ ] 1.1 `src/native/games/galaxies/dsf.ts`: idiomatic `Dsf` class
      with `new Dsf(n)`, `reinit()`, `canonify(i)`, `merge(a, b)`.
      Path compression + union-by-size. ~30 lines.
- [ ] 1.2 Property tests
      `src/native/games/galaxies/dsf.test.ts`: against a brute-force
      reference (parent-array follow-to-root); random sequences of
      `merge`/`canonify`; `reinit()` returns the structure to
      `n` singletons; equivalence-class invariant holds after
      arbitrary interleavings.

## 2. Galaxies types, params, presets (D2, D3)

- [ ] 2.1 `src/native/games/galaxies/index.ts`: types
      `GalaxiesParams { w, h, diff }`, `GalaxiesDiff` enum
      (`NORMAL` / `UNREASONABLE`, plus solver-diagnosis
      `IMPOSSIBLE` / `AMBIGUOUS` / `UNFINISHED`), the discriminated
      `GalaxiesMove` (`edge` / `assoc` / `unassoc` / `hold` /
      `solve`), `GalaxiesUi` (keyboard cursor + held-dot indicator),
      `GalaxiesDrawState`, and `GalaxiesState` (flat typed arrays
      per D2, frozen wrapper).
- [ ] 2.2 `defaultParams`, the 6 upstream presets (7×7, 10×10, 15×15
      × Normal/Unreasonable), `encodeParams`/`decodeParams`/
      `validateParams` matching upstream's lenient `"7"` / `"7x7"` /
      `"7x7dn"` / `"7x7du"`.
- [ ] 2.3 State helpers: `getFlags(s, x, y)`,
      `setFlags(...)` (mutates a working buffer during a transition),
      `inGrid`/`inUi`, `isVerticalEdge`, dot-list maintenance, the
      "freeze working buffer into a new state" path used by
      `executeMove`.
- [ ] 2.4 Round-trip tests: encode/decode params; encode/decode game
      `desc` (the bitmap of dot positions in upstream's format).

## 3. Solver (D6)

- [ ] 3.1 `solver_obvious` and `solver_obvious_dot`: tile adjacent
      to a dot is associated with it; tile-opposite-of-an-associated
      tile is the opposite-through-the-dot association.
- [ ] 3.2 `lines_opposite_cb`: if an edge is set, its
      180°-opposite edge through the relevant dot is also set
      (and vice versa for "must not be set").
- [ ] 3.3 `spaces_oneposs_cb`: if a tile has only one feasible dot
      assignment given current constraints, assign it.
- [ ] 3.4 `expand_dots` (uses DSF): grow each dot's known region by
      one tile in each direction where it is the only feasible
      assignment; the post-callback finalises.
- [ ] 3.5 `extend_exclaves`: handle the "exclave" case where a
      single dot's region has been split by edges.
- [ ] 3.6 `solver_recurse` (UNREASONABLE only): bounded recursion
      picking an unassigned tile and trying each feasible dot
      assignment; diagnoses `AMBIGUOUS` when more than one assignment
      completes consistently.
- [ ] 3.7 Top-level `solver_state(state, maxDiff)`: returns
      `NORMAL` / `UNREASONABLE` / `AMBIGUOUS` / `IMPOSSIBLE` /
      `UNFINISHED` matching upstream's contract.
- [ ] 3.8 Solver behavioural tests: hand-crafted positions for each
      diagnosis (Normal-solvable, Unreasonable-only, Ambiguous,
      Impossible), assertion that the C-frozen snapshot's solver
      output matches per D7.

## 4. Generator (D6)

- [ ] 4.1 `newDesc(p, rng)`: structural port of upstream's
      `new_game_desc` — place dots, validate via solver at requested
      difficulty in the retry loop, emit the desc bitmap.
- [ ] 4.2 `validateDesc`: dimensions match params; bitmap charset
      and length; every claimed dot lies inside the grid.
- [ ] 4.3 Property tests: every preset generates a board whose
      solver diagnosis equals the requested difficulty; no
      `AMBIGUOUS`/`IMPOSSIBLE` ever returned to the caller.

## 5. State, UI, input (D4)

- [ ] 5.1 `newState(p, desc)`, `newUi(state)`, `newDrawState(state)`.
- [ ] 5.2 `interpretMove`: press on or near a dot ⇒ `hold`; drag
      while a dot is held ⇒ `assoc` per crossed tile; release ⇒
      `hold` toggle off. Click on an edge ⇒ `edge`. Click on an
      associated tile (no dot held) ⇒ `unassoc`. Keyboard cursor
      moves ⇒ `UI_UPDATE`. EDITOR-only move letters are NOT mapped
      from input (out of scope).
- [ ] 5.3 Immutable `executeMove`: copy typed arrays, mutate copy,
      freeze and return. Handle `edge`, `assoc` (with the
      `add_assoc_with_opposite` mirroring), `unassoc` (with the
      `remove_assoc_with_opposite` mirroring; `s`-mode skips the
      mirror, matching upstream's "solver doesn't assume we'll
      mirror" comment), `hold`, `solve`.
- [ ] 5.4 `status`: invokes `check_complete` (DSF-based
      partition-validity check); returns `solved` or `unsolved`.
      Combined with `usedSolve` ⇒ `solved-with-help` per upstream.
- [ ] 5.5 `solve(orig, curr, aux?)`: invokes the TS solver at
      UNREASONABLE; produces the move string applying the result;
      unsolvable ⇒ `{ ok: false, error }`.
- [ ] 5.6 Move/undo/redo + save round-trip tests through the
      `Midend` using the real Galaxies game; status transitions to
      `solved` and `solved-with-help`.

## 6. Rendering (D8)

- [ ] 6.1 `colours(defaultBackground)`: 9 colours (background,
      white-bg, black-bg, white-dot, black-dot, grid, edge, arrow,
      cursor), derived from `defaultBackground` per upstream.
- [ ] 6.2 `preferredTileSize`, `computeSize`, `setTileSize`.
- [ ] 6.3 `redraw(dr, ds, prev, s, dir, ui, animTime, flashTime)`:
      background fill in the `!ds.started` branch only; per-tile
      diff cache; dot-move animation interpolated along the
      `movedot_cb` path; win flash; keyboard cursor.
- [ ] 6.4 `animLength` / `flashLength` / `timingState`.
- [ ] 6.5 Recording-`GameDrawing` test: `redraw` only paints inside
      the cells whose state changed (no full-canvas wipe on every
      frame); the `!ds.started` first-draw paints exactly once.

## 7. Text format and statusbar

- [ ] 7.1 `textFormat(state)`: plain-text rendering matching
      upstream's `game_text_format`.
- [ ] 7.2 `statusbarText(state, ui)`: move count, solved /
      solved-with-help wording, current-puzzle difficulty when
      known.

## 8. Dev-time differential spot-check (D7)

- [ ] 8.1 `puzzles/auxiliary/galaxies-trace.c` (transient): emits
      `new_game_desc` and `solver_state` output for `w h diff seed`.
      Built via `scripts/build-native.sh galaxies-trace`. Header
      documents that the file is transient and is removed in the
      same change that deletes `galaxies.c`.
- [ ] 8.2 `scripts/diff-galaxies.test.ts` +
      `scripts/diff-galaxies.vitest.config.mts`: live advisory
      check, runs on demand
      (`npx vitest run --config scripts/diff-galaxies.vitest.config.mts`).
      Reports C-vs-TS divergence; asserts every TS-generated sample
      is uniquely solvable at the requested difficulty.
- [ ] 8.3 `src/native/games/galaxies/__fixtures__/
      galaxies-c-reference.json`: committed snapshot of N C-built
      boards across all 6 presets (~3 per preset). Generated once
      from the trace harness; committed.
- [ ] 8.4 `src/native/games/galaxies/galaxies-differential.test.ts`:
      gated, C-free; for every snapshot entry the TS port decodes
      the board and the solver returns a unique solution at exactly
      the snapshot's recorded difficulty.

## 9. Catalog seam and C deletion (parity-gated)

Doctrine (updated 2026-05-23, owner-explicit): **register the game as
soon as the automated suite is green so the owner can smoke-test the
TS path in `npm run dev`.** Marking `TS_PORTED` in CMake and deleting
`.c` files still wait on owner-confirmed parity. See memory note
`feedback_parity_gated_no_premature_done.md` (updated same day).

- [x] 9.1 `registerGame(galaxiesGame)` from the Galaxies module;
      module imported by `src/native/games/index.ts`.
- [ ] 9.2 Dev-server smoke test: `npm run dev`, exercise all 6
      presets for generation, drag-to-associate, edge toggle,
      undo/redo, keyboard cursor, solve, win flash, dot-move
      animation. Save/load round-trip through the UI.
- [ ] 9.3 Side-by-side feel check vs C build using
      `USE_TS_LEAVES=0` (paired with `VITE_USE_TS_LEAVES=0`) to flip
      to pure C on demand; surface any subjective regressions.
- [ ] 9.4 Owner-acceptance signal recorded (commit message or
      explicit conversation note). Do NOT proceed to 9.5/9.6
      without it. If parity is rejected, unregister (remove the
      import in `src/native/games/index.ts`) to restore the C
      fallback while fixes land.
- [ ] 9.5 `puzzles/CMakeLists.txt`: `puzzle(galaxies TS_PORTED …)`;
      catalog continues to list `galaxies`, no `galaxies.wasm`,
      app routes `galaxies` to the TS engine.
- [ ] 9.6 Delete `puzzles/galaxies.c`. Delete
      `puzzles/auxiliary/galaxies-trace.c` (transient; the gated
      frozen-snapshot test takes over its role).

## 10. Docs, validate, gate, archive

- [ ] 10.1 `AGENTS.md`: add a "What's been done" entry; mark
      migration-order item 3 landed.
- [ ] 10.2 `openspec validate add-galaxies-ts-port --strict` clean.
- [ ] 10.3 Full pre-commit gate green (`tsc -b` → biome →
      vitest → `vite build`), with `npm run build:wasm` assets
      present — verifying the all-other-games C/WASM path still
      builds with `galaxies.c` gone and `galaxies` served by TS.
- [ ] 10.4 Archive:
      `openspec archive add-galaxies-ts-port --yes`; update
      `openspec/specs/`.
