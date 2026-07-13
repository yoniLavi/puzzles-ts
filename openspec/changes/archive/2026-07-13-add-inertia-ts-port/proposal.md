# Port Inertia (inertia.c) to native TypeScript

## Why

Inertia is the next port in the top-down migration and the first **graph-search**
game in the collection: you slide a ball across a grid, unable to stop until it
hits a wall or a stop-square, collecting every gem without touching a mine. It is
neither a Latin-family game nor a deduction game — its "solver" is two graph
algorithms (a double BFS over *square × direction* space for the generator, and an
approximate travelling-salesman tour for `solve_game`) — so it exercises a part of
the `Game` contract the recent logic ports have not: animation along a slide path,
a blitter sprite, a status bar, and upstream's **solution-following aid** (Solve
installs a route into the state, a hint arrow points along it, and the game
re-solves automatically when the player deviates).

It trips none of the long-tail risks: no `midend_supersede_game_desc`, no editor
move letters, no undo-via-state-string equality, no keypad, no leaf-library
dependency (it uses only `shuffle` from the already-ported RNG). The generator's
only RNG draws are `shuffle`, and the one `qsort` in the file lives in
`solve_game`, which never feeds the desc — so a strict **byte-match differential**
(§4.3) is feasible.

## What Changes

- Add `src/native/games/inertia/` implementing
  `Game<InertiaParams, InertiaState, InertiaMove, InertiaUi, InertiaDrawState>`:
  a `w × h` grid of blanks, gems, mines, stop-squares and walls with a single
  ball. A move is one of 8 directions; the ball slides until a wall blocks the
  next square or it lands on a stop, collecting any gem it passes over and dying
  on any mine it touches. The game is won when every gem is collected. Params are
  `w`, `h`; the three upstream presets (10×8, 15×12, 20×16).
- Port the **generator** (`gengrid`): fill the grid 1/5 each with walls, stops and
  mines plus one start and the rest blank, `shuffle` it, run the gem-candidate
  solver, reject if there are too few candidates or if some square is
  geometrically too far from the nearest candidate (a `maxdist` threshold that
  relaxes every 50 failures), then place `wh/5` gems on a shuffled subset of the
  candidates. Byte-match-critical.
- Port the **gem-candidate solver** (`find_gem_candidates`): a BFS over
  `w·h·8` square+direction nodes run twice — once forward from the start, once
  backward to it. A square can hold a gem only where some direction is both
  reachable-from and reachable-to the start, because a square you can only enter
  heading north but never leave heading north is not on any round trip.
- Port the **route solver** (`solve_game`): build the move graph (stationary
  vertices at every move endpoint, *directed* vertices at every gem you can slide
  through), then grow a tour by repeatedly splicing in a round trip to the nearest
  uncollected gem (four BFSes per gem), then iteratively replace redundant
  sections with shortest paths until the tour stops shrinking. Encodes the tour as
  a direction sequence.
- Port the **solution-following aid** faithfully: the `solve` move installs the
  computed route into the game state rather than jumping to the end; the player's
  ball is drawn with a yellow arrow pointing along the next step of the route;
  Enter/Space executes that step; and if the player deviates, `executeMove`
  re-solves from the new position and installs the new route (or discards it if
  the position is unsolvable). The route is discarded on death or on collecting
  the last gem.
- Render to full parity: bevelled walls, mines, ringed stop-squares, diamond gems,
  the green ball (a red "splat" polygon when dead), the yellow route arrow, the
  grid lines, the slide animation (the ball interpolates along the path and gems
  vanish as it passes them, timed `sqrt(distance) × 0.1s`), and the two flashes —
  red on death, highlight on winning.
- Status bar (`wantsStatusbar`): `Gems: N`, `DEAD!` when dead, `COMPLETED!` when
  finished, an `Auto-solver used.` prefix once the route aid has been used, and a
  `Deaths: N` running tally kept on the Ui (incremented only on a fresh
  self-inflicted death, so redo and undo never re-count one).
- Input: the 8 direction keys (arrow keys for the orthogonals, numeric keypad for
  all eight), a left-click in the octant of the target direction, and
  Enter/Space to follow the installed route. Moves into an adjacent wall, and all
  moves while dead, are rejected.
- Byte-match differential: a transient `puzzles/auxiliary/inertia-trace.c` records
  preset/seed → desc fixtures; a committed gated test asserts `newDesc` reproduces
  them exactly and that the TS gem-candidate solver and route solver both accept
  every C-generated board.
- Register the game for owner smoke-testing (stage 1). On owner acceptance, flip
  `TS_PORTED`, delete `puzzles/inertia.c` (and the trace harness), and archive
  this change (stage 2).

## Impact

- Affected specs: **new `inertia` capability**.
- Affected code: `src/native/games/inertia/` (new),
  `src/native/games/ts-ported-ids.ts` + `src/native/games/index.ts`
  (registration), `puzzles/auxiliary/{CMakeLists.txt,inertia-trace.c}` (transient
  trace harness), `puzzles/CMakeLists.txt` (`TS_PORTED` at stage 2),
  `puzzles/inertia.c` (deleted at stage 2).
- **No `findMistakes`** — Inertia has no wrong-but-legal state to detect (every
  reachable position is legal; a death is undone, not corrected), so per playbook
  §3.5 the hook is correctly omitted and Check & Save degrades to plain
  Quick-save. **No `hint()`** — the game's own route arrow is already a
  first-class step-by-step guide, and a TSP tour has no Palisade-grade "why" to
  narrate; a Hint button would merely duplicate Solve. No keypad, no pencil marks,
  no supersede, no editor letters, no preferences. No app-shell changes.
