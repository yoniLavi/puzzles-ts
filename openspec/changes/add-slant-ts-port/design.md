# Design — add-slant-ts-port

## D1: `findloop` is a shared engine leaf, ported in full

Slant needs `findloop_run` + `findloop_is_loop_edge` for its live loop-error
highlighting. The algorithm (Tarjan bridge-finding, the non-recursive
linked-list variant) also computes everything `findloop_is_bridge` needs
(subtree sizes, component roots), and bridges/dominosa/loopy/tracks — all
still ahead in the migration — consume that same module. So the port lands
as `src/native/engine/findloop.ts` (not game-local) and exposes the full
surface in one pass: `findLoops(nvertices, neighbours)` returns
`{ anyLoop, isLoopEdge(u,v), isBridge(u,v) }`. The neighbour callback is an
idiomatic `(vertex: number) => Iterable<number>` instead of C's stateful
`neighbour_fn_t` re-entry protocol (`vertex >= 0` starts iteration, `-1`
continues). Deterministic, no RNG — byte-match is unaffected by the shape
change. `puzzles/findloop.c` is NOT deleted at stage 2: it still has five C
consumers.

## D2: Byte-match differential (playbook §4.3/§4.4)

`new_game_desc` is deterministic given the seed: one `shuffle` of the square
indices, one `random_upto(rs, 2)` per non-forced square during filled-grid
generation, one `shuffle` of the clue indices, then a two-pass solver-gated
clue-removal loop and a regenerate-if-too-easy check. No `qsort`, no wall
clock. The TS port must reproduce the C desc byte-for-byte for the same
seed; the differential asserts that via `describeDescDifferential` across
all 6 presets plus non-preset sizes.

Byte-match is solver-gated (§4.4): the clue-removal loop keeps a removal
only while `slant_solve` still returns 1 at the target difficulty, and the
outer loop regenerates while the puzzle is solvable one level down. The TS
solver must therefore replicate C's exact deductive power, including:

- the per-difficulty technique gating (equivalence tracking, dead-end
  avoidance, slashval and the whole vbitmap pass are all disabled at Easy);
- the deduction sweep order (clue-point pass, then square pass, then
  vbitmap pass, restarting after any progress) and the exact in-pass
  bookkeeping (the `meq`/`mj1`/`mj2` single-pair equivalence tracking around
  each clue point, including its "inhibit further tracking once one pair is
  found" rule);
- **release-build `fill_square` semantics**: upstream's "already filled with
  the opposite value" and "would make a loop" early-outs `return false`
  only under `SOLVER_DIAGNOSTICS`, which the shipped build (and the trace
  harness) never defines — in release builds `fill_square` never fails and
  will overwrite. Port the release semantics verbatim (with a comment);
  porting the diagnostics semantics would change solver verdicts.
- side arrays indexed by DSF canonical root (`exits`, `border`, `slashval`):
  the shared `engine/dsf.ts` already matches `dsf.c`'s root choice (tie →
  second merge arg), which these reads depend on.

## D3: Move/state model

Idiomatic per the playbook: `SlantState` holds `params`, a shared frozen
`clues` object (`Int8Array` of −1/0–4 over the `(w+1)×(h+1)` vertex grid,
shared across states like C's refcounted `game_clues`), an `Int8Array`
`soln` (−1 `\`, 0 blank, +1 `/`), the derived error arrays (D5), `completed`,
`usedSolve`. Moves are a discriminated union:
`{ type: "set", x, y, v: -1 | 0 | 1 }` (the C `\`/`/`/`C` letters) and
`{ type: "solve", cells }` (the C `S;…` compound applied atomically, setting
`usedSolve`). `interpretMove` returns `null` for out-of-grid clicks and for
a keyboard `\`/`/`/backspace that wouldn't change the square (C's
`MOVE_NO_EFFECT`), so no history entry is created. Left-click cycles
blank→`\`→`/`→blank, right-click the reverse, subject to the `left-button`
swap preference; cursor keys + select/select2 mirror that at the cursor.

## D4: findMistakes semantics

Boards this fork generates are uniquely solvable at Hard or below.
`findMistakes(state)` re-solves the clues with the full Hard solver; if that
yields a unique solution, flag every square whose player diagonal differs
(`kind: "square"`). Blank squares are never mistakes. Wrong squares render
with the existing red error styling via a drawstate sidecar in the cache
diff key (§3.2). If the board isn't uniquely solvable (hand-typed desc),
return `[]` — same degradation as Galaxies.

## D5: Live errors and completion

`executeMove` recomputes the error state exactly as C's `check_completion`:

- **Loop edges** (`ERR_SQUARE` per square): run `findLoops` over the vertex
  graph induced by the placed diagonals; a diagonal on a loop edge is red.
- **Clue vertices** (`ERR_VERTEX` per vertex): a clue with degree > clue or
  anti-degree > 4−clue is red.
- **Grounded squares** (`BORDER_EDGE` per square): a vertex DSF seeded with
  the whole border merged; a diagonal in the border component is "grounded"
  (cannot be part of a loop) and fades when the `fade-grounded` pref is on.

C overloads one `W*H` byte array with two different strides (`y*W+x` for
vertex+square errors, `y*w+x` for grounded). The TS port keeps three typed
arrays (`loopErrors` `w*h`, `vertexErrors` `W*H`, `grounded` `w*h`) — same
information, no stride punning. Completion = no errors and no blank square;
the `completed` flag latches as upstream.

## D6: Rendering

Direct port of the C per-tile model: the drawstate keeps a `(w+2)×(h+2)`
`Int32Array` (tiles −1…w × −1…h — the border ring draws border clue circles
and corner dots) packing the C bit flags (slashes, neighbour corner dots,
per-corner clue-error bits, ERRSLASH, GROUNDED, CURSOR, FLASH) plus one new
MISTAKE bit for the findMistakes overlay (21 bits < 31), diffed against the
last-drawn copy — this *is* the playbook cache-key pattern, and because the
whole word is rebuilt each frame from state + ui + the overlays, every
overlay is in the diff key by construction (no sidecar needed). Palette index-for-index with the C enum (0 background, 1 grid, 2 ink,
3 slant1, 4 slant2, 5 error, 6 cursor, 7 filled-square, 8 grounded);
`augmentation.ts` has no slant `paletteOverrides`, so nothing to preserve
beyond the convention. Chessboard slash colouring (`(x^y)&1` swaps
slant1/slant2), 3-line thick diagonals, clue circles with parity-coloured
rings, the win flash is the C 3-phase background blink; `anim_length` 0.
The engine paints nothing; the `!ds.started` branch fills the background.

## D7: Params UI

`describeParams` emits the exact keys the existing `augmentation.ts`
template `"{width}x{height} {difficulty:Easy|Hard}"` reads: `width`,
`height`, `difficulty` (numeric 0/1). `paramConfig` mirrors upstream
`game_configure`: `dimensionParamConfig()` plus a difficulty choice,
validated by `validateParams` (min 2×2). Decode keeps upstream leniency
(bare `NxM`, square `N`, trailing `d<char>` difficulty).

## D8: Documented skips

- **No keypad** — upstream `game_request_keys` is NULL.
- **No `needsRightButton`** — upstream flags are 0; the right button is a
  reverse-cycle convenience, the game is fully playable with left only.
- **No printing** (deleted at fork), **no supersede**, **no editor
  letters**, **no `current_key_label`** (no TS-engine surface; same skip as
  all prior ports).
- **`SLANT_SWAP_BUTTONS` / `PUZZLES_SHOW_CURSOR` env overrides** — legacy
  env plumbing with no web equivalent; the swap lives in the pref.
