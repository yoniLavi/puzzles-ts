# Tasks — add-clusters-ts-port

## 1. Scaffold and survey

- [x] 1.1 `scripts/new-game-port.sh clusters` to stamp `src/native/games/clusters/`
      with typed `Game<…>` stubs; read `galaxies/` (grid-shading exemplar) and a
      paint-drag exemplar (`lightup/`, `range/`) end-to-end first.
- [x] 1.2 Confirm the long-tail-risk checklist is clean (design intro): no
      `supersededDesc`, no state-string undo, no `#ifdef EDITOR` letters, no print
      promise, self-contained (no leaf deps). Record anything surprising in `design.md`.

## 2. Params, state and desc codec

- [x] 2.1 `ClustersParams { w, h }`; `encodeParams`/`decodeParams` (`%dx%d`, with
      `h = w` fallback on a bare number — via the shared dimension parser).
- [x] 2.2 `validateParams` in upstream order: `w*h < 10000` ("Puzzle is too
      large") → `w*h < 2` ("Puzzle is too small").
- [x] 2.3 `paramConfig` (Width, Height) — keys matching the C config slugs
      (playbook §3.4); numeric `set` via `parseConfigInt`.
- [x] 2.4 Presets — the four upstream presets (`7×7`, `8×8`, `9×9`, `10×10`);
      `describeParams` emits the keys `augmentation.ts` reads (playbook §3.4).
- [x] 2.5 State: the grid as a `Uint8Array` of the cell flag byte
      (`F_COLOR_0` / `F_COLOR_1` / `F_SINGLE`), plus `completed` / `cheated`.
      Transient error/cursor render flags stay off persisted state (D5/D7).
      `cloneState` is a typed-array copy (design D1).
- [x] 2.6 Desc codec (design D1): the run-length dot encoding — `a`–`y` red dot,
      `A`–`Y` blue dot, `z`/`Z` a 25-cell skip; positions accumulate to `w*h + 1`.
      Port `new_game_desc`'s encode and `new_game`'s decode as exact inverses
      (byte-match surface). Preserve the lowercase-red / uppercase-blue asymmetry.
- [x] 2.7 `validateDesc`: reject accumulated position `< s+1` ("too short") vs
      `> s+1` ("too long") distinctly, and any character outside `a`–`z`/`A`–`Z`.

## 3. The contradiction solver (design D2)

- [x] 3.1 `clustersValidate(state)` → discriminated `COMPLETE | UNFINISHED |
      INVALID` (not the C's `-1/0/1`), returning the set of offending cell indices
      for reuse by `findMistakes` (D5). Port the three error rules and the
      neighbour-count helper faithfully.
- [x] 3.2 `solverTry` (single-cell forced-colour by contradiction) and
      `solverRecurse` (depth-1 lookahead re-running `solveGame` at diff 0 on a
      scratch copy). `solveGame(state, maxdiff, temp)` loops to a fixpoint.
- [x] 3.3 Record in `solver.ts`'s module doc that the solver is contradiction-based
      deduction + one lookahead level (a deterministic proof procedure, not
      guess-and-backtrack), and that Clusters exposes no difficulty tiers (design D2).
- [x] 3.4 Tier-1 tests: a hand-built board solves to a known unique fill;
      `clustersValidate` classifies complete / unfinished / invalid boards; the
      forced-colour rule fires on a one-move-forced cell.

## 4. The generator (design D3)

- [x] 4.1 `clustersGenerate(state, temp, rng, force)`: per-cell two-colour fill,
      the flip-isolated-cells `break`-and-restart loop (cells with zero same-colour
      neighbours), reduce to `F_SINGLE` dot clues (count == 1) clearing the rest,
      prune adjacent equal dot pairs in scan order, then `solveGame(state, 1, temp)`.
      Port the scan orders and the `break` verbatim (byte-match surface).
- [x] 4.2 `newDesc`: loop `clustersGenerate` until `COMPLETE`, forcing a full
      re-randomise every `MAX_ATTEMPTS = 100` attempts (`force = attempts % 100 ==
      0`); then emit the run-length desc. No `aux` (Solve re-runs the solver —
      playbook §3.6).
- [x] 4.3 Tier-1: every preset and a small size sweep generate a board whose desc
      decodes to a state the TS solver completes to a unique fill.

## 5. Moves, input and completion

- [x] 5.1 Move model: the `ClustersMove` discriminated union
      (`{ kind: "paint"; cells } | { kind: "solve"; grid }`), not a move string
      (design D4).
- [x] 5.2 `interpretMove` mouse paint-drag (design D9): `LEFT_BUTTON` cycles the
      drag colour empty→blue→red→clear, `RIGHT_BUTTON` empty→red→blue→clear; `*_DRAG`
      accretes cells onto the ephemeral `Ui` drag set (skipping givens and
      already-drag-colour cells); `*_RELEASE` emits one `paint` move for the
      non-given cells, else `UI_UPDATE`. Convert with the shared `fromCoord`
      (`BORDER` offset, D7).
- [x] 5.3 `interpretMove` keyboard (design D9): arrows move the cursor
      (`UI_UPDATE`); Enter=blue, Space=red, `0`/`2`=red, `1`=blue, backspace=clear,
      each suppressed to a no-op when it would not change the cell or targets a
      given; shift/ctrl-arrow paint while moving.
- [x] 5.4 `executeMove`: apply each cell edit (**never** overwriting an
      `F_SINGLE` given, in both the paint and solve paths); set `completed` when
      `clustersValidate` returns `COMPLETE`; `solve` sets `cheated`. State rebuilt
      immutably.
- [x] 5.5 `solve()` returns `{ kind: "solve", grid }` from a fresh
      `solveGame(dup, 1, …)`; error "Puzzle is invalid." if the solver leaves it
      `INVALID`. Test Solve **through a real `Midend`** (playbook §3.6).
- [x] 5.6 `findMistakes` (design D5): return the `clustersValidate` `INVALID` cell
      set; record why (local rule checker over re-solve) in `index.ts`. Unit-test the
      set + the midend overlay lifecycle (cleared on every transition).
- [x] 5.7 `textFormat` — the board text (`r`/`b`/`.`, uppercase for givens);
      `canFormatAsText` static `true` (design D8).

## 6. Rendering (design D7)

- [x] 6.1 Palette in C enum order (`BACKGROUND, GRID, COL_0, COL_1, COL_0_DOT,
      COL_1_DOT, ERROR, CURSOR`). Derive background from the app; do **not**
      luminance-adjust for dark mode (the app owns it — playbook §3.3).
- [x] 6.2 `computeSize`/`setTileSize`: the **`NARROW_BORDERS`** arm —
      `BORDER = tilesize/10`, `computeSize = w*tilesize + 2*BORDER − 1` by
      `h*tilesize + 2*BORDER − 1` (design D7, playbook §3.2). Checked, not assumed.
- [x] 6.3 `redraw`: per-tile rendering (grid rect + colour rect, dot circle, error
      outline, cursor frame) packed into an `Int32Array` cache key including the
      drag recolour, error, cursor and flash bits (playbook §3.2) — every overlay in
      the diff key or it won't repaint.
- [x] 6.4 The completion flash over `FLASH_TIME = 0.3 s` inverting both colours on
      even half-frames; no move animation (`animLength` = 0 — design D7).
- [x] 6.5 Tier-2.5 render-scenario tests + snapshots: a fresh board (dots drawn), a
      mid-paint drag frame, a `findMistakes` error-outline frame, and a completion-
      flash frame.

## 7. Differential (design D6)

- [x] 7.1 `puzzles/auxiliary/clusters-trace.c`
      (`#include "../unreleased/clusters.c"`) on the established pattern; add its
      `cliprogram()` line. Dumps the generated desc for `(w, h, seed)` tuples.
- [x] 7.2 Fixture matrix: every preset plus a size sweep, each seed dumping the
      generated desc.
- [x] 7.3 `clusters-differential.test.ts`: TS `newDesc` reproduces the C desc
      byte-for-byte for each fixture (validates generator + solver + codec at once).

## 8. Registration and stage 1 close-out

- [x] 8.1 Register in `ts-ported-ids.ts` + `games/index.ts` (TS-served).
      `puzzles/unreleased/clusters.c` stays as the C/WASM fallback — stage-2 gate.
- [x] 8.2 Behavioural tests: codec round-trip, solver classification + forced-colour
      rule, generator determinism, move/paint transitions, `findMistakes`, win
      condition, midend lifecycle + save round-trip.
- [x] 8.3 Full gate green (`tsc -b --noEmit` → biome → `vitest run` →
      `vite build`).
- [x] 8.4 `openspec validate add-clusters-ts-port --strict`.
- [x] 8.5 Dev-verify in the browser: paint-drag (both colours, cycling), keyboard
      cursor + place keys, Solve, completion flash, Check & Save mistake highlight,
      Custom params. 0 console errors.
- [x] 8.6 Update `docs/porting/game-port-playbook.md` if the paint-drag input or the
      dot-clue codec surfaced anything the guide didn't cover.

## 9. Stage 2 — on owner acceptance only (design D10)

- [ ] 9.1 Add `TS_PORTED` to the `puzzle(clusters …)` block in
      `puzzles/unreleased/CMakeLists.txt` (keeps catalog metadata, stops building
      `clusters.wasm`).
- [ ] 9.2 Delete `puzzles/unreleased/clusters.c` and the `clusters-trace` harness
      (and its `cliprogram()` line).
- [ ] 9.3 `rm -rf build/wasm/` and rebuild — clusters in the catalog, no
      `clusters.wasm` (the playbook §1.1 stale-cache gotcha). Icons already exist.
- [ ] 9.4 Archive, then commit port + archive together.
