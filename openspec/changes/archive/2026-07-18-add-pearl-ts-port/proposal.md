# Port Pearl (Masyu) to native TypeScript, landing the shared grid + loopgen leaves

## Why

Only two games remain unported — **loopy** and **pearl** — and both are blocked
on the same two leaf libraries, `grid.c` (the general planar-grid geometry, 3866
lines, 18 tilings) and `loopgen.c` (random loop generation, 540 lines). Porting
those leaves is the gating "next step."

Per the lazy-leaf doctrine (leaves are ported *with their first consumer*, not in
a vacuum), the right way to land them is to port the game that needs the
**smallest slice** of them — and that is **Pearl**. Pearl calls `grid_new` with
**only `GRID_SQUARE`** (verified: `grid_new(GRID_SQUARE, w-1, h-1, NULL)`), whereas
Loopy exercises all 18 tilings, including the aperiodic penrose/hats/spectres that
drag in their own large leaf files. Two facts make the Pearl slice contained:

- **The square grid is purely deterministic** from `(w, h)` — `grid_new_desc`
  only randomises the aperiodic tilings, so the grid leaf needs **no** RNG
  fidelity and **no** floating point (Pearl calls none of `grid_nearest_edge`,
  `grid_find_incentre`, `grid_compute_size`).
- **Pearl touches only `grid_new` + `grid_free`** plus struct-field access, so
  `grid.ts` can ship the four incidence structs, the deterministic square
  generator, and the shared `grid_make_consistent` incidence builder — and defer
  every other tiling to the eventual Loopy port, which extends `grid.ts`.

Pearl itself is a clean port: two **pure-deduction** difficulty tiers (Easy,
Tricky — the solver never guesses or recurses, so the guess-free policy holds),
no `midend_supersede_game_desc`, no editor letters, no float params, no `qsort`
near the desc. A byte-match differential is feasible: the only RNG in generation
is `generate_loop` plus two `shuffle`s, and the grid is a deterministic fixture.

This change therefore delivers **`engine/grid.ts` (square slice) + `engine/loopgen.ts`
as new shared leaves** and the Pearl game on top of them, unblocking Loopy as a
follow-up (a separate change that extends `grid.ts` to the remaining tilings).

## What Changes

- Add **`src/native/engine/grid.ts`** — the shared planar-grid leaf, **square
  slice only**: `Grid`/`GridFace`/`GridEdge`/`GridDot` with reference incidence
  (edges know 2 dots + 2 faces; faces/dots carry clockwise-ordered edge/face
  rings; a null face = the infinite exterior), the deterministic
  `gridNewSquare(w, h)` (each cell a 4-dot face, corners deduped), and the shared
  `makeConsistent` incidence builder (edge dedup by dot-pair, face edge-lists,
  dot edge/face rings, bounding box). Idiomatic TS: `Map`s in place of upstream's
  `tree234` dedup; GC in place of `grid_free`. `tileSize = 20` preserved
  (loopgen divides dot coords by it). The other 17 tilings and the float helpers
  are **out of scope** (the Loopy port adds them).
- Add **`src/native/engine/loopgen.ts`** — `generateLoop(grid, board, rng, bias?)`,
  the RNG-faithful random-loop generator: seed a face, grow a two-colour
  (inside/outside) partition biased by per-face scores held in a sorted
  candidate set, then a random flip pass. Reproduces the exact RNG draw order
  (per-face `randomBits(31)`, the seed `randomUpto`, a per-iteration
  `randomUpto(2)` colour, `shuffle(faceList)`, and the `randomUpto(10)` flip
  pass) with score-ties broken by **face index** (which equals C's
  sequential-allocation pointer order). The `bias` callback contract (consumes no
  RNG; called tentative-set → restore → notify-commit) is preserved so Pearl's
  black-clue bias plugs in.
- Add **`src/native/games/pearl/`** implementing
  `Game<PearlParams, PearlState, PearlMove, PearlUi, PearlDrawState, PearlMistake>`:
  params `w`, `h`, `difficulty` (Easy/Tricky), `nosolve` (allow-unsoluble bool);
  the 8 upstream presets; `validateParams` (w,h ≥ 5, Tricky needs w+h ≥ 11).
- Port the **solver** (`pearl_solve`): pure iterative constraint propagation over
  the `(2w+1)×(2h+1)` edge/square workspace — edge↔square elimination, the
  black-pearl (CORNER) / white-pearl (STRAIGHT) clue deductions, and the
  shortcut-loop detection over a union-find (Tricky adds the premature-short-loop
  rules). Returns 0/1/2 (inconsistent / unique / ambiguous). Used for generation,
  `solve`, and `findMistakes`.
- Port the **generator** (`pearl_loopgen` + `new_clues`): loop → maximal clue set
  → solver-gated uniqueness (+ the Tricky "must fail one level easier" check) →
  greedy clue minimisation. **Byte-faithful RNG draw order**, including the
  upstream `corners`-array duplication quirk (it consumes a `shuffle` sized by the
  straight count and drives removal off the straights) reproduced verbatim, and
  the 5×5-Tricky→Easy downgrade. The `aux` full-solution hex string.
- Port the **desc codec**: RLE clues (lowercase runs of no-clue, `B` = black
  pearl, `W` = white pearl); `validateDesc` checks the decoded count fills the
  grid.
- Port **completion + errors** (`check_completion`): union-find loop
  classification, degree/reciprocity/clue-contradiction error marks (always-on),
  and the completion flag. Ship **`findMistakes`** (boards are uniquely solvable
  by default): re-solve to the unique solution and flag every player line segment
  the solution does not contain — an edge-based mistake overlay like Tracks/Rect,
  distinct from the always-on error marks. Check & Save depends on it.
- Model **input** idiomatically: a left-drag traces a path of grid edges,
  committed as a sequence of line flips; a right-drag / secondary marks "no-line"
  crosses; a keyboard cursor draws lines/marks with modifiers. Move ops are a
  discriminated union (line flip, mark flip, solve), no-op drops suppressed
  locally.
- Render to parity: the two upstream GUI styles — **traditional Masyu** (square
  outlines) and **loopy** (centre dots + inter-cell grid) — selected by an
  `appearance` **preference**; black/white pearls, no-line crosses, the loop
  segments (with drag preview and error recolouring), completion flash. Palette
  index-for-index with the C enum; NARROW_BORDERS geometry.
- **Byte-match differential**: transient `puzzles/auxiliary/pearl-trace.c` records
  preset/seed → {desc, aux} fixtures; a gated test asserts `newDesc` reproduces
  them and the TS solver grades each board at the recorded difficulty.
- Register the game for owner smoke-testing (stage 1). On owner acceptance, flip
  `TS_PORTED`, delete `puzzles/pearl.c` (and the trace harness), and archive
  (stage 2). **`grid.c` and `loopgen.c` stay** — Loopy still consumes them until
  it is ported.

## Impact

- Affected specs: **new `grid` capability** (the shared grid + loopgen leaf) and
  **new `pearl` capability** (the game). No `ts-engine` change (every hook Pearl
  needs — `prefs`, `findMistakes`, drag input — already exists).
- Affected code: `src/native/engine/{grid,loopgen}.ts` (new),
  `src/native/games/pearl/` (new), `ts-ported-ids.ts` + `games/index.ts`
  (registration), `puzzles/auxiliary/{CMakeLists.txt,pearl-trace.c}` (transient
  trace harness), `puzzles/CMakeLists.txt` (`TS_PORTED` at stage 2),
  `puzzles/pearl.c` (deleted at stage 2). Per-puzzle icons: Pearl's PNGs already
  exist from the WASM era (confirm they resolve).
- Explicitly **out of scope**: the other 17 grid tilings, the grid float helpers
  (`grid_nearest_edge`/`grid_find_incentre`/`grid_compute_size`), and the whole
  Loopy port — all deferred to a later `add-loopy-ts-port` that extends
  `grid.ts`. No hint (the deductive solver is a strong Palisade-bar candidate for
  a future `add-pearl-hint`). No app-shell changes.
