# Port Light Up (lightup.c) to native TypeScript

## Why

Light Up (Akari) is the next game in the top-down migration: the smallest
remaining pure-logic game (~2500 lines of C), long flagged as "next once its
combi.c blocker clears" — and that blocker is already gone: the lexicographic
C(n,r) enumerator was ported pre-pivot as `src/native/combi/` (corpus-verified
byte-for-byte), so this port just consumes it. No other leaf libraries, no
`midend_supersede_game_desc`, no editor-only move letters, no `qsort` in the
generator (byte-match differential is feasible). Its named deductive solver
techniques (forced light, clue satisfied/saturated, overlapping-set discount)
make it a strong future explained-hint candidate (a separate change).

## What Changes

- Add `src/native/games/lightup/` implementing
  `Game<LightupParams, LightupState, LightupMove, LightupUi, LightupDrawState>`:
  place bulbs on a rectangular grid so every non-black square is lit and no
  bulb shines on another, with numbered black squares constraining adjacent
  bulb counts. Params `w`, `h`, `blackpc`, `symm` (5 symmetry modes),
  `difficulty` (easy/tricky/hard); all 9 upstream presets.
- Port the **solver** (forced-light + clue deductions at easy; the
  overlapping-set MAKESLIGHT/MAKESDARK discount via `Combi` at tricky; bounded
  recursion at hard) and the **generator** (symmetric black placement,
  light seeding/removal, solver-gated number stripping, blackpc ramp-up).
  Both are solver-gated — the TS solver must match C's verdict on every
  intermediate board (§4.4 of the playbook).
- Ship **`findMistakes`** (boards are uniquely solvable; Check & Save depends
  on it): re-solve from the clues and flag player bulbs and impossible-marks
  that contradict the unique solution.
- Port the **`show-lit-blobs`** preference ("Draw non-light marks even when
  lit", default on) via the `Game.prefs` hook.
- Render to full parity: black/numbered tiles, yellow lit corridors, bulbs
  (red when overlapping), red definitely-wrong clue numbers, impossible-mark
  blobs, cursor, win flash — palette index-for-index with the C enum (the
  app's dark-mode `paletteOverrides` target indices 2/3).
- Byte-match differential: transient `puzzles/auxiliary/lightup-trace.c`
  records preset/seed → desc fixtures; a committed gated test asserts
  `newDesc` reproduces them exactly.
- Register the game for owner smoke-testing (stage 1). On owner acceptance,
  flip `TS_PORTED`, delete `puzzles/lightup.c` (and the trace harness), and
  archive this change (stage 2).

## Impact

- Affected specs: **new `lightup` capability**; the stale pre-pivot `combi`
  spec is untouched (its module is consumed as-is).
- Affected code: `src/native/games/lightup/` (new),
  `src/native/games/ts-ported-ids.ts` + `src/native/games/index.ts`
  (registration), `puzzles/auxiliary/{CMakeLists.txt,lightup-trace.c}`
  (transient trace harness), `puzzles/CMakeLists.txt` (`TS_PORTED` at
  stage 2), `puzzles/lightup.c` + `solver(lightup)` (deleted at stage 2).
- No pencil-mark UX (Light Up's mark is a single "no bulb here" blob, not
  candidate notes). No keypad (upstream `game_request_keys` is NULL). No
  supersede, no printing (documented skips). No app-shell changes.
