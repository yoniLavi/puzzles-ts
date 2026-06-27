# Proposal: Restore on-screen key buttons for TS-ported games

**Status**: Proposed

## Why

The app shows a virtual keypad — the on-screen digit/letter buttons rendered by
`src/puzzle/puzzle-keys.ts` — for games that ask for one. The panel is populated
from `puzzle.requestKeys()`; when the list is empty it renders `nothing`. On
touch devices it is the *primary* way to enter a digit, and on desktop it is a
visible affordance many players use.

While a game ran on C/WASM, that list came from upstream's `game_request_keys`
(via `puzzles/webapp.cpp` → `worker.ts`). Solo, Keen, Towers, Unequal, Undead and
Filling each define `game_request_keys` and so showed their keypad (digits `1..cr`
plus a clear key; Undead shows Ghost/Vampire/Zombie + clear).

When a game is ported and flipped to `TS_PORTED`, it is served by the TS midend
through `src/native/engine/worker-adapter.ts`, whose `requestKeys()` is hardcoded
to `return []` (a keystone deferral the file documents at lines 17–21: *"the
request-keys surface still returns the empty-but-valid shape … upstream's
`config_item` UI machinery is a later cross-cutting change, not modelled here
yet"*). So the moment a keypad game goes TS-served, its on-screen keys silently
vanish. This was correct for the first ports (Flip/Galaxies/Pegs/Sixteen need no
keys) but is a real UX regression for the six keypad games now ported — most
conspicuously Solo, where players lean on the buttons.

This change models the request-keys surface on the TS path and restores the keypad
for every ported game that had one in C. (The custom-params / preferences
`config_item` UI — the *other* surface the adapter note defers — stays out of
scope; this is keys only.)

## What Changes

- **`Game` interface gains an optional `requestKeys(params)` hook**
  (`src/native/engine/game.ts`) returning `KeyLabel[]` (`{ button, label }`),
  faithful to upstream `game_request_keys(params, *nkeys)`. It takes `params`
  only (not state/ui) — matching upstream and the panel's reload trigger
  (`puzzle-keys.ts` reloads on param change, not per move). Absent ⇒ no keypad
  (the current behaviour for the non-keypad games).
- **`EngineCore`/`Midend` forward it.** `EngineCore` (`midend.ts`) gains
  `requestKeys(): KeyLabel[]`; `Midend.requestKeys()` returns
  `this.game.requestKeys?.(this.params) ?? []`.
- **The worker adapter stops returning `[]`.** `worker-adapter.ts`'s
  `requestKeys()` forwards `this.engine.requestKeys()`; the stale "empty-but-valid"
  note is narrowed to the config/prefs surface it still applies to.
- **A shared key-label helper** (`src/native/engine/key-labels.ts`) builds the
  common digit keypad (`digitKeys(n)` → buttons `'1'..'9'` then `'a'..` for `n>9`,
  plus the `'\b'` clear key labelled to match the existing `puzzle-keys` icon map),
  so the five digit games don't each re-derive it.
- **Per-game `requestKeys` for the six keypad games** — Filling, Keen, Solo,
  Towers, Unequal (digit keypads via the shared helper) and Undead (its
  Ghost/Vampire/Zombie + clear keys) — reproducing the upstream labels/buttons
  exactly, so the keypad returns identical to the C build.
- **Label/NULL convention.** Upstream returns `label = NULL` for buttons whose
  label is derived from the button code (a digit, or the clear key). The TS hook
  returns the resolved label directly (the digit character; `"Clear"` for the
  clear key so `puzzle-keys`'s `Clear → key-clear` icon mapping fires), matching
  what the C/WASM frontend produced.
- **Tests.** A tier-1 unit test per implementing game asserting the returned
  `KeyLabel[]` (buttons + labels) matches upstream's set for representative params
  (e.g. Solo 9-digit vs a 4×4 4-digit board; Undead's three monster keys), and a
  midend/adapter test that `requestKeys()` forwards the hook and defaults to `[]`.

## Impact

- **Affected specs:** `ts-engine` (ADDED — the request-keys hook + forwarding +
  empty default); `filling`, `keen`, `solo`, `towers`, `undead`, `unequal` (ADDED
  — each provides its on-screen keys).
- **Affected code:** `src/native/engine/game.ts`, `midend.ts`, `worker-adapter.ts`,
  new `src/native/engine/key-labels.ts`, and the six games' `index.ts`. No change
  to `puzzle-keys.ts`, `worker.ts`, or the C/WASM path (unported games keep their
  keys through the existing C route).
- Purely additive to the `Game` interface (optional hook), so the other ported
  games compile and behave unchanged.

## Out of scope

- **The custom-params / preferences `config_item` UI** — the other surface the
  worker-adapter note defers (`getCustomParamsConfig` returning the empty shape).
  That is a separate cross-cutting change; this one is keys only.
- **New keys upstream never had.** This restores parity with C, not new
  affordances (e.g. a Hint/Marks key on games that lacked one upstream). The
  `puzzle-keys` icon map already carries `Marks`/`Hints` entries; wiring those
  per-game is a possible follow-up, not part of restoring parity.
- **The C/WASM path.** Unported games already show their keys via the existing
  C route; this change does not touch it.
