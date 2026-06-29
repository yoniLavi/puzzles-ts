# Tasks: Restore on-screen key buttons for TS-ported games

## 1. Engine hook + forwarding
- [x] 1.1 Add `requestKeys?(params: Params): KeyLabel[]` to the `Game` interface
  (`src/native/engine/game.ts`), importing `KeyLabel` from `puzzle/types.ts`;
  document that it is params-only and absent ⇒ no keypad.
- [x] 1.2 Add `requestKeys(): KeyLabel[]` to the `EngineCore` interface and
  implement `Midend.requestKeys()` as `this.game.requestKeys?.(this.params) ?? []`.
- [x] 1.3 Forward from the worker adapter: `worker-adapter.ts requestKeys()` returns
  `this.engine.requestKeys()`; narrow the header note so it only describes the
  still-deferred config/prefs surface.

## 2. Shared helper
- [x] 2.1 `src/native/engine/key-labels.ts`: `digitKeys(n)` → buttons `'1'..'9'`
  then `'a'+(i-9)` for `i ≥ 9`, label = the digit/letter character, plus a trailing
  clear key `{ button: 8 /* '\b' */, label: "Clear" }` (so the `puzzle-keys`
  `Clear → key-clear` icon mapping fires). Unit-tested for `n = 4` and `n = 9`.
  (Also exports `clearKey`/`CLEAR_BUTTON` for the bespoke games.)

## 3. Per-game keys (faithful to upstream `game_request_keys`)
- [x] 3.1 Solo — `requestKeys(p)` returns `digitKeys(p.c * p.r)`.
- [x] 3.2 Keen — `requestKeys(p)` returns `digitKeys(p.w)`.
- [x] 3.3 Towers — `requestKeys(p)` returns `digitKeys(p.w)`.
- [x] 3.4 Unequal — `requestKeys(p)` returns a **bespoke** `unequalKeys(p.order)`,
  NOT `digitKeys`. Upstream's `c2n`/`game_request_keys` switch to a `'0'`-based
  keypad for `order ≥ 10` (`'0'..'9'` = values 1..10, then `'a',…`), and Unequal
  allows orders up to 32, so the high range is reachable and `digitKeys` (which is
  always `'1'`-based) would mis-label it.
- [x] 3.5 Filling — `requestKeys()` returns `digitKeys(9)` (upstream is fixed 1..9).
- [x] 3.6 Undead — `requestKeys()` returns the four explicit keys: `G`/"Ghost",
  `V`/"Vampire", `Z`/"Zombie", and the clear key.
- [x] 3.7 Register each `requestKeys` on the game object.

## 4. Tests
- [x] 4.1 `key-labels.test.ts`: `digitKeys(9)` = 1..9 + clear; `digitKeys(4)` =
  1..4 + clear; `digitKeys(11)` rolls into `'a','b'` past 9.
- [x] 4.2 Per-game tier-1: assert the returned `KeyLabel[]` (buttons + labels)
  matches the upstream set for representative params (Solo `3×3` vs `2×2`; Keen at
  two widths; Unequal order 4 vs order 10/11 `'0'`-based; Undead's exactly four
  keys); reuse existing game test files.
- [x] 4.3 Midend/adapter: `Midend.requestKeys()` forwards the hook and returns `[]`
  for a game without it (drive a fake game both ways) — `midend.test.ts`.

## 5. Close-out
- [x] 5.1 Full gate green (`tsc -b --noEmit` → `biome lint` → `vitest run` →
  `vite build`).
- [x] 5.2 Dev-verify in the browser (Solo + Undead via playwright-cli on the dev
  server): Solo's keypad reappears (digits 1–9 + clear) and the `5` button enters
  a `5` (shown red — live duplicate detection working); Undead's bespoke keypad
  shows Ghost/Vampire/Zombie + clear. Both on the green `TS` badge (TS-served path),
  0 console errors. (Owner acceptance is the remaining gate — keys ship with the
  already-`TS_PORTED` games — so on sign-off: commit + `openspec archive
  add-ts-onscreen-keys --yes`.)
