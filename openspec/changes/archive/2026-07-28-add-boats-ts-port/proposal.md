# add-boats-ts-port

## Why

**Boats (Battleships) is one of the 13 third-party `puzzles/unreleased/` games
this fork ships as C/WASM and is now porting to native TypeScript.** It is a
genuine deductive logic puzzle — locate a known fleet of boats in a grid from
row/column occupancy counts and a handful of given segments, with two boats never
touching even diagonally — with a **unique solution** at every difficulty. Unlike
the movement ports (Slide, Sokoban), it therefore joins the deductive family:
solver-gated generation, a `findMistakes` hook, and a later explained hint (a
*separate* change).

It is a good next port: self-contained apart from `dsf` (already ported), a
solver-gated generator that yields a **byte-match differential** validating
generator + solver + codec at once, and it advances retiring the C engine by one
more game.

## What Changes

- **`src/native/games/boats/`** — the game, following the established multi-file
  port shape (`state` / `solver` / `generator` / `render` / `index`).
- **Params + the fleet-configuration codec** — width, height, maximum fleet size,
  the fleet-configuration list (how many boats of each size), a four-level
  difficulty (Easy / Normal / Tricky / Hard), and a "remove numbers" flag.
- **The desc / game-ID codec** — the grid-clue run-length encoding (given ship
  segments with orientation + water) plus the row/column occupancy clues, with
  validation.
- **The four-tier pure-deductive solver** (`Easy` / `Normal` / `Tricky` / `Hard`,
  over the shared [`engine/dsf.ts`](../../src/native/engine/dsf.ts) for
  boat-connectivity) ported as the shared deduction engine that gates generation
  and — later — narrates a hint. Boats **guesses at no tier** — every named
  difficulty is reached by deduction alone — so it satisfies the
  guess-free-generation policy outright (design D2).
- **`findMistakes`** — Boats has a unique solution, so the hook **re-solves to that
  solution** and flags every placed cell contradicting it, and **Check & Save**
  hard-blocks on a wrong board (playbook §3.5). The C's live rule-violations
  (over-filled row/column, two boats touching even diagonally, an overpopulated
  fleet, a contradicted given segment) are *additionally* rendered for immediate
  in-play feedback, faithful to the C — a subset of the re-solve set (design D5).
- **Line-fill drag input** — left-click cycles empty→ship→water, right-click
  toggles water, a drag fills a row/column run, and a keyboard cursor with
  Enter/Space (and Ctrl/Shift-drag) places segments. Unknown "vague" segments
  auto-resolve to the correct shape from their neighbours, and the fleet list
  auto-crosses-off completed boats (design D4). No slide animation
  (`game_anim_length` is `0`); a completion flash only.
- **A byte-match differential** against a new `puzzles/auxiliary/boats-trace.c`,
  asserting the TS generator reproduces the C desc byte-for-byte across presets +
  difficulties (validating generator + solver + codec together).
- **Stage 2, on owner acceptance**: add `TS_PORTED` to `puzzle(boats …)` in
  `puzzles/unreleased/CMakeLists.txt`, delete `puzzles/unreleased/boats.c`, rebuild.

Explicitly **not** in this change:

- **An explained hint** — a Battleships deduction hint is a compelling
  deliberate-divergence follow-up, but it is its own change per every prior port.
- **Printing** — boats has a real `game_print`, but `printing.c` was deleted at
  fork; the port makes no print promise (design D9, long-tail checklist).

## Impact

- Affected specs: new `boats` capability.
- Affected code: new `src/native/games/boats/`, registration in
  `ts-ported-ids.ts` + `games/index.ts`, new `puzzles/auxiliary/boats-trace.c`.
- Stage 2 flips Boats to TS-served in the catalog and deletes
  `puzzles/unreleased/boats.c`. Until then the C/WASM build stays the fallback.
- No icon work: `src/assets/icons/boats-{64,128}d8.png` already exist, so the
  `puzzle-icons` obligation is already met.
