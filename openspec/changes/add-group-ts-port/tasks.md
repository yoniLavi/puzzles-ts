# Tasks — add-group-ts-port

## 1. Before you start: survey and long-tail-risk check

- [ ] 1.1 Re-read `puzzles/unfinished/group.c` against the playbook §1 long-tail
      checklist. Confirmed findings to carry: no `supersededDesc` need, no
      state-string-equality undo, no `#ifdef EDITOR` move letters. Group **does**
      use `REQUIRE_RBUTTON | REQUIRE_NUMPAD` (right-click pencil, letter keypad) —
      no stylus modifier (unlike Loopy).
- [ ] 1.2 Confirm `src/native/engine/latin.ts` exposes everything the two Group
      user-solvers need (`o`, `grid`, `place`, public `cube` + `cubepos`/`cubeGet`)
      — design D1. It does; no `latin.ts` change is expected. If one turns out to
      be needed, that is a real finding to record, not to paper over.

## 2. Params, group data, state and desc codec

- [ ] 2.1 `GroupParams { w, diff, id }`, `default_params` (`6`, Normal, id=true),
      `encodeParams`/`decodeParams` (`%d` + `d%c` diff char + `i` for
      identity-hidden; note `decodeParams` resets `diff`/`id` to defaults up front).
- [ ] 2.2 `validateParams` in upstream's order: `3 ≤ w ≤ 26` → known difficulty →
      **`!id && diff == TRIVIAL`** rejected → **`!id && w == 3`** rejected. Carry
      both reasons as comments (design D3).
- [ ] 2.3 Difficulty table `{ id, title, char }` for Trivial/Normal/Hard/Extreme/
      Unreasonable (`t`/`n`/`h`/`x`/`u`), and `paramConfig` (grid size, difficulty
      choices, "Show identity" boolean).
- [ ] 2.4 Presets: the seven upstream presets (`6 N id`, `6 N`, `8 N id`, `8 N`,
      `8 H id`, `8 H`, `12 N id`) with the `"…, identity hidden"` label suffix.
- [ ] 2.5 The element-numbering remap as pure helpers `toChar(n, id)` /
      `fromChar(c, id)` (design D3: `E_TO_FRONT`/`E_FROM_FRONT`). Used by the
      solution aux string, keyboard input, request-keys and rendering — **not** by
      the grid desc.
- [ ] 2.6 State: `grid` (`Uint8Array`, 0 = blank), `pencil` (bitmap per cell),
      `immutable` mask, `sequence` (display order), `dividers`, `completed`,
      `cheated`. Immutable set from the givens in `newGame`.
- [ ] 2.7 Desc codec (design D10): **decimal** clue numbers, `a`–`z` runs of 1–26
      blanks, `_` separator with the corner-nicety, `run > 26` split. Port
      `encode_grid` / `spec_to_grid` / `validate_grid_desc` verbatim; `validateDesc`
      distinguishes "not enough data" from "too much".

## 3. The solver (over `latin.ts`)

- [ ] 3.1 Wire `latinSolver` with the difficulty mapping of design D1
      (`diffSimple=0`, `diffSet0=2`, `diffSet1=3`, `diffForcing=3`,
      `diffRecursive=4`; `usersolvers=[null, solverNormal, solverHard, null, null]`;
      `valid=groupValid`). Keep the `DIFF_IMPOSSIBLE`/`DIFF_AMBIGUOUS` sentinel
      comparisons (`ret <= diff`, `ret != diff`) byte-identical.
- [ ] 3.2 `solverNormal` (Normal): associativity forward-deduction — for any
      `a,b,c` with `ab`, `bc`, `(ab)c` known, place `a(bc)` (and the symmetric
      case), via `solver.place`; report contradiction if the cube forbids it. Then
      the identity row/column fill driven by `findIdentity`.
- [ ] 3.3 `findIdentity` helper — scan for a filled cell equal to its row or column
      index, which names the identity.
- [ ] 3.4 `solverHard` (Hard, identity-hidden reasoning): any filled `ab` that is
      neither `a` nor `b` proves neither `a` nor `b` is the identity, so rule out
      `ij=j` / `ji=j` candidates directly on the cube. Return "did something".
- [ ] 3.5 `groupValid` — associativity of the completed grid (`(ab)c == a(bc)` for
      all `a,b,c`); the generic Latin layers cover Latin-square-hood.
- [ ] 3.6 Cache-parity sanity: with recording off, the solver path stays
      byte-for-byte the generic `latinSolver` path (no accidental recorder/budget
      wiring on generate/solve).

## 4. The generator

- [ ] 4.1 The group data table (`groupdata` + `groups`) as static `as const` TS,
      transcribed verbatim from `group.gap` output (design D2). Optionally verify
      once by dumping `groupdata` from `group-trace.c`.
- [ ] 4.2 `newGameDesc`: the difficulty-downgrade exceptions first (`w<5` drops
      Unreasonable; the `w`/`id` conditions dropping Extreme/Hard/Normal — port the
      four `if` guards exactly, they change which puzzles generate), then the
      generate loop.
- [ ] 4.3 Build a canonical table: pick a group by order `w`, BFS-decompress its
      generators into the full Cayley table, then shuffle rows/columns — fixing
      element 1 in place iff `id` (design D3).
- [ ] 4.4 Identity-hidden extra blanking: blank the identity row/column **and** one
      random other row/column, then reject-and-retry if that board no longer grades
      at `diff`.
- [ ] 4.5 `removeClues`: shuffle the eligible cell indices, blank each while the
      board stays solvable at `diff`.
- [ ] 4.6 Too-easy rejection: if `diff > 0` and the board is solvable at `diff-1`,
      restart the whole generate loop.
- [ ] 4.7 Emit the desc and the solution aux string (`S` + `toChar` of every cell).

## 5. Input, moves, completion and visual aids

- [ ] 5.1 Move model: the discriminated union of design D6
      (`set` / `pencil` / `solve` / `reorder` / `divider`); **drop** upstream's `M`
      diagnostic move (record the omission).
- [ ] 5.2 `interpretMove`: `FROMCOORD` conversion, left/right-click cell selection,
      the `hshow`/`hpencil`/`hcursor` highlight bookkeeping, letter/number entry
      through `fromChar`, and backspace/clear. Keyboard cursor via `move_cursor`
      mapped through `sequence`.
- [ ] 5.3 The diagonal **multifill** selection (drag from a highlighted cell along a
      diagonal, `odx/ody/odn`) and its multi-cell `set`/`pencil` emission, including
      the "setting an immutable cell to what it already holds is allowed" nicety.
- [ ] 5.4 The **row/column reorder** aid: header-drag detection (`ty == -1` /
      `tx == -1`), `dragnum`/`dragpos`/`edgepos` tracking, and the `reorder` move;
      `executeMove` rebuilds `sequence` and clears obsoleted dividers (design D5).
- [ ] 5.5 The **divider** aid: the `divider` move toggling `dividers[i]`, and its
      auto-clear when a drag separates the two elements it sat between.
- [ ] 5.6 `executeMove` for each op (absolute set, idempotent), then completion:
      `checkErrors(state) == false` ⇒ `completed`. `gameChangedState` highlight
      fix-ups (cancel pencil highlight on a now-filled cell; move/cancel the
      selection when `sequence` reorders under it).
- [ ] 5.7 `findMistakes` by re-solve from the immutable givens (design D7) — Group
      is uniquely solvable, so Check & Save applies. Keep `checkErrors`'s
      Latin+associativity overlay for render-time error display.
- [ ] 5.8 Prefs: `pencil-keep-highlight` (boolean, default false) through the
      `prefs` hook.
- [ ] 5.9 `textFormat` (square grid of `toChar`/`.`) and the config-summary header.

## 6. Rendering

- [ ] 6.1 Palette in C enum order (`BACKGROUND, GRID, USER, HIGHLIGHT, ERROR,
      PENCIL, DIAGONAL`), derived from the background as upstream does; render
      cache keyed on `Int32Array` (playbook §3.2), every overlay in the diff key.
- [ ] 6.2 `computeSize`/`setTileSize` over the `LEGEND` + `BORDER` geometry
      (`SIZE(w) = w·TILESIZE + 2·BORDER + LEGEND + GRIDEXTRA + 1`); use the arm this
      fork compiles for `BORDER` (check `NARROW_BORDERS` as Loopy did — verify, do
      not assume).
- [ ] 6.3 `redraw`: the legend row/column (element names through `sequence`), the
      Cayley cells, `x == y` diagonal shading, the four divider edges, pencil-mark
      grid layout, selection/multifill highlight, and the drag-in-progress modified
      `sequence`.
- [ ] 6.4 Error rendering: `EF_LATIN` red digits for row/column duplicates and the
      small `(ab)c` / `a(bc)` associativity-failure annotations (design D7 keeps
      `checkErrors` as the render overlay).
- [ ] 6.5 The completion flash over `FLASH_TIME` (the three-segment blink).
- [ ] 6.6 Tier-2.5 render-scenario tests + snapshots: a mid-play board with pencil
      marks, a divider, a reordered `sequence`, an error annotation, and the
      completion flash frame.

## 7. Differential

- [ ] 7.1 `puzzles/auxiliary/group-trace.c` on the established pattern; add its
      `cliprogram()` line to `puzzles/unfinished/CMakeLists.txt` (or the auxiliary
      list, matching where trace harnesses live).
- [ ] 7.2 Fixture matrix (design D8): small/mid/large `w`, **both** identity modes,
      every difficulty each size admits — accounting for `new_game_desc`'s
      difficulty-downgrade exceptions.
- [ ] 7.3 `group-differential.test.ts`: TS `newDesc` reproduces the C desc
      byte-for-byte **and** the TS solver grades every C board at exactly the
      recorded difficulty.

## 8. Registration and stage-1 close-out

- [ ] 8.1 Register in `ts-ported-ids.ts` + `games/index.ts` (TS-served).
      `puzzles/unfinished/group.c` stays — stage-2 gate.
- [ ] 8.2 Behavioural tests: params/desc round-trip, solver grades generated
      boards, generator produces uniquely-solvable boards at target difficulty,
      move transitions (multifill, reorder, divider), `findMistakes`.
- [ ] 8.3 Full gate green (`tsc -b --noEmit` → biome → `vitest run` →
      `vite build`).
- [ ] 8.4 `openspec validate add-group-ts-port --strict`.
- [ ] 8.5 **Dev-verify in the browser**: play a `6` identity-shown and a
      `8` identity-hidden board; exercise pencil marks, a diagonal multifill, a
      header reorder, a divider, Check & Save, and the completion flash.
- [ ] 8.6 Update `docs/porting/game-port-playbook.md` with anything the guide
      didn't tell you (the `latin.ts`-reuse shape, the reorder/divider aid pattern).

## 9. Stage 2 — on owner acceptance only (and the D9 catalog decision)

- [ ] 9.1 **Owner decision (design D9): does Group join the main catalog?** Full
      citizen (recommended), registered-but-unlisted, or defer. Do not flip the
      catalog until this is settled.
- [ ] 9.2 On "full citizen": add `puzzle(group … TS_PORTED)` to the main
      `puzzles/CMakeLists.txt` (the `separate` precedent — catalog metadata, no
      `group.c`/wasm), and remove the `puzzle(group …)` + `solver(group …)` entry
      from `puzzles/unfinished/CMakeLists.txt`.
- [ ] 9.3 Delete `puzzles/unfinished/group.c` (and `group.gap` if it no longer has
      a consumer) and the `group-trace` harness's build line once the differential
      fixtures are frozen.
- [ ] 9.4 `rm -rf build/wasm/` and rebuild — group in the catalog (if flipped), no
      `group.wasm`. Icons already exist (`group-{64,128}d8.png`). Verify.
- [ ] 9.5 Archive, then commit port + archive together.
