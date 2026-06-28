# Proposal: Extract a shared win-flash helper

**Status**: Proposed — trivial cross-game cleanup. Best folded into the *next* game port
rather than run as a standalone change (low value on its own).

## Why

Most ported games' `flashLength` is the same one-liner — flash for `FLASH_TIME` exactly
when a move just transitioned the board from unsolved to solved without a cheat:

```
if (!from.completed && to.completed && !from.cheated && !to.cheated) return FLASH_TIME;
return 0;
```

It recurs verbatim across the candidate-elimination games and beyond (the win-celebration
flash is a cross-game convention). Each game also re-declares its own `FLASH_TIME`.

## What Changes

- **A shared `winFlash(from, to, flashTime)`** (e.g. `engine/flash.ts`) returning
  `flashTime` on a fresh, un-cheated solve else `0`, reading the common `completed` /
  `cheated` state fields structurally.
- Games whose flash is exactly this delegate to it; games with extra flash logic
  (Flip's solve celebration, animated reveals) keep their own.

## Impact

- **Affected specs:** `ts-engine` (ADDED — shared win-flash helper).
- **Affected code:** `engine/flash.ts` (new, + test); the `flashLength` of the games that
  match the canonical shape. Behaviour-preserving — gated by existing flash-overlay tests.

## Out of scope

- Games with bespoke flash timing/overlays (keep theirs).
- Consolidating per-game `FLASH_TIME` constants (orthogonal; leave unless trivial).
