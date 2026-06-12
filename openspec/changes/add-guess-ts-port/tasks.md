# Tasks: Port Guess to TypeScript

## 0. Engine hook: `changedState`
- [x] 0.1 Add optional `changedState?(ui, oldState, newState)` to the `Game`
  interface (`src/native/engine/game.ts`), documented as upstream
  `game_changed_state`.
- [x] 0.2 Invoke it from `Midend`: in `applyMove`/`undo`/`redo` (before
  `setupAnimation`), in `startFrom` (`oldState = null`, after `newUi`), and in
  `restartGame`; never on the `UI_UPDATE` path.
- [x] 0.3 `midend.test.ts`: a fake game's `changedState` fires on move/undo/redo/
  restart/new-game and NOT on a `UI_UPDATE`.

## 1. Desc codec + SHA helper
- [x] 1.1 Add `shaCopy(s: ShaState): ShaState` (deep clone) to
  `src/native/random/sha1.ts` + a unit test (copy diverges from original).
- [x] 1.2 Add `src/native/games/guess/obfuscate.ts`: `obfuscateBitmap(bmp,
  bits, decode)`, `bin2hex`, `hex2bin`, faithful to `misc.c`.
- [x] 1.3 Unit-test `obfuscate.ts`: obfuscate→deobfuscate round-trips;
  `bin2hex`/`hex2bin` round-trip; a hand-checked vector if cheap.

## 2. State, params, feedback (`state.ts`)
- [x] 2.1 Types: `GuessParams`, `GuessState`, `GuessMove`, `GuessUi`,
  `GuessDrawState` (the last lives in `render.ts` but exported types align).
- [x] 2.2 `defaultParams`, `presets`, `encodeParams`, `decodeParams` (lenient),
  `validateParams`.
- [x] 2.3 `newDesc` (random sequence honouring `allowMultiple` → obfuscate →
  hex), `validateDesc`, `newState`, `cloneState`.
- [x] 2.4 `markPegs` (Knuth feedback) and `isMarkable`.
- [x] 2.5 `status` (`solved`/`lost`/`ongoing` from `state.solved`).
- [x] 2.6 Unit tests: feedback formula (incl. the black-then-white ordering and
  the duplicate-colour case), `isMarkable` under both `allowBlank`/`allowMultiple`,
  desc round-trip, param round-trip + validation.

## 3. Input + move logic (`index.ts`)
- [x] 3.1 `newUi`, `changedState` (hold-carrying, hint-drop-on-undo, working-row
  reset), `encodeUi`/`decodeUi` if the engine surface needs them.
- [x] 3.2 `interpretMove`: drag (bar / current-row / past-guess → slot, and
  clear), right-click hold, keyboard cursor/number/delete/hold/submit, label
  toggle, and the `'h'`/`'H'`/`'?'` hint key.
- [x] 3.3 `computeHint` (lexicographically-first consistent row, with the
  `ui.hint` cache + mincolour/maxcolour bounds).
- [x] 3.4 `executeMove` (guess submission with validation + `markPegs` + win/lose
  advance; solve reveal).
- [x] 3.5 ~~`currentKeyLabel`, `getCursorLocation`~~ — N/A: neither is part of
  the TS `Game` contract (upstream frontend-only helpers); omitted (design D10).
- [x] 3.6 Tier-1 tests: `executeMove` purity + win/lose transitions; `computeHint`
  produces a feedback-consistent row; hold-carry across a submit.

## 4. Rendering (`render.ts`)
- [x] 4.1 `colours` (the 10 peg colours + frame/cursor/flash/hold/empty/correct
  palette, incl. the background-distinguishability adjustment), `computeSize`,
  `setTileSize`, `newDrawState`.
- [x] 4.2 `redraw`: colour bar, guess rows + feedback markers, working row,
  current-move indicator, solution row (on solved), and the blitter drag sprite
  (lazy `blitterNew`, load-then-save ordering).
- [x] 4.3 Tier-2 render-ops test (recording `GameDrawing` double): a feedback
  marker is drawn in `COL_CORRECTPLACE`/`COL_CORRECTCOLOUR`; a held slot draws
  the hold bar; the solution row appears only when solved.

## 5. Wire-up
- [x] 5.1 `registerGame(guessGame)` in `guess/index.ts`; import in
  `src/native/games/index.ts`.
- [x] 5.2 Add `"guess"` to `TS_PORTED_PUZZLE_IDS` (`ts-ported-ids.ts`); the
  ports-match-registry gate stays green.
- [x] 5.3 Add the `guess` branch to `worker-adapter.ts` `decodeCustomParams`
  (map `ncolours`/`npegs`/`nguesses`/`allowBlank`/`allowMultiple` to the
  type-summary config keys; verify the top-bar type summary renders correctly).

## 6. Differential check
- [x] 6.1 Transient `puzzles/auxiliary/guess-trace.c` + its `CMakeLists.txt`
  line: emit (seed, params → desc) records (the secret is an obfuscated random
  sequence, so an identical desc proves the whole generator path; `markPegs` is
  covered by hand-verified Knuth vectors rather than a C trace, since `mark_pegs`
  is static).
- [x] 6.2 Build it (`cmake -DUSE_TS_LEAVES=0 -DUSE_TS_RANDOM=0`), freeze
  `src/native/games/guess/__fixtures__/guess-c-reference.json` (30 descs across
  5 rulesets × 6 seeds). Verified TS reproduces all 30 byte-for-byte; the
  obfuscation also matches `obfusc -t`'s authoritative self-test vectors.
- [x] 6.3 Gated `guess-differential.test.ts`: TS `newDesc` desc equals C hex for
  every recorded (seed, params); each C desc passes `validateDesc` + recovers a
  legal solution.
- [x] 6.4 ~~Advisory `scripts/diff-guess.test.ts`~~ — dropped, following the
  Flood precedent (the most recent comparable port shipped with only the gated
  frozen snapshot; the live-diff script is C-build-dependent and would die when
  `guess.c`/`guess-trace.c` are deleted on acceptance). The gated test already
  compares against the C source byte-for-byte.

## 7. Verify + gate
- [x] 7.1 **Dev-verified** via Playwright on the TS path (the existing hybrid
  wasm catalog already lists Guess; the registry serves it): renders correctly
  (colour bar, guess rows, hint markers, current-move bar, solution box, TS
  badge); keyboard number entry; submit + Knuth feedback (black correct-place +
  white correct-colour markers); multi-guess progression + working-row
  reconciliation; the hint key fills a consistent guess with the markable
  indicator; drag from the colour bar with the floating blitter sprite + clean
  drop/restore; right-click hold marker; Solve → "Out of moves" lose-reveal
  dialog; solution revealed in the bottom box; **0 console errors**. **Owner
  acceptance still pending** (parity gate → then section 8).
- [x] 7.2 Pre-commit gate green: `tsc -b --noEmit` → `biome lint` →
  `vitest run` → `vite build`.

## 8. On owner acceptance (separate commit, then archive)
- [ ] 8.1 Add `TS_PORTED` to the `guess` `puzzle(...)` block in
  `puzzles/CMakeLists.txt`; remove the `guess-trace.c` `CMakeLists.txt` line.
- [ ] 8.2 Delete `puzzles/guess.c` and `puzzles/auxiliary/guess-trace.c`.
- [ ] 8.3 `npm run build:wasm` (confirm catalog still lists Guess via
  `ts_ported_names`), dev re-check.
- [ ] 8.4 `openspec validate add-guess-ts-port --strict`; archive the change.
