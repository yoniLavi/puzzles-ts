# Tasks: Port Black Box to TypeScript

## 1. Promote the obfuscate helper
- [x] 1.1 Move `src/native/games/guess/obfuscate.ts` →
  `src/native/engine/obfuscate.ts` (unchanged), update its header note.
- [x] 1.2 Repoint Guess's `state.ts` import and move/repoint
  `guess/obfuscate.test.ts` → `engine/obfuscate.test.ts`.
- [x] 1.3 `npm run test:run` for guess + engine green (pure move, no behaviour
  change).

## 2. State, params, laser engine (`state.ts`)
- [x] 2.1 Types: `BlackboxParams`, `BlackboxState`, `BlackboxMove` (discriminated
  union), `BlackboxUi`; laser/ball flag constants.
- [x] 2.2 `defaultParams`, `presets` (5 upstream), `encodeParams`,
  `decodeParams` (lenient `w`/`h`/`m`/`M`), `validateParams`. Add the
  `blackbox` branch to `worker-adapter.decodeCustomParams` mapping
  `minballs`/`maxballs` → the `no-of-balls` type-summary key (`"5"` or `"3-6"`).
- [x] 2.3 Desc codec: `newDesc` (scatter `nballs` balls → bitmap → obfuscate →
  hex), `validateDesc`, `newState`; `cloneState`.
- [x] 2.4 Laser engine: `range2grid`, `grid2range`, `isball`,
  `fireLaserInternal`, `laserExit`, `fireLaser`.
- [x] 2.5 `checkGuesses(state, cagey)` — both the cagey single-error feedback
  (deterministic grid-seeded random) and the full reveal + counting.
- [x] 2.6 `status` (`solved`/`lost`/`ongoing`).
- [x] 2.7 Unit tests: laser tracer hand-verified cases; `checkGuesses` counting
  + cagey justwrong; desc round-trip + `validateDesc` rejects; params
  round-trip + lenient decode + validation; `status` mapping.

## 3. Input + move logic (`index.ts`)
- [x] 3.1 `newUi`, `changedState` (error-counter increment on `justwrong` move).
- [x] 3.2 `interpretMove`: cursor move (no corners), toggle ball, toggle lock,
  column/row lock, fire laser with the press-to-highlight flash (mouse vs
  keyboard), `LEFT_RELEASE` flash clear, reveal button (`CAN_REVEAL` gate),
  cursor select/select2 mapping.
- [x] 3.3 `executeMove`: `T`/`F`/`R`/`LB`/`LC`/`LR`/`S` over the discriminated
  union; clear `justwrong`/wrong-omitted flags at the top; throw on illegal.
- [x] 3.4 `statusbarText` (balls-marked / verify-prompt / wrong / reveal
  result / `(N errors)` suffix); `solve` (reveal/give-up).
- [x] 3.5 Unit tests: fire/verify/reveal sequences; reveal gating; status-bar
  strings; error-counter via `changedState`.

## 4. Rendering (`render.ts`)
- [x] 4.1 `colours` (mkhighlight background + ball/wrong/button/cursor/grid/
  lock/cover/text/flashtext), `computeSize`, `setTileSize` (crad/rrad),
  `newDrawState`.
- [x] 4.2 `redraw`: bevelled outline first-draw + bg fill, arena tiles
  (cover/lock/ball/reveal + red cross), laser tiles (number/`H`/`R` text,
  wrong/omitted markers, press-flash), reveal button, cursor square.
- [x] 4.3 `animLength` (CUR_ANIM when keyboard flash), `flashLength`
  (win/reveal flash).
- [x] 4.4 Tier-2 render-ops test (`blackbox-render.test.ts`).

## 5. Register + gate
- [x] 5.1 Add `import "./blackbox/index.ts"` to `src/native/games/index.ts`;
  add `blackbox` to `TS_PORTED_PUZZLE_IDS`.
- [x] 5.2 Wire the `Game` object; `registerGame(blackboxGame)`.
- [x] 5.3 Full gate: `tsc -b --noEmit` → `biome lint` → `vitest run` (963) →
  `vite build` — all green.
- [x] 5.4 `npm run dev` smoke on Black Box: renders the covered arena + range
  ring + bevel + status bar + `8x8, 5 balls` summary + TS badge; firing a
  laser shows a correct `H` hit; 0 console errors. (Owner-acceptance
  interactive parity testing — ball marking/locking/verify/reveal flash —
  pending; the empty-registry fallback no longer covers blackbox since it is
  now registered, but `blackbox.c` is retained until acceptance.)

## 6. Owner acceptance → C deletion (separate step)
- [ ] 6.1 On owner-accepted parity: add `TS_PORTED` for `blackbox` in
  `puzzles/CMakeLists.txt`, delete `puzzles/blackbox.c`, rebuild assets.
- [ ] 6.2 Archive the change.
