# add-rome-ts-port

## Why

**Rome (Nikoli's *Roma*) is one of the 13 third-party `puzzles/unreleased/`
games this fork is porting to native TypeScript.** It is a complete, polished
logic puzzle — fill every square with an arrow so that following the arrows
always reaches a circled goal, and no outlined region repeats an arrow. Unlike
the truly *unfinished* upstream experiments, Rome's whole implementation
(generator, four-to-eight-rung deductive solver, drag-and-keyboard input,
rendering, pencil marks) is finished and it already ships as a C/WASM catalog
game today.

So this is an ordinary catalog port on the path to retiring the C engine: port
it idiomatically to TS, register it TS-served with the C/WASM build staying as
the fallback, and — on owner acceptance — flip `TS_PORTED` and delete the C.
Rome is a genuine **uniquely-solvable logic puzzle with pure-deduction
difficulty tiers**, so it ships `findMistakes` and is a candidate for a later
explained hint (a separate change, per every prior port).

## What Changes

- **`src/native/games/rome/`** — the game, following the established multi-file
  port shape (`state` / `solver` / `generator` / `render` / `index`).
- **The desc codec**: the region-border run-length encoding (walls as digit
  runs, non-walls as letter runs) plus `,` plus the clue-grid run-length
  (empty runs as letters, `U`/`D`/`L`/`R`/`X` arrow/goal literals), ported as
  exact inverses — a byte-match surface.
- **The deductive solver** — Rome's validity check (region disjoint-set +
  arrow-connectivity to detect off-grid arrows, duplicate arrows and loops) and
  the eight deduction rules across `EASY` / `NORMAL` / `TRICKY`. All three tiers
  are pure deduction (no backtracking), satisfying the guess-free policy.
- **The generator**: fill 1×1 arrow regions avoiding clusters, randomly merge
  region borders, then remove redundant clues — solver-gated at the target
  difficulty and gated *out* of the tier below, ported faithfully over the
  bit-identical `random.ts`.
- **`findMistakes`** — Rome has a unique solution and a real rule-violation
  check, so it flags off-grid arrows, duplicate arrows in a region, and arrows
  in a loop; Check & Save hard-blocks on them (design D5).
- **Drag-and-keyboard input, pencil marks** — grab a square and drag a
  direction to place an arrow (right-drag / Space for a pencil mark), or move a
  keyboard cursor and place; pencil marks are part of state (design D4).
- **A byte-match differential** against a new `puzzles/auxiliary/rome-trace.c`,
  asserting the TS generator reproduces the C desc byte-for-byte per seed.
- **Stage 2, on owner acceptance**: add `TS_PORTED` to the `puzzle(rome …)`
  entry in `puzzles/unreleased/CMakeLists.txt`, delete `puzzles/unreleased/rome.c`,
  and rebuild.

Explicitly **not** in this change:

- **An explained hint** — a Palisade-grade "why this arrow is forced" hint is a
  compelling follow-up but, as with every port, its own change.
- **Printing** — Rome has a real `game_print`, but this fork ships no print
  feature (printing.c was dropped at fork); not ported, consistent with all
  prior ports.

## Impact

- Affected specs: new `rome` capability; `ts-migration` (one more `unreleased/`
  game reaches full TS coverage).
- Affected code: new `src/native/games/rome/`, registration in
  `ts-ported-ids.ts` + `games/index.ts`, new `puzzles/auxiliary/rome-trace.c`.
- Stage 2 flips `TS_PORTED` and deletes `puzzles/unreleased/rome.c`.
- No icon work: `src/assets/icons/rome-{64,128}d8.png` already exist, so the
  `puzzle-icons` obligation is already met.
