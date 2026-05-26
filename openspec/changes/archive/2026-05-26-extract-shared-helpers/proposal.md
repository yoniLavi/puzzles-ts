# Change: Extract shared helpers from game ports to engine level

## Why
Three helpers are duplicated or local-only across the two shipped ports (Flip, Galaxies) and will be needed by ~30 future ports. Extracting them now, before port #3, avoids per-game re-derivation and ensures the epsilon fix in `mkhighlightBackground` is shared rather than re-discovered.

## What Changes
- **`colour-mkhighlight.ts`**: Promote Galaxies' `mkhighlightBackground` (with its near-white epsilon fix) to `src/native/engine/colour-mkhighlight.ts`. Every white/black-tile game (Solo, Loopy, Map, Pattern, Range, ...) will use it.
- **`pointer.ts`**: Centralise button code constants (`LEFT_BUTTON`, `RIGHT_DRAG`, etc.) that are currently re-declared as plain consts per-game. Add a `PointerSession` helper that lets `interpretMove` consume typed press/drag/release events instead of raw button-number switches. The "deliberately not handled" cases (e.g. Galaxies ignoring `LEFT_DRAG`) become a discriminated case the compiler tracks.
- **`dsf.ts`**: Promote Galaxies' local `Dsf` class to `src/native/engine/dsf.ts`. The second-consumer rule (from Galaxies design.md D1) is satisfied by this change itself — the promotion is the import-path move.

No Game interface contract changes. No midend changes. Pure leaf-helper additions.

## Impact
- Affected specs: ts-engine (new helper modules)
- Affected code: `src/native/games/flip/index.ts`, `src/native/games/galaxies/index.ts`, `src/native/games/galaxies/dsf.ts` (deleted after promotion)
