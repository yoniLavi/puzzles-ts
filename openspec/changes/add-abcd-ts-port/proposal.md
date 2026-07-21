# add-abcd-ts-port

## Why

**ABCD is a self-contained, fully-playable third-party logic puzzle** from the
x-sheep/puzzles-unreleased collection: fill every cell of a `w×h` grid with one
of `n` letters so that the edge numbers count each letter per row and column, and
no two identical letters touch (orthogonally, and optionally diagonally). Its
header calls it "fully implemented and playable" — `interpret_move`,
`execute_move`, a genuine **deductive solver**, a solver-gated generator, and a
Solo-style entry/pencil-mark frontend all work.

It is a clean port now. The C engine is retired; ABCD is ~2,250 lines, depends on
**no** leaf library (`solver(abcd)` names none), and is a unique-solution logic
puzzle — so it fits the strongest verification this repo has (a **byte-match
differential** over a solver-gated generator) and earns a `findMistakes` hook.
Porting it advances the goal of moving all 13 bundled third-party puzzles to
native TS. Its two icons already ship.

## What Changes

- **`src/native/games/abcd/`** — the game, following the established multi-file
  port shape (`state` / `solver` / `generator` / `render` / `index`).
- **The edge-clue desc codec**: a comma-separated list of `(w+h)·n` clue numbers
  (`-` for a hidden clue), row clues then column clues, with validation
  (magnitude bounds per axis, exact count).
- **The deductive solver** (satisfied-clue elimination → single-possibility →
  the runs technique), ported as an idiomatic three-valued result
  (`SOLVED` / `AMBIGUOUS` / `CONTRADICTION`). No backtracking; no leaf lib.
- **The solver-gated generator** (random fill → clue count → keep only if the
  solver finds it unique; then, for "Remove clues", greedily hide clues while it
  stays unique), reproduced over `random.ts`.
- **Solo-style input** — left-click to select, right-click to pencil-select,
  arrow-key cursor, Enter to toggle ink/pencil, letter keys `A`–`I` / `a`–`i` /
  `1`–`9` to enter, Backspace/Space/`0` to clear, `M` to fill all pencil marks —
  as a `Move` discriminated union, not the C move strings.
- **`findMistakes`** — ABCD has a unique solution, so it ships the hook: it
  re-solves the clues to the canonical grid and flags any entered letter that
  contradicts it (design D5). The always-on adjacency / clue-violation error
  colouring is separate base-render, and is ported too.
- **A byte-match differential** against a new `puzzles/auxiliary/abcd-trace.c`,
  asserting the TS `newDesc` reproduces the C description byte-for-byte across
  presets and a size sweep — validating generator, solver and codec at once.
- **Registration** in `ts-ported-ids.ts` + `games/index.ts` (stage 1).
- **Stage 2, on owner acceptance**: add `TS_PORTED` to the `puzzle(abcd …)` entry
  in `puzzles/unreleased/CMakeLists.txt`, delete `puzzles/unreleased/abcd.c`, and
  rebuild.

Explicitly **not** in this change:

- **An explained hint** — ABCD is deductive and a strong hint candidate, but an
  explained `hint()` is always its own change (per every prior port); it comes
  later, not here.
- **Printing** — ABCD has a real `game_print`, but this fork removed the print
  pipeline at fork time, so no print promise is made (design context).

## Impact

- Affected specs: new `abcd` capability.
- Affected code: new `src/native/games/abcd/`, registration in
  `ts-ported-ids.ts` + `games/index.ts`, new `puzzles/auxiliary/abcd-trace.c`.
- Stage 2 flips ABCD to `TS_PORTED` and deletes `puzzles/unreleased/abcd.c`.
- No icon work: `src/assets/icons/abcd-{64,128}d8.png` already exist, so the
  `puzzle-icons` obligation is already met.
