# Tasks: Restore on-screen key buttons for TS-ported games

## 1. Engine hook + forwarding
- [ ] 1.1 Add `requestKeys?(params: Params): KeyLabel[]` to the `Game` interface
  (`src/native/engine/game.ts`), importing `KeyLabel` from `puzzle/types.ts`;
  document that it is params-only and absent ⇒ no keypad.
- [ ] 1.2 Add `requestKeys(): KeyLabel[]` to the `EngineCore` interface and
  implement `Midend.requestKeys()` as `this.game.requestKeys?.(this.params) ?? []`.
- [ ] 1.3 Forward from the worker adapter: `worker-adapter.ts requestKeys()` returns
  `this.engine.requestKeys()`; narrow the header note so it only describes the
  still-deferred config/prefs surface.

## 2. Shared helper
- [ ] 2.1 `src/native/engine/key-labels.ts`: `digitKeys(n)` → buttons `'1'..'9'`
  then `'a'+(i-9)` for `i ≥ 9`, label = the digit/letter character, plus a trailing
  clear key `{ button: 8 /* '\b' */, label: "Clear" }` (so the `puzzle-keys`
  `Clear → key-clear` icon mapping fires). Unit-tested for `n = 4` and `n = 9`.

## 3. Per-game keys (faithful to upstream `game_request_keys`)
- [ ] 3.1 Solo — `requestKeys(p)` returns `digitKeys(p.c * p.r)`.
- [ ] 3.2 Keen — `requestKeys(p)` returns `digitKeys(p.w)`.
- [ ] 3.3 Towers — `requestKeys(p)` returns `digitKeys(p.w)`.
- [ ] 3.4 Unequal — `requestKeys(p)` returns `digitKeys(p.order)` (the grid order).
- [ ] 3.5 Filling — `requestKeys()` returns `digitKeys(9)` (upstream is fixed 1..9).
- [ ] 3.6 Undead — `requestKeys()` returns the four explicit keys: `G`/"Ghost",
  `V`/"Vampire", `Z`/"Zombie", and the clear key.
- [ ] 3.7 Register each `requestKeys` on the game object.

## 4. Tests
- [ ] 4.1 `key-labels.test.ts`: `digitKeys(9)` = 1..9 + clear; `digitKeys(4)` =
  1..4 + clear; `digitKeys(11)` rolls into `'a','b'` past 9.
- [ ] 4.2 Per-game tier-1: assert the returned `KeyLabel[]` (buttons + labels)
  matches the upstream set for representative params (Solo `3×3` vs `2×2`; Keen at
  two widths; Undead's exactly four keys); reuse existing game test files.
- [ ] 4.3 Midend/adapter: `Midend.requestKeys()` forwards the hook and returns `[]`
  for a game without it (drive a fake game both ways) — `midend.test.ts`.

## 5. Close-out
- [ ] 5.1 Full gate green (`tsc -b --noEmit` → `biome lint` → `vitest run` →
  `vite build`).
- [ ] 5.2 Dev-verify in the browser (Solo + one other, e.g. Undead): the keypad
  reappears, buttons enter digits/monsters and the clear key clears, on both a
  9-digit and a smaller board; matches the C build for an unported keypad game
  side-by-side. (Owner acceptance is the gate to flip nothing here — keys ship with
  the already-`TS_PORTED` games — so this is dev-verify + owner sign-off, then
  commit + `openspec archive add-ts-onscreen-keys --yes`.)
