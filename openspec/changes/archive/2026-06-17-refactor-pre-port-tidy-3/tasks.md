# Tasks — Pre-port tidy #3

## 1. Modifier-mask constants → pointer.ts
- [x] 1.1 Add `MOD_MASK`, `MOD_NUM_KEYPAD`, `MOD_SHFT`, `MOD_CTRL`, and
  `stripModifiers(button)` to `src/native/engine/pointer.ts` with a doc comment
  citing the upstream bit layout.
- [x] 1.2 Add `pointer.test.ts` coverage for `stripModifiers` (strips each mask
  bit, leaves the base button and unrelated high bits intact).
- [x] 1.3 Replace the local `const MOD_MASK = 0x7800` (and any `MOD_*`) in all
  consuming games (cube, flood, palisade, samegame, mosaic, unruly, sixteen,
  fifteen, twiddle, range) with the import. (cube/twiddle keep their
  `~MOD_MASK | MOD_NUM_KEYPAD` expression — they preserve the numpad bit — so
  they import the constants but don't use `stripModifiers`.)
- [x] 1.4 `grep -rn 'MOD_MASK = 0x7800' src/native/games` returns nothing.

## 2. `parseDimensions` → params.ts
- [x] 2.1 Add `parseDimensions(s, start = 0): { w: number; h: number; next: number }`
  to `src/native/engine/params.ts` — parse int, optional `x`+int, square fallback
  when no `x`; `next` is the index past the consumed dims.
- [x] 2.2 Add `params.test.ts` cases: `"4x4"`, bare `"4"` (square), with trailing
  suffix (`"4x4m10"` → `next` points at `m`), and a leading offset (cube's letter).
- [x] 2.3 Migrated the dimension-parsing games (flip, flood, mosaic, samegame,
  twiddle, fifteen, sixteen, unruly, palisade, cube, galaxies, pegs) to the
  helper, preserving each game's own param field names. **sixteen and pegs square
  fix verified** with new tests (`decodeParams("4")`/`"7"` → `w === h`). Left
  un-migrated with reasons: range (TS-side `PRESETS[0]` fallback differs from
  `parseDimensions`' `w=0`), guess/blackbox (non-`WxH` formats).
- [x] 2.4 No `encode`/`decode` round-trip regressed — every per-game serialise
  test stays green (full suite 1218 passing).

## 3. `gridCursorMove` + `isCursorMove` → pointer.ts
- [x] 3.1 Add `gridCursorMove(button, x, y, w, h, wrap = false): { x: number; y: number } | null`
  (returns new clamped/wrapped coords, or `null` if `button` is not a cursor key
  or the move is a no-op at a clamped edge) and `isCursorMove(button)` to
  `pointer.ts`.
- [x] 3.2 `pointer.test.ts`: clamp at each edge (no wrap), wrap-around (toroidal),
  null on non-cursor button, null on no-op clamped edge.
- [x] 3.3 Deleted the local reinventions (`fifteen` `moveCursorClamped`, `sixteen`
  `moveCursor`) and routed them through the helper (`?? { x, y }` reproduces the
  "always returns a position" shape they relied on).
- [x] 3.4 Migrated the inline clamps in flood, mosaic, samegame (toroidal,
  wrap=true), twiddle (over the rotation-origin space), unruly, blackbox, guess to
  `gridCursorMove` + `isCursorMove`. Left local with reasons (first-press-reveal
  needs `UI_UPDATE` on an edge no-op, or a non-`[0,w)` clamp): **flip** (cursor),
  **palisade** (half-grid `[1, 2w-1]` clamp), **galaxies** (border-inclusive
  `[1, sx-2]` + drag side-effect), and cube/pegs/range (non-positional cursors).
  All migrated games' cursor tests stay green.

## 4. Consolidate advisory differential tooling
- [x] 4.1 Add `scripts/diff.vitest.config.mts` with
  `include: ["scripts/diff-*.test.ts"], environment: "node"`.
- [x] 4.2 Delete `scripts/diff-{flip,galaxies,unruly}.vitest.config.mts`.
- [x] 4.3 Add `"diff": "vitest run -c scripts/diff.vitest.config.mts"` to
  `package.json` scripts. Confirm `npm run diff` collects all three and each
  self-guards/skips cleanly when its fixture or native binary is absent.

## 5. build-emcc stale-cache guard
- [x] 5.1 In `scripts/build-emcc.sh`, when an explicit `USE_TS_LEAVES` /
  `USE_TS_<MODULE>` is passed that disagrees with the cached value in
  `build/wasm/CMakeCache.txt`, `rm -rf` the build dir before configuring (or fail
  with a clear message naming the fix). Add a short header comment documenting the
  footgun in the script itself.
- [x] 5.2 Default `VCSID` to the short git SHA (`VCSID=${VCSID:-$(git rev-parse --short HEAD)}`)
  instead of `unknown`.
- [x] 5.3 Verified live: `USE_TS_LEAVES=0 npm run build:wasm` against an ON cache
  printed "requested OFF but cache holds ON; wiping … to reconfigure cleanly",
  reconfigured pure-C, and delivered — no manual `rm -rf`. The reverse
  (`USE_TS_LEAVES=1` against the OFF cache) fired the guard again and restored the
  hybrid build. `VCSID` git-SHA default confirmed in the cmake invocation.

## 6. New-game-port scaffolding
- [x] 6.1 Add `scripts/new-game-port.sh <gameId>` that creates
  `src/native/games/<id>/{index,state,solver,generator,render}.ts` typed `Game<…>`
  stubs + an empty `__fixtures__/.gitkeep`, refusing to overwrite an existing dir.
- [x] 6.2 The script prints the manual-edit checklist: write `<id>-trace.c`,
  register in `src/native/games/ts-ported-ids.ts` and `src/native/games/index.ts`,
  add the two icon PNGs. It does NOT perform those edits.
- [x] 6.3 Reference it from `docs/porting/game-port-playbook.md` §1 as the
  copy-from-exemplar entry point.

## 7. Cheap tooling hygiene
- [x] 7.1 Remove the `lint-staged` block from `package.json` and drop the
  `lint-staged` devDependency (the pre-commit hook runs whole-repo `npm run lint`;
  the block is never invoked).
- [x] 7.2 Add `"typecheck": "tsc -b --noEmit"` and
  `"gate": "npm run typecheck && npm run lint && npm run test:run && vite build"`
  npm scripts; confirm `npm run gate` mirrors the husky hook.
- [x] 7.3 Rename `package.json` `"name"` from `"puzzles-web"` to `"puzzles-ts"`.

## 8. Sixteen differential drift
- [x] 8.1 Resolved as an **explicit re-deferral**: Sixteen is a permutation /
  shuffle game, not a solver/uniqueness or codec game, so by the playbook's own
  principle it does not earn a differential (its RNG faithfulness is covered by
  `random.ts`'s corpus + the existing differentials). The dropped-task gap is
  closed by recording this in the playbook §4 rewrite, which now lists Sixteen
  among the permutation games that deliberately ship without a differential. (No
  C trace harness exists for Sixteen — it was never committed — so writing one
  would be disproportionate for a non-earning game.)

## 9. Playbook de-drift
- [x] 9.1 In `docs/porting/game-port-playbook.md` §4, state the differential is
  per-game optional (earns its place on solver/codec games), not present
  "gated + advisory script" as the standard pair.
- [x] 9.2 The canonical regenerate command (`-DUSE_TS_RANDOM=0`) already lives in
  §4; the rewrite keeps it as the single source. Mass-editing the 6 fixture-header
  comment variants was judged churn-for-churn and skipped — the playbook is now
  the one place that states the canonical command. (The misleading "recover from
  git history" phrasing lives in fixture headers, not the playbook; left as a
  per-game note rather than a doc-wide edit.)

## 10. Validation
- [x] 10.1 Full gate green: `tsc -b --noEmit` clean, `biome lint` clean (259
  files), `vitest run` 1218/1218 passing, `vite build` OK. `npm run diff` collects
  all advisory diffs via the single config (2 passed, 1 self-skipped on its absent
  native binary).
- [x] 10.2 `openspec validate refactor-pre-port-tidy-3 --strict` passes.
- [x] 10.3 Owner greenlit the scope and approved commit after live verification;
  build-emcc guard + dev-server smoke (sixteen slide w/ toroidal wrap, samegame
  cursor wrap, 0 console errors) all passed. Archived + committed together.
