# add-spokes-ts-port

## Why

**Spokes is one of the 13 third-party `puzzles/unreleased/` games this fork
ships and now ports to native TypeScript.** It is a fully-playable
connect-the-hubs logic puzzle — draw horizontal, vertical and diagonal lines
between numbered hubs so every hub reaches its line count, no two diagonals
cross, and all hubs form one connected group. Unlike Sokoban/Slide (unfinished),
Spokes already ships a working C/WASM build in the catalog, so this port has a
real in-app fallback: stage 1 registers the TS engine while C/WASM stays live,
and stage 2 (owner-accepted) flips `TS_PORTED` and deletes the C.

It ports cleanly: it is ~1,880 lines, depends only on `dsf` (already ported),
its generator is solver-gated (so a byte-match differential validates generator,
solver *and* codec at once), and — being a uniquely-solvable line-drawing puzzle
— it is a natural `findMistakes` citizen and a later explained-hint candidate.

## What Changes

- **`src/native/games/spokes/`** — the game, following the established multi-file
  port shape (`state` / `solver` / `generator` / `render` / `index`).
- **The hub/spoke model + flat desc codec.** Each hub is eight 2-bit spokes
  (`HIDDEN` / `EMPTY` / `LINE` / `MARKED`) over eight compass directions; the
  description is a flat one-character-per-cell grid of clue digits (`0`–`8`, plus
  `X` for a hand-authored hole), **not** run-length (design D1).
- **The tiered deductive solver** (Easy / Tricky / Hard) — hub saturation/exhaustion,
  diagonal-crossing marks, the two-ones rule, and bounded contradiction look-ahead
  for the harder tiers — plus the `dsf`-backed connectivity/isolation validator
  (design D2, D3).
- **The solver-gated generator**: fill every H/V line and a random diagonal per
  cell, shuffle, then greedily strip lines while the board stays uniquely solvable
  at the target difficulty and each hub keeps ≥ 1 line (design D4).
- **Drag / click / keyboard input** — left-drag between adjacent hubs toggles a
  line, right-drag toggles a mark, with the diagonal-crossing rule enforced; an
  arrow-key cursor on the half-grid draws (Enter) or marks (Space) (design D5).
- **`findMistakes`** — Spokes has a unique solution, so it flags every player-drawn
  line the solution forbids (and every mark the solution needs a line at), per the
  edge-drawing §3.5 pattern (design D6).
- **`solve()`** — reset then fill the fully-deduced solution (design D8).
- **A byte-match differential** against a new `puzzles/auxiliary/spokes-trace.c`,
  covering every preset and a size sweep, asserting the TS generator reproduces
  the C desc byte-for-byte (design D9).
- **Stage 2, on owner acceptance**: add `TS_PORTED` to the `puzzle(spokes …)`
  entry in `puzzles/unreleased/CMakeLists.txt`, delete `puzzles/unreleased/spokes.c`,
  and rebuild.

Explicitly **not** in this change:

- **An explained hint** — a Palisade-grade hint is always its own change (as with
  every prior port); Spokes is a strong candidate for one later (design D6).
- **Printing.** Spokes' C has a real `game_print`, but this fork deleted the print
  pipeline; the port makes no print promise (design intro, long-tail checklist).

## Impact

- Affected specs: new `spokes` capability.
- Affected code: new `src/native/games/spokes/`, registration in
  `ts-ported-ids.ts` + `games/index.ts`, new `puzzles/auxiliary/spokes-trace.c`.
- Stage 2 flips `TS_PORTED` on the existing `puzzle(spokes …)` entry in
  `puzzles/unreleased/CMakeLists.txt` and deletes `puzzles/unreleased/spokes.c`;
  the C/WASM build is the fallback until then.
- No icon work: `src/assets/icons/spokes-{64,128}d8.png` already exist and the
  `augmentation.ts` `spokes` summary (`{width}x{height} {difficulty}`) is present,
  so both obligations are already met.
