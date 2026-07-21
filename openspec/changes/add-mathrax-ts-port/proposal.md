# add-mathrax-ts-port

## Why

**Mathrax is a Latin-square logic puzzle bundled from the x-sheep third-party
collection**, currently served by C/WASM. It is one of thirteen `puzzles/unreleased/`
games being ported to native TypeScript. Fill an `o×o` grid with digits `1..o`, no
repeat in any row or column, so that arithmetic clues sitting on the interior grid
intersections hold: each clue constrains the four digits around it (add / subtract /
multiply / divide give the same result on both diagonals, `=` equal, `E`/`O` all
even / all odd).

It ports cleanly now: the whole `latin.ts` framework the family shares is already in
the engine (Towers/Unequal/Keen/Solo/Group are consumers), so Mathrax's solver is
"its own clue deductions + a thin difficulty driver," and its solver-gated generator
over the bit-identical `random.ts` yields the strongest verification we have — a
byte-match differential validating generator, solver and codec at once. Unlike the
unfinished Tatham games, Mathrax already ships a working C/WASM fallback, so stage 1
registers it TS-served with the C still behind it.

## What Changes

- **`src/native/games/mathrax/`** — the game, in the established multi-file port
  shape (`state` / `solver` / `generator` / `render` / `index`), reusing
  `engine/latin.ts` for the solver framework and generator (design D2, D3).
- **A uniquely-solvable Latin puzzle ships `findMistakes`** — re-solve from the
  immutable clues to the unique solution and flag every placed digit that
  contradicts it, with **pencil notes as first-class mistakes** (a note that crossed
  out the solution value), so Check & Save hard-blocks a wrong board (design D6, §3.5,
  §3.7). Upstream's live immediate-contradiction highlighting is preserved separately.
- **The full pencil-mark note-taking UX** (§3.7): mark-all (`M`), sticky pencil mode,
  a mode indicator, notes-are-mistakes — plus the **on-screen digit keypad**
  (`requestKeys` → `digitKeys(o)`, §3.8) that the game loses on the TS path otherwise.
- **A byte-match differential** against a new `puzzles/auxiliary/mathrax-trace.c`,
  covering presets and a size / difficulty / clue-option sweep, asserting the TS
  `newDesc` reproduces the C desc byte-for-byte (design D8).
- **Stage 2, on owner acceptance**: add `TS_PORTED` to `puzzle(mathrax …)` in
  `puzzles/unreleased/CMakeLists.txt`, delete `puzzles/unreleased/mathrax.c`, rebuild.

Explicitly **not** in this change:

- **An explained hint** — a candidate-elimination Mathrax hint (Towers-grade) is a
  compelling *separate* change, sequenced apart like every prior port's hint.

## Impact

- Affected specs: new `mathrax` capability.
- Affected code: new `src/native/games/mathrax/`, registration in
  `ts-ported-ids.ts` + `games/index.ts`, a `mathrax` config-summary entry in
  `src/puzzle/augmentation.ts`, new `puzzles/auxiliary/mathrax-trace.c`.
- Stage 2 flips Mathrax to `TS_PORTED` and deletes `puzzles/unreleased/mathrax.c`.
- No icon work: `src/assets/icons/mathrax-{64,128}d8.png` already exist, so the
  `puzzle-icons` obligation is already met.
