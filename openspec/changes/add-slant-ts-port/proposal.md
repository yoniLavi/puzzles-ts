# Port Slant (slant.c) to native TypeScript

## Why

Slant is the best next game in the top-down migration: a mid-size pure-logic
puzzle (~2450 lines of C) whose only unported dependency is `findloop.c` — a
206-line Tarjan bridge-finder that is also the blocker for bridges, dominosa,
loopy, and tracks, so porting it as a shared engine leaf pays forward. All
other candidates are either blocked (mines/net need the supersede hook,
loopy-family needs grid/loopgen too), non-logic (inertia, netslide), or
bigger (rect, dominosa). Slant's named deductive techniques (clue counting,
loop avoidance, dead-end avoidance, equivalence classes, v-shape elimination)
make it a strong future explained-hint candidate (a separate change). No
`midend_supersede_game_desc`, no editor-only move letters, no `qsort`
anywhere near the desc (byte-match differential is feasible).

## What Changes

- Add `src/native/engine/findloop.ts`: an idiomatic TS port of upstream's
  Tarjan bridge-finding algorithm (`findloop.c`), exposed as a shared engine
  leaf (`findLoops(nvertices, neighbours)` returning loop-edge / bridge
  queries). Slant is the first consumer; bridges/dominosa/loopy/tracks will
  reuse it.
- Add `src/native/games/slant/` implementing
  `Game<SlantParams, SlantState, SlantMove, SlantUi, SlantDrawState>`:
  fill every square of a `w × h` grid with a `/` or `\` diagonal so that
  vertex clues (0–4) count the incident diagonals and no closed loop forms.
  Params `w`, `h`, `diff` (Easy/Hard); all 6 upstream presets.
- Port the **solver** (clue counting at Easy plus immediate loop avoidance;
  equivalence-class tracking, dead-end avoidance, and the v-shape bitmap
  deductions at Hard) and the **generator** (random filled-grid growth over
  a vertex DSF, clue derivation, two-pass solver-gated clue removal
  prioritising obvious starting points, regenerate-until-hard loop). Both
  are solver-gated — the TS solver must match C's verdict on every
  intermediate board (§4.4 of the playbook).
- Port the **live error/completion analysis** faithfully: loop edges red via
  `findloop`, over/under-committed clue vertices red via degree counting,
  and the border-connected ("grounded") component tracking behind the
  upstream `fade-grounded` preference.
- Ship **`findMistakes`** (boards are uniquely solvable; Check & Save
  depends on it): re-solve from the clues and flag player diagonals that
  contradict the unique solution.
- Port both upstream preferences via the `Game.prefs` hook: mouse button
  order (`left-button`: `\`-first vs `/`-first) and fade-grounded.
- Render to full parity: chessboard-coloured diagonals, clue circles,
  corner dots, red error highlighting (slash, corner dots, clue circles),
  cursor, grounded fade, 3-phase win flash — palette index-for-index with
  the C enum.
- Byte-match differential: transient `puzzles/auxiliary/slant-trace.c`
  records preset/seed → desc fixtures; a committed gated test asserts
  `newDesc` reproduces them exactly.
- Register the game for owner smoke-testing (stage 1). On owner acceptance,
  flip `TS_PORTED`, delete `puzzles/slant.c` (and the trace harness), and
  archive this change (stage 2). `puzzles/findloop.c` stays — it still has
  C consumers (bridges, dominosa, loopy, net, tracks).

## Impact

- Affected specs: **new `slant` capability**; **`ts-engine`** gains the
  shared findloop helper requirement.
- Affected code: `src/native/engine/findloop.ts` (new),
  `src/native/games/slant/` (new), `src/native/games/ts-ported-ids.ts` +
  `src/native/games/index.ts` (registration),
  `puzzles/auxiliary/{CMakeLists.txt,slant-trace.c}` (transient trace
  harness), `puzzles/CMakeLists.txt` (`TS_PORTED` + drop `solver(slant)` at
  stage 2), `puzzles/slant.c` (deleted at stage 2).
- No pencil-mark UX (no candidate notes in Slant). No keypad (upstream
  `game_request_keys` is NULL). No supersede, no printing, no editor
  letters (documented skips). No app-shell changes.
