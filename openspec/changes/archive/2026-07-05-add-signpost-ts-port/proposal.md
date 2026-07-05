# Port Signpost (signpost.c) to native TypeScript

## Why

Signpost is the most straightforward next game in the top-down migration:
a self-contained ~2570-line logic puzzle whose **only** leaf dependency is
`dsf` — already shipped and battle-tested (`src/native/engine/dsf.ts`) — so
it needs no new engine leaf. Its deductive solver is a single, elegant
forced-link rule iterated to a fixpoint (`solve_single` + `update_numbers`),
much smaller than the graded solvers of the other remaining candidates
(Magnets 121 solve-refs, Dominosa 152, Map). It carries **no long-tail
risk**: no `midend_supersede_game_desc` (unlike Mines/Net), no
`grid.c`/`loopgen` leaf ports (unlike Loopy/Pearl/Tracks), no
`findloop`+flip-dsf (unlike Dominosa/Bridges), no editor-only move letters,
no `qsort` anywhere near the desc (byte-match differential is feasible). Its
rendering couples to no unported tile family. Its single, well-defined
deduction is a strong future explained-hint candidate (a separate change).

## What Changes

- Add `src/native/games/signpost/` implementing
  `Game<SignpostParams, SignpostState, SignpostMove, SignpostUi,
  SignpostDrawState>`: a `w × h` grid where every cell carries an arrow
  (one of 8 directions) and some cells carry immutable sequence numbers;
  the player links cells into a single chain `1 … n` where every link
  follows its cell's arrow and the numbers run consecutively. Params `w`,
  `h`, `forceCornerStart` (bool); all 6 upstream presets.
- Port the **linked-chain state model** faithfully: `next`/`prev` index
  links, a `Dsf` binding cells into regions, and the derived region
  numbering + 16-way region colouring (`update_numbers`, `head_number`,
  `connect_numbers`) that renders each partial chain as a coloured
  gradient. This is the bulk of the state logic and must reproduce
  upstream's colour-assignment rules exactly for render parity.
- Port the **solver** (`solve_single`: link a cell to its sole possible
  next / sole possible prev, iterated with `update_numbers` to a fixpoint)
  and the **generator** (`new_game_fill`: random head+tail walk building a
  full path; `new_game_strip`: add immutable numbers until solver-solvable,
  then remove redundant ones; `generate_desc`). Both solver-gated — the TS
  solver must match C's verdict on every intermediate board (playbook §4.4).
- Port the **live error / completion analysis** (`check_completion`):
  loops, non-consecutive immutable numbers, and over-committed links flagged
  red via `FLAG_ERROR`; the `completed` flag latches when the whole
  `1 … n` chain is present and error-free.
- Ship **`findMistakes`** (boards are uniquely solvable; Check & Save
  depends on it): re-solve from the immutable clues and flag every player
  link that contradicts the unique solution chain.
- Port the sole upstream preference via the `Game.prefs` hook:
  `flash-type` (Victory rotation effect: unidirectional vs meshing gears).
- Render to full parity: per-region background colours + arrow mid/dim
  colours, direction arrows, numbers (immutable vs derived styling), the
  drag sprite via a **blitter** (as Pegs does), corner-start highlight,
  red error highlighting, keyboard cursor, and the spin win-flash (two
  modes per the pref) — palette index-for-index with the C enum.
- Byte-match differential: transient `puzzles/auxiliary/signpost-trace.c`
  records preset/seed → desc fixtures; a committed gated test asserts
  `newDesc` reproduces them exactly.
- Register the game for owner smoke-testing (stage 1). On owner acceptance,
  flip `TS_PORTED`, delete `puzzles/signpost.c` (and the trace harness), and
  archive this change (stage 2). No shared C leaf is deleted (`dsf` has no
  C consumers to track — it is TS-only already).

## Impact

- Affected specs: **new `signpost` capability**. No `ts-engine` delta — every
  hook this port needs (prefs, `findMistakes`, blitter drag sprite,
  `UI_UPDATE`, keyboard cursor) already exists.
- Affected code: `src/native/games/signpost/` (new),
  `src/native/games/ts-ported-ids.ts` + `src/native/games/index.ts`
  (registration), `puzzles/auxiliary/{CMakeLists.txt,signpost-trace.c}`
  (transient trace harness), `puzzles/CMakeLists.txt` (`TS_PORTED` at
  stage 2), `puzzles/signpost.c` (deleted at stage 2).
- No pencil-mark UX (no candidate notes in Signpost). No keypad (upstream
  `game_request_keys` is NULL). No supersede, no printing, no editor
  letters, no difficulty tiers (documented skips). No app-shell changes.
