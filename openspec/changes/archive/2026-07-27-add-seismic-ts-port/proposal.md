# add-seismic-ts-port

## Why

Seismic is one of **thirteen third-party puzzles** from x-sheep's
`puzzles-unreleased` collection that this fork bundles and already ships as
C/WASM catalog games. Porting all thirteen to native TypeScript is the final
stretch of retiring the C engine.

Seismic (Hakyuu / Ripple Effect) is a Nikoli-style **number-placement logic
puzzle**: the grid is split into regions, each region of size N holds one of
each 1…N, and equal numbers are kept apart — at least N cells apart on a row or
column (**Seismic** mode) or never orthogonally/diagonally adjacent
(**Tectonic** mode). It is a genuine deductive puzzle with a **unique
solution**, so it earns the full note-taking product surface this fork gives its
logic games — pencil marks, an on-screen keypad, Check-&-Save mistake detection
— and, later, an explained hint (a separate change). Its generator is
solver-gated, so a single **byte-match differential** validates generator,
solver and codec together over the bit-identical `random.ts`.

## What Changes

- **`src/native/games/seismic/`** — the game, following the established
  multi-file port shape (`state` / `solver` / `generator` / `render` / `index`).
- **Both game modes** — Seismic (Hakyuu) and Tectonic — sharing one
  candidate-elimination engine; the only difference is the "keep-apart" rule
  (distance N vs 8-neighbour) and the fixed region size (Tectonic is always 5).
- **Regions on the shared `Dsf`** (`engine/dsf.ts`): region membership drives the
  wall layout, so the desc is byte-match portable on union-by-size with **no**
  minimal-element map (region clues are per-cell, not per-region — design D1).
- **The two-part run-length desc codec** — a wall-run/empty-run border encoding
  plus a clue run-length — ported as exact inverses (byte-match surface).
- **The marks-based deductive solver** (naked single, hidden-single-in-region,
  trial-placement) with Easy/Hard grading, and the solver-gated generator
  (fill a full solution → merge singleton cells into regions → strip clues while
  still solvable → verify the difficulty band).
- **Solo-scheme input** — click/keyboard cell select, digit entry capped at each
  region's size, and the **full note-taking UX** (pencil marks, mark-all,
  sticky pencil mode, a pencil-mode indicator, on-screen keypad; playbook
  §3.7/§3.8).
- **`findMistakes`** — Seismic has a unique solution, so it SHALL ship it
  (Check-&-Save depends on it): re-solve from the givens and flag placed cells —
  and crossed-out pencil notes — that contradict the solution (design D6).
- **A byte-match differential** against a new `puzzles/auxiliary/seismic-trace.c`
  (`#include "../unreleased/seismic.c"`), across the presets and a size sweep.
- **Stage 2, on owner acceptance**: add `TS_PORTED` to `puzzle(seismic …)` in
  `puzzles/unreleased/CMakeLists.txt`, delete `puzzles/unreleased/seismic.c`, and
  rebuild.

Explicitly **not** in this change:

- **An explained hint** — an explained Seismic hint is a separate change, exactly
  as for every prior port; the solver written here is the engine it will reuse.
- **Print support** — seismic ships a `game_print`, but this fork deleted the
  print pipeline at the fork and promises no replacement (playbook §1); the print
  routine is not ported (design D8).

## Impact

- Affected specs: new `seismic` capability; `ts-migration` (one of the thirteen
  unreleased games reaches full TS coverage).
- Affected code: new `src/native/games/seismic/`, registration in
  `ts-ported-ids.ts` + `games/index.ts`, new `puzzles/auxiliary/seismic-trace.c`.
- Stage 1 registers Seismic TS-served with the **C/WASM build retained as the
  in-app fallback** (unlike an `unfinished/` game, these thirteen already ship in
  the catalog — playbook §1.1). Stage 2 flips `TS_PORTED` and deletes the C.
- No icon work: `src/assets/icons/seismic-{64,128}d8.png` already exist, and
  `augmentation.ts` already carries the `seismic` config-summary template.
