# Add a "fill all pencil marks" toolbar button

## Why

Pencil marks (candidate notes) are central to the Latin-square family — Towers,
and soon Solo / Keen / Unequal / Undead. Upstream exposes a one-key shortcut
(`M`) that fills every empty cell with all candidate marks, the usual starting
move for these puzzles. In this web app that shortcut is only reachable from the
keyboard, so a touch/mouse player (and an owner doing acceptance testing) has no
way to invoke it. Surface it as a toolbar button next to Hint and Check & Save,
shown only for games that support it.

## What changes

- New optional `readonly canMarkAll?: boolean` on the `Game` interface. A game
  that handles the `M`/`m` key in `interpretMove` (filling all empty cells with
  every candidate pencil mark) sets it true. Towers sets it true.
- The midend surfaces it as `canMarkAll` in the static attributes
  (`game.canMarkAll ?? false`); the C/WASM path reports false (no TS hook), so
  the button is TS-port-only for now and lights up per game as the remaining
  pencil-mark games are ported.
- `Puzzle` exposes `canMarkAll`; `puzzle-history` renders an icon button in the
  existing `wa-button-group`, gated on `puzzle.canMarkAll`, that injects the
  `M` key via the existing `processKey` path (no new engine action — it reuses
  the keyboard handler the games already implement).

## Impact

- Affected specs: `ts-engine` (new capability requirement).
- Affected code: `src/native/engine/game.ts`, `midend.ts`, `src/puzzle/types.ts`,
  `worker.ts`, `puzzle.ts`, `puzzle-history.ts`, `src/icons.ts`,
  `src/native/games/towers/index.ts`.
- No behaviour change for games without the flag (no button, no key change).
