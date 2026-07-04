# Design — Separate TS port

## Context

Separate is upstream-**unfinished**: solver + generator exist, the frontend does
not. So this is a *finish*, not a transliteration — the interaction model,
rendering, win condition, `findMistakes`, and presets are ours to design. The one
hard constraint is the desc format (the generator emits `wh` letters `A+grid[i]`)
and the solver/generator logic, which we port faithfully.

## Decisions

### D1 — Interaction model: Palisade-style wall drawing

Separate asks the player to **partition** the grid into `k`-ominoes. That is
exactly Palisade's task (partition into equal-size regions), and Palisade already
ships a mature wall-drawing frontend in this fork: a three-valued edge model
(wall / no-wall-mark / unknown, `borderflag` byte per cell, both sides recorded
per edit), edge-nearest-click input, a half-grid keyboard cursor, live region
error highlighting, and a hint system. Palisade even generates via the same
`divvy_rectangle`. So Separate reuses the Palisade data model and input/render
skeleton almost verbatim, differing only in:

- **cell content**: a letter `0..k-1` (drawn `A..`), not a wall-count clue;
- **win condition**: every wall-bounded region is size `k` **and** contains each
  letter exactly once (equivalently: size `k` and `k` distinct letters), with no
  wall interior to a region (the Palisade "no stray border" rule);
- **live errors**: a region over-size, or holding a duplicate letter.

Alternatives rejected: a drag-to-group/paint model (Galaxies-style association)
is worse for free-form ominoes and would not reuse the Palisade infra or the
future hint. This is not a new engine pattern.

### D2 — Promote `divvy` to `engine/divvy.ts`

`divvy_rectangle` already has two local TS copies (`solo/divvy.ts`,
`palisade/divvy.ts`, functionally equivalent). Separate is the 3rd consumer, so
per playbook §2.1 ("second consumer ⇒ promote") it moves to `engine/divvy.ts`.
Keep the Solo copy's shape (it carries the `MAX_DIVVY_ATTEMPTS` loud-fail cap and
the byte-match RNG-faithfulness notes); repoint all three games; delete both
locals. Behaviour is identical, so Solo's and Palisade's byte-match differentials
remain green.

### D3 — Solver: the two DSF deductions, run to a fixpoint

Port `solver_attempt` faithfully: a DSF over squares plus a `disconnect[]`
component-pair matrix and per-component `contents[]` (which letters, and where).
Two rules alternate to a fixpoint:

1. **Disconnect on shared letter** — adjacent squares in distinct components
   whose components share a letter can never be one region → mark disconnected.
2. **Forced single extension** — a component below size `k` with exactly one
   legal neighbour to grow into → connect them.

Returns solved (all components size `k`) / progressed / stuck. The generator
guarantees the board is uniquely solvable by exactly this solver, so running it
to completion on the desc's letter grid yields *the* unique partition. `solve()`
and `findMistakes` convert that partition to walls (a wall on every edge between
two different components). The `contents` "add two, add one" trick and the
`disconnect` row/column merge on `solver_connect` are ported as ordinary typed
arrays / boolean matrices (idiomatic, not `void *`).

### D4 — Generator and byte-match differential

Port `generate`: `divvyRectangle(w,h,k)` → per-omino square lists → repeatedly
fill each omino with a shuffled set of the `k` letters (respecting `gen_lock`
squares the solver has already depended on) and re-solve; keep on solver success,
retry with an updated lock on partial progress, abandon the divvy on repeated
failure. Every RNG draw (the `divvy` draws, the per-omino `shuffle`) is over the
bit-identical `random.ts`, and the retry control flow is seed-deterministic, so
the emitted desc is **byte-for-byte reproducible** — a gated byte-match
differential (playbook §4.3) is the bar: `newDesc(p, randomNew(seed)).desc ===
fixture.desc`, fixtures recorded from a transient `separate-trace.c`. This also
transitively proves `divvy.ts` byte-match under its new home.

### D5 — Generator performance

Upstream warns the generator is "_very_ slow": it generates 5×5n5 / 6×6n4
readily, 6×6n6 with effort, 7×7n7 "only with serious strain." Presets stay in the
comfortable range; default 5×5n5. Benchmark the TS port on a fixed seed and, if a
preset is unacceptable in the browser, drop it (documented). The retry loops are
capped (`MAX_DIVVY_ATTEMPTS`, and a bounded outer regenerate) so a divergence
fails loudly rather than hanging (playbook §4.6).

### D6 — Long-tail risks: none bite

- **supersede**: Separate's desc is the fixed letter grid and never changes →
  no `midend_supersede_game_desc` hook needed.
- **undo via state-string equality**: `interpretMove` returns `null` on a no-op
  edit (locally decidable, like Palisade) → not needed.
- **editor move-letters / printing**: none.

### D7 — Preferences / config

Params are `w`/`h`/`k` exactly like Palisade → reuse `dimensionParamConfig` + a
`region-size` (`k`) item and the matching `describeParams` keys. No per-game
preferences (no pencil marks, no display options upstream).
