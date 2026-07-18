# Design — add-pearl-ts-port

Only the non-obvious decisions; the mechanical port follows the playbook. Pearl
is the vehicle for landing two shared leaves (`grid.ts`, `loopgen.ts`), so the
first decisions are about scoping those.

## D1 — Grid leaf: square-only slice now, Loopy extends it later

`grid.c` is 3866 lines across 18 tilings, but Pearl calls **only**
`grid_new(GRID_SQUARE, …)` + `grid_free`, plus direct struct-field reads. So
`engine/grid.ts` ships the four incidence structs, `gridNewSquare`, and the
shared `makeConsistent`, and **nothing else** — no other tiling, and none of the
float helpers (`grid_nearest_edge`, `grid_find_incentre`, `grid_compute_size`,
`grid_validate_*`, `grid_new_desc`) which Pearl never calls. The eventual
`add-loopy-ts-port` extends `grid.ts` with the remaining tilings (and pulls in
penrose/hat/spectre leaf ports for the aperiodic ones). This mirrors how
`engine/latin.ts` landed a slice with Towers and grew with Unequal/Keen — the
shared shape is stable and cross-game, which is exactly when the "refactor as you
go" directive says to put it in `engine/` from the start rather than game-local.

Structs are **classes with reference incidence** (an edge holds its two `GridDot`
and two `GridFace` refs; a null face ref is the infinite exterior), not the C
index-into-arrays. GC replaces `grid_free`/`refcount` — a `Grid` is immutable
after construction and shared by reference. Upstream's `tree234` dedups (shared
corner points; edges by dot-pair) become `Map`s.

## D2 — The grid is deterministic; final tie-breaks are index-order

The square grid is a pure function of `(w, h)` — `grid_new_desc` returns NULL for
every periodic grid, so **no RNG and no float** enter the Pearl grid slice. That
removes byte-match risk from the grid entirely; the leaf's tier-1 tests assert
structural invariants (counts, incidence), not a corpus.

Where `makeConsistent` and loopgen order things by a `tree234` whose comparator
ultimately ties on **pointer address**, we tie on **array index** instead. This
is faithful, not a divergence: C allocates faces/edges/dots sequentially with no
frees during a build, so their pointers are monotonic in index — pointer order
*is* index order. (Same reasoning the other ports used to replace pointer-keyed
orders with index-keyed ones.)

## D3 — `loopgen.ts` byte-match: reproduce the RNG order, tie-break by index

`generate_loop` is the dominant RNG consumer and the crux of Pearl's byte-match.
The draw order is fixed and must be reproduced exactly:

1. `randomBits(31)` per face `i = 0..num_faces-1` → the `random` field of each
   face's score (the *primary* deterministic tie-break — a 31-bit field, so score
   ties are decided by it, not by the pointer fallback below);
2. `randomUpto(num_faces)` → the seed WHITE face;
3. per main-loop iteration, `randomUpto(2)` → the candidate colour (the `bias`
   callback then *chooses among* candidates but draws **no** RNG; with a null
   bias it takes the sorted set's first element);
4. `shuffle(faceList)` once (faceList = `0..n-1`);
5. one `randomUpto(10)` per flippable face in the single random flip pass (the
   earlier growth passes draw nothing).

The white/black candidate sets are sorted by **(score desc, `random`, index)**.
A `SortedMultiset` (or a small sorted structure) under that comparator, reading
the best element, reproduces C's `index234(set, 0)`. The `index` final tie-break
replaces C's pointer tie-break per D2; because `random` is 31 bits, that final
tie-break is essentially never reached — see D9 for the theoretical edge.

## D4 — Reproduce the upstream `corners`-array quirk verbatim

`new_clues`' clue-removal setup has a genuine upstream bug (`pearl.c` ~1357-1386):
the `corners` array is filled from `clues[i] == STRAIGHT` (not `CORNER`), and the
removal branches index `straights[--ncornerpos]` (not `corners[...]`). Net effect:
`corners[]` duplicates the straight positions and is never read, **but
`shuffle(corners, ncornerpos, …)` still consumes RNG sized by the straight
count**, and removal is driven entirely off `straights`. This is the §4.4-class
trap: porting the "intended" logic changes the RNG stream and diverges the desc.
Reproduce the two `shuffle`s (straights then the mislabelled "corners") and the
straight-driven removal exactly, with a loud comment. The 5×5-Tricky→Easy
downgrade (`new_clues` start) is ported likewise.

## D5 — Solver: two pure-deduction tiers, guess-free

`pearl_solve` has **no recursion and no guessing** — it is iterative constraint
propagation on a `(2w+1)×(2h+1)` workspace (square states as colour-pair
bitfields, edge states connected/disconnected/unknown). Easy runs edge↔square
elimination + the CORNER/STRAIGHT clue deductions + finished-loop detection;
Tricky additionally runs the premature-short-loop rules (gated
`if (difficulty == DIFF_EASY) goto done`). Both tiers are therefore
guess-free, satisfying the guess-free-generation policy without an Unreasonable
tier. The shortcut-loop detection uses a union-find — the shared `engine/dsf.ts`
`Dsf` (Pearl reads it only for connectivity + component size, never a root as an
element, so it is byte-match-safe with no root-identity discipline).

## D6 — `findMistakes`: player line segments absent from the unique solution

Pearl generates uniquely-solvable boards (the default `nosolve = false`), so it
ships `findMistakes`. Upstream already draws always-on error marks
(`check_completion`: degree > 2, non-reciprocal links, clue contradictions) —
those stay, drawn live. `findMistakes` is the distinct Check & Save divergence:
re-solve from the clues to the unique solution's line grid; if not uniquely
solvable (a `nosolve` board), return none; otherwise flag every **line segment
the player has drawn that the solution does not contain** — a definite mistake (a
*missing* solution segment is merely incomplete). This is the edge-based shape
Tracks and Rectangles already use; render recolours the flagged segments with a
`COL_MISTAKE` folded into the per-cell cache word (playbook §3.2).

## D7 — Move model: a discriminated union over grid edges

C emits `;`-joined tokens `F l,x,y` (flip a line bit), `M l,x,y` (flip a no-line
mark), plus `S` (solve), `L`/`N`/`R` (set/clear/replace) and `H` (autosolve
hint). We model `PearlMove` as an op list — `{ op: "line"; x; y; dir }` (flip the
loop segment leaving `(x,y)` in direction `dir`), `{ op: "mark"; x; y; dir }`
(flip the no-line cross), `{ op: "solve" }` — since a single drag commits a *path*
of edge flips as one move. `interpretMove` builds the path (the drag tracer,
respecting existing marks as barriers and the loop-closure degree rule);
`executeMove` applies the ops purely, rejects laying a line over a mark (upstream
returns NULL → we throw), and recomputes completion + errors. A drag that changes
no edge yields no move (local no-op suppression; no state-string undo). The `H`
hint is upstream's in-place autosolve, modelled as a `solve` op.

## D8 — Two GUI styles via the `appearance` preference

Upstream carries two renderers selected by `gui_style` (env `PEARL_GUI_LOOPY` /
the `appearance` pref): **traditional Masyu** (square cell outlines, a full
border) and **loopy** (centre dots + inter-cell grid lines, thin border). Port
both, selected by the single `appearance` `prefs` item (kw `appearance`, choices
`traditional`/`loopy`, default traditional — matching upstream's struct default).
The border width and the grid drawing branch on the style, so `computeSize` and
`redraw` read it; a pref that changes only rendering triggers a full repaint via
the midend's drop-drawstate-on-`setPreferences` path (playbook §3.4), so no
special handling is needed. `PREFERRED_TILE_SIZE = 31`; NARROW_BORDERS applies.

## D9 — Differential scope, and the one theoretical non-determinism

Byte-match desc (+ aux) over fixed seeds spanning both difficulties, presets, a
non-preset size, and a `nosolve` case; solver-verdict-agreement asserted inline
(decode each C board, grade with the TS solver). The generator's data-dependent
branches are all `pearl_solve` verdicts during minimisation, ported faithfully,
so a divergence in the RNG order (loopgen or the two shuffles) or solver power
shows up as a mismatched desc.

**One theoretical edge:** loopgen's candidate order ties on the 31-bit `random`
field and then on index (per D2/D3). If two candidate faces ever share both the
same score *and* the same 31-bit random value, C's next tie-break is pointer
order, which our index order reproduces only if the faces were allocated in index
order — which they are. So even that case is faithful; the note exists only to
record that the collision is astronomically rare and, if a fixture ever surfaced
one, the fallback is the Galaxies-D7 solver-agreement bar rather than byte-match.
Choose fixture seeds that byte-match (verify at record time).

## Documented skips (checked against the C)

- **`midend_supersede_game_desc`** — not used.
- **State-string undo** — not used; no-op moves suppressed locally.
- **`#ifdef EDITOR`** — Pearl has none.
- **`game_request_keys`** — NULL upstream; no keypad hook.
- **`MOD_STYLUS` / `MOD_NUM_KEYPAD`** — Pearl reads no raw button bits (the midend
  strips `MOD_STYLUS`); the secondary (mark) action is reachable on touch via the
  long-press → right-button affordance (playbook §3.8c). No `needsRightButton`
  flag upstream (`flags = 0`).
- **Float params** — none (Pearl's params are all integer/bool).
- **`encode_ui`/`decode_ui`** — NULL upstream (the drag path is transient).
- **`game_print`** — dropped with `printing.c` at the fork; not ported.
- **The other 17 grid tilings + grid float helpers** — deferred to
  `add-loopy-ts-port` (out of scope here, by design D1).
- **Hint** — deferred to a future `add-pearl-hint` (the deductive solver is a
  strong Palisade-bar candidate: narrate each forced segment/cross).
