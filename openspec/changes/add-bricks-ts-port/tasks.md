# Tasks — add-bricks-ts-port

## 1. Scaffold and survey

- [ ] 1.1 `scripts/new-game-port.sh bricks` to stamp `src/native/games/bricks/`
      with typed `Game<…>` stubs; read `galaxies/` (idiomatic exemplar) and a
      logic-puzzle port (`singles/`, `mosaic/`) end-to-end first.
- [ ] 1.2 Confirm the long-tail-risk checklist is clean (design intro): no
      `supersededDesc`, no state-string undo, no `#ifdef EDITOR` letters, no print
      promise. Record it in `design.md` if anything surprises.

## 2. Params, hex geometry, state and desc codec

- [ ] 2.1 `BricksParams { w, h, diff }` (`diff` = Easy/Normal/Tricky);
      `encodeParams`/`decodeParams` (`%dx%d` then `d<char>` for difficulty;
      `decodeParams` reads a single `w` when there is no `x`, matching upstream).
- [ ] 2.2 `validateParams`: `w ≥ 2`, `h ≥ 2`, `diff < DIFFCOUNT`.
- [ ] 2.3 `paramConfig` (Width, Height, Difficulty choices) with keys matching the C
      config slugs (playbook §3.4); numeric `set` via `parseConfigInt`, difficulty
      as a choice list.
- [ ] 2.4 Presets — the six upstream presets (`7×6` and `10×8` × Easy/Normal/Tricky);
      `describeParams` emits the keys `augmentation.ts` reads (playbook §3.4).
- [ ] 2.5 Hex geometry helpers (design D2): `gridSize(params)` →
      `w = params.w + ⌈h/2⌉ − 1`, `applyBounds` (the two-corner `F_BOUND` mask), the
      fixed six-step neighbour table. Port both verbatim — they gate cell count and
      neighbour counts.
- [ ] 2.6 State: immutable `grid` (packed `Uint8Array`/`Uint16Array` cell field —
      `NUM_MASK`/`F_BOUND`/`COL_MASK`/`FE_*`), `w`/`h`/`pw`, `completed`, `cheated`;
      `cloneState` copies the grid (§3.1). Expose play value (shade/unshade/empty/
      number/bound) as a clean shape at the boundaries.
- [ ] 2.7 Desc codec (design D5): decimal-digit numbers with `_` separator between
      adjacent numbers, run-length `a`–`z` for playable cells, bounds implicit. Port
      `new_game`'s decode and `new_game_desc`'s tail encode as exact inverses —
      byte-match surface.
- [ ] 2.8 `validateDesc`: reject too-many/too-few decoded cells (distinguishing
      which) and a clue `> 7`; bounds skipped against the geometry mask.

## 3. The solver (contradiction + bounded lookahead)

- [ ] 3.1 `validate(grid, strict)` → discriminated `COMPLETE | UNFINISHED | INVALID`
      with localised error flags, composed from the three checks: no-three-in-a-row,
      gravity/support, neighbour counts (design D3). Keep the deduction identical to
      C; idiomatic result type, not `char` status folding.
- [ ] 3.2 `solverTry` (single-cell contradiction = Easy) and `solverRecurse` (bounded
      lookahead for Normal/Tricky), driven to a fixpoint by `solveGame(maxdiff, clear,
      strict)`. Record the preserved min-difficulty quirk in `solver.ts` (D3).
- [ ] 3.3 Tier-1 tests: a hand-built board solves to the unique solution; an
      over-constrained board reports `INVALID`; Easy stops where Normal continues.

## 4. The generator

- [ ] 4.1 `fillGrid` (bottom-up shade/unshade under gravity + no-three-run +
      `random_upto(rs,3)`), `buildNumbers`, the EASY-solve ambiguity pass +
      re-number, and the `MINIMUM_SHADED (0.4)` regenerate gate (design D4).
- [ ] 4.2 `removeNumbers`: one `shuffle` of cell order, blank each numbered cell
      keeping it only while the puzzle stays uniquely solvable at the target
      difficulty; then the min-difficulty regenerate gate. RNG order verbatim
      (byte-match surface).
- [ ] 4.3 `newDesc` emitting the run-length desc; no `aux` (the solver re-derives the
      solution from the desc, playbook §3.6).
- [ ] 4.4 Tier-1: every preset and a small size sweep generate a board that solves to
      `COMPLETE` and round-trips through the codec.

## 5. Input, moves and completion

- [ ] 5.1 `BricksMove` discriminated union (`{ kind: "paint"; cells } | { kind:
      "solve"; grid }`), not a move string (design D6).
- [ ] 5.2 `interpretMove` paint phases (design D6): grab (colour cycle by
      left/right button), drag (accumulate playable cells on the ephemeral `Ui`,
      `UI_UPDATE`), release (emit one `paint` over the run, else `UI_UPDATE`).
      Convert the pointer by undoing the per-row `tilesize/2` shear then flooring
      (shared `fromCoord`). Suppress no-ops locally (`null`).
- [ ] 5.3 Keyboard cursor (design D6): hex-aware up/down (orthogonal↔diagonal
      alternation), numpad `1/3/7/9` diagonals **and** bare digits (playbook §3.8a),
      cursor clamp to the hexagon; `Enter`/`Space`/`0`/`1`/`2` set the cell colour.
- [ ] 5.4 `executeMove`: apply each painted cell (only where playable), set
      `completed` when `validate(strict) == COMPLETE`; `solve` move sets the whole
      board and `cheated`. Undo/redo is the midend's — no special state.
- [ ] 5.5 `solve()` returns `{ kind: "solve", grid }` from a fresh
      `solveGame(TRICKY, clear, strict=false)`; error if the board is invalid. Test
      Solve through a real `Midend`.
- [ ] 5.6 `textFormat` — the ASCII board (`board_text_format`); `canFormatAsText`
      static `true` (design D9). No statusbar (`wants_statusbar` false).

## 6. `findMistakes`

- [ ] 6.1 `findMistakes(state)` runs the D3 validity pass and returns the offending
      cells (three-in-a-row, gravity, over-count), reusing the error flags; declare
      `canFindMistakes` (design D7). Tier-1 test: a wrong-but-legal grid flags the
      right cells; a correct partial grid flags none.

## 7. Rendering

- [ ] 7.1 Palette in C enum order (`COL_MIDLIGHT`/`COL_LOWLIGHT`/`COL_HIGHLIGHT` via
      `mkhighlight`, plus `COL_BORDER`/`COL_SHADE`/`COL_ERROR`/`COL_CURSOR`). Derive
      from the app background; do **not** luminance-adjust for dark mode (playbook
      §3.3 — the app owns it).
- [ ] 7.2 `computeSize`/`setTileSize`: the sheared-hex size (`params.w*ts + ts/2`
      wide, `params.h*ts` tall, `BORDER = 0` under `NARROW_BORDERS` — checked, not
      assumed) and the row offsets (`game_set_offsets`).
- [ ] 7.3 `redraw`: per-cell rendering with the per-row `tilesize/2` shear, square
      bevel/border, numbers (`?` for clue 7), shaded fill, packed into an
      `Int32Array` cache key (playbook §3.2). Every drag-preview/cursor/flash state
      in the diff key or it won't repaint.
- [ ] 7.4 Live rule-violation overlay (design D7): the three-in-a-row bar
      (`draw_err_rectangle`), the gravity diamonds (`draw_err_gravity`), over-count
      number recolour, and the cursor corners — driven by the D3 validity pass over
      the drag-preview grid, shared with `findMistakes`. Split shared paint/validate
      helpers into `moves.ts` if `render` importing `index` would cycle (§3.2).
- [ ] 7.5 The completion flash over `FLASH_TIME` (five `FLASH_FRAME` intervals,
      shaded cells blink to empty). No slide/interpolation animation (`animLength`
      is `0`).
- [ ] 7.6 Tier-2.5 render-scenario tests + snapshots: a numbered board, a shaded-run
      frame, a three-in-a-row error frame, and a completion-flash frame.

## 8. Differential

- [ ] 8.1 `puzzles/auxiliary/bricks-trace.c` on the established pattern; add its
      `cliprogram()` line.
- [ ] 8.2 Fixture matrix: every preset plus a size sweep (design D8), each seed
      dumping the generated desc.
- [ ] 8.3 `bricks-differential.test.ts`: TS `newDesc` reproduces the C desc
      byte-for-byte for each fixture; plus a tier-1 round-trip + fresh-solve to
      `COMPLETE` of each C board.

## 9. Registration and stage 1 close-out

- [ ] 9.1 Register in `ts-ported-ids.ts` + `games/index.ts` (TS-served). The C/WASM
      build stays as the in-app fallback — stage-2 gate.
- [ ] 9.2 Full gate green (`tsc -b --noEmit` → biome → `vitest run` → `vite build`).
- [ ] 9.3 `openspec validate add-bricks-ts-port --strict`.
- [ ] 9.4 Dev-verify in the browser: paint (click + drag, both buttons), keyboard
      cursor across rows, live errors, Check & Save hard-block on a mistake, Solve,
      completion flash, Custom params.
- [ ] 9.5 Update `docs/porting/game-port-playbook.md` (the bespoke hex-shear geometry
      + coordinate conversion, live-error-plus-findMistakes sharing one validity
      pass).

## 10. Stage 2 — on owner acceptance only

- [ ] 10.1 Add `TS_PORTED` to the `puzzle(bricks …)` entry in
      `puzzles/unreleased/CMakeLists.txt` (and drop `solver(bricks)`).
- [ ] 10.2 Delete `puzzles/unreleased/bricks.c`.
- [ ] 10.3 `rm -rf build/wasm/` and rebuild — bricks in the catalog, no `bricks.wasm`
      (the playbook §1.1 cache gotcha). Icons already exist.
- [ ] 10.4 Archive, then commit port + archive together.
