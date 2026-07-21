# add-salad-ts-port

## Why

**Salad is a Latin-square family puzzle already shipping in this fork's catalog as
C/WASM**, one of thirteen third-party puzzles bundled from the
[x-sheep/puzzles-unreleased] collection under `puzzles/unreleased/`. Porting it to
native TypeScript continues retiring the C runtime and — because Salad is a
*pseudo-Latin-square-with-holes* puzzle — reuses the shared `engine/latin.ts`
machinery the family already leans on (Towers/Unequal/Keen/Solo/Group), so most of
the solver and the whole generator trick come almost free.

Salad is also a genuinely nice enhancement target: it is a uniquely-solvable logic
puzzle, so it earns `findMistakes` + Check & Save, the full pencil-mark UX, and the
on-screen keypad — the deliberate-divergence product values this fork ships and the
C/WASM build cannot. An explained hint is a *separate, later* change.

## What Changes

- **`src/native/games/salad/`** — the game, in the established multi-file port shape
  (`state` / `solver` / `generator` / `render` / `index`), implementing both of
  Salad's game modes: **ABC End View** (letters, border clues) and **Number Ball**
  (numbers, ball/cross grid clues).
- **Solver as a `latin.ts` consumer** (playbook §2.2): Salad's `usersolver`
  (hole-sync + letters-border-clue + hole/circle counting deductions) + a trivial
  `valid` callback, driven through the shared `latinSolver`. Two difficulties —
  **Normal** and **Extreme** — both guess-free.
- **The pseudo-Latin-square trick**: a full order-`o` Latin square from
  `latinGenerate(o)`, where symbols above `nums` become holes/crosses — so the
  "some squares empty" rule reuses the shared generator unchanged (design D2).
- **The mode-dependent desc codec** (run-length block encoding, byte-match surface)
  and params codec (`%dn%d%c` + optional `d%c`).
- **Input**: click-to-select (left = ink, right = pencil), middle-click circle/hole
  cycle, keyboard entry of letters/numbers, `X`/`O` empty/not-empty markers,
  arrow-key cursor, `Enter` to toggle pencil, `M` to fill all candidates — a
  discriminated-union move model, not the C's `R`/`P`/`M`/`S` strings (design D6).
- **`findMistakes` + the full pencil-mark UX + the on-screen keypad** — Salad has a
  unique solution and pencil marks, so all three are part of "done" (playbook §3.5,
  §3.7, §3.8).
- **A byte-match differential** against a new `puzzles/auxiliary/salad-trace.c`,
  covering both modes, both difficulties, and every preset — validating the
  generator, solver and codec together over the bit-identical `random.ts`.
- **Registration** in `ts-ported-ids.ts` + `games/index.ts` (stage 1; C/WASM stays
  the fallback).
- **Stage 2, on owner acceptance**: add `TS_PORTED` to `puzzle(salad …)` in
  `puzzles/unreleased/CMakeLists.txt`, delete `puzzles/unreleased/salad.c`, rebuild.

Explicitly **not** in this change: an explained hint (a separate
candidate-elimination-hint change, per every prior latin-family port), and any port
of `game_print` (deleted at fork; no TS replacement is promised).

## Impact

- Affected specs: new `salad` capability.
- Affected code: new `src/native/games/salad/`, registration in `ts-ported-ids.ts`
  + `games/index.ts`, new `puzzles/auxiliary/salad-trace.c`.
- Stage 2 flips Salad to `TS_PORTED` and deletes `puzzles/unreleased/salad.c`.
- No icon work: `src/assets/icons/salad-{64,128}d8.png` already exist, and the
  `augmentation.ts` `salad` config summary already renders.

[x-sheep/puzzles-unreleased]: https://github.com/x-sheep/puzzles-unreleased
