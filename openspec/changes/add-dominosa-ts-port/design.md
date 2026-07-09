# Design — add-dominosa-ts-port

## Context

Dominosa (`dominosa.c`, ~3600 lines) presents an `(n+2) × (n+1)` grid of
numbers, each between `0` and `n`. The player partitions the grid into 2×1
dominoes so that the multiset of number-pairs covered is exactly the full set
of `DCOUNT(n) = (n+1)(n+2)/2` distinct dominoes (`0-0`, `0-1`, …, `n-n`), one of
each. The grid dimensions guarantee `w·h = 2·DCOUNT(n)`, so a complete cover
uses every square. The clue numbers are fixed; the player draws domino
placements (and optional barrier "edges" as annotations).

Closest ported exemplars: **Tents** and **Slant** (recent, self-contained,
graded solver, live error highlighting, `findMistakes`, byte-match differential,
`findloop.ts` consumer). This port mirrors the Galaxies six-file split
(`state`/`solver`/`generator`/`render`/`index`, no game-local `dsf`) and the
packed-`Int32Array` render cache.

## Long-tail risk clearance

- **`midend_supersede_game_desc`**: not used (`set_public_desc` is NULL). ✓
- **Undo via state-string equality**: not used — every move is an explicit
  `D`/`E`/`S` command; `interpretMove` returns a move, `UI_UPDATE`, or `null`. ✓
- **`#ifdef EDITOR` move letters**: none. ✓
- **`printing.c`**: upstream has a print path; not ported (documented fork
  stance). ✓
- **`REQUIRE_RBUTTON`**: right-click is load-bearing (barrier edges), so the
  port reports `needsRightButton = true`. No keypad (`game_request_keys` NULL).

## Decisions

### D1 — Add `FlipDsf` to `engine/dsf.ts` (not a game-local leaf)

The forcing-chain deduction (`deduce_forcing_chain`) uses upstream's **flip
dsf**: a union-find whose classes additionally track a parity bit, so two
placements can be bound as "always together" or "always opposite". The shared
`Dsf` has no flip support, and flip-dsf is a general leaf capability (built into
`dsf.c`), so it lands in `engine/dsf.ts` as a sibling `FlipDsf` class rather
than game-local. Ported faithfully from `dsf_find_root_flip` /
`dsf_path_compress_flip` / `dsf_canonify_flip` / `dsf_merge_flip`: `canonify(n)`
returns `{ root, inverse }`, `mergeFlip(a, b, inverse)` binds them, union by
size with the same tie-break as `Dsf` (second arg wins on tie). The chain IDs it
produces feed **order-independent** set deductions, so the exact root choice is
not byte-match-critical, but faithful porting is cheap and keeps the parity math
correct.

### D2 — State shape: frozen numbers, cloned working fields

Upstream refcounts the clue `numbers` (immutable once made) and clones `grid` +
`edges` per move. The TS state shares the frozen part by reference:

- `numbers: Int32Array` (`w·h`, each square's clue) — **shared frozen** on the
  state, decoded once by `newState`.
- `grid: Int32Array` (`w·h`, each square → its domino partner's index, or
  itself when unpaired) — **cloned per move**.
- `edges: Int32Array` (`w·h`, the `EDGE_L/R/T/B` barrier bits) — **cloned per
  move**.
- `completed`, `cheated`: booleans.

`w = n+2`, `h = n+1` are derived from `params.n`, stored on the state for
convenience.

### D3 — Move representation

Upstream's move strings are `D d1,d2` / `E d1,d2` (with `d1 < d2` and
`d2−d1 ∈ {1, w}`) chained by `;`, optionally prefixed `S` (solve: clear all,
mark cheated). The TS move is a discriminated union, JSON-save-safe, that
carries the same information in one shot:

- `{ type: "domino"; d1; d2 }` — toggle the domino between adjacent squares
  `d1 < d2`. `executeMove` erases any dominoes/edges overlapping the new one,
  exactly as C.
- `{ type: "edge"; d1; d2 }` — toggle a barrier edge between two *empty*
  adjacent squares.
- `{ type: "solve"; dominoes: [d1, d2][] }` — the full solution's domino list
  (from `aux` on a fresh game, else from re-solving); clears the board, sets
  `cheated`, lays each pair.

A single `interpretMove` click emits one `domino`/`edge` move (never a chain),
matching upstream. The `solve` move carries the whole placement list so the
midend applies it atomically.

### D4 — The solver is the engine behind three consumers

`solver.ts` ports `solver_scratch` and the nine `deduce_*` functions
faithfully, plus `run_solver(sc, maxDiff)` returning `0` (a domino with no
placement — impossible), `1` (every domino exactly one placement — unique), or
`2` (some domino with >1 — ambiguous/stuck). It is the single engine behind:

- the generator's difficulty gate (`newDesc`),
- `solve()` (run at max difficulty, read out the forced placements),
- `findMistakes` (below).

The scratch is an idiomatic object graph — `SolverDomino` / `SolverPlacement` /
`SolverSquare` classes with array cross-links — rather than C's parallel
`snewn` arrays, but the deduction logic (placement-list winnowing via
`ruleOutPlacement`, the bitmask set analysis, the parity/forcing-chain graph
work) is ported operation-for-operation so the verdict matches C on every board.
The `qsort`s in the solver (`squares_by_number_cmpfn`, the two
`forcing_chain_*_cmp`) use total or tie-order-irrelevant orderings, so a plain
stable `.sort()` preserves the verdict (§4.3 — the sorts feed set-membership
grouping, not the desc byte-stream).

### D5 — `findMistakes` vs the live clash highlight

Two distinct red signals:

- **Clash** (upstream, always-on): when the same domino *value* is placed
  twice, both copies render with `COL_DOMINOCLASH` (dark red fill). Computed in
  `redraw` from the placed grid. Kept faithfully.
- **`findMistakes`** (fork Check-&-Save contract): re-solve to the unique
  solution (`run_solver` at max difficulty; if not unique, no mistakes) and
  return both cells of every player-placed domino the solution does not contain.
  A blank square or a barrier edge is never a mistake. Rendered as an inset red
  outline (the cross-game mistake styling), a `DF_MISTAKE` cache bit distinct
  from `DF_CLASH`, and — per §3.2 — part of the render diff key so it repaints
  and clears on the frame it is computed.

### D6 — Palette index-for-index, mistake overlay appended

`colours()` mirrors the C enum indices 0–7 (BACKGROUND, TEXT, DOMINO,
DOMINOCLASH, DOMINOTEXT, EDGE, HIGHLIGHT_1, HIGHLIGHT_2). `augmentation.ts` has
no `paletteOverrides` for dominosa, but index parity is the standing rule and
costs nothing. The fork mistake-overlay colour is appended at index 8
(`COL_MISTAKE`).

### D7 — NARROW_BORDERS geometry

The web C build defines `NARROW_BORDERS` (`cmake/platforms/webapp.cmake`), so
`BORDER = −DOMINO_GUTTER = −⌊TS/16⌋` (a slight negative inset that lets the
domino gutters bleed to the canvas edge), *not* the desktop `¾·TS`. `COORD(x) =
x·TS + BORDER`, `FROMCOORD(px) = ⌊(px − BORDER + TS)/TS⌋ − 1`, `computeSize =
{ w·TS + 2·BORDER, h·TS + 2·BORDER }`. Parity is with what the browser shows;
grep confirmed the define (§3.2).

### D8 — Params / config

Params are `n` (max face number) and `diff` (Trivial/Basic/Hard/Extreme/
Ambiguous). Encoded `"{n}"`, full form appends `"d{t|b|h|e|a}"`; a legacy bare
`"a"` suffix decodes to Ambiguous. `describeParams` returns
`{ "max-number": String(n), difficulty: <0-based index> }` matching an
`augmentation.ts` template `"Order {max-number}, {difficulty:Trivial|Basic|Hard|Extreme|Ambiguous}"`.
`paramConfig` is a numeric `max-number` item + a difficulty choice.
`validateParams` enforces `n ≥ 1`, an area/overflow bound, and a valid
difficulty. Difficulty affects only generation (and the difficulty cap).

## Byte-match feasibility

`random.ts` is bit-identical to `random.c`. The generator's RNG draws, in
order per attempt: `dominoLayout` (its own `shuffle` + per-BFS `shuffle`), then
one of `alloc_trivial` (`shuffle` + per-domino `random_upto(2)`),
`alloc_try_unique` (two `shuffle`s + per-domino `random_upto(2)` where both
orientations are legal), or `alloc_try_hard` (a location `shuffle`, a
doubles `shuffle`, a vals `shuffle`, and per-placement `random_upto(2)` flips),
looping until the solver grades the board at exactly the target difficulty. No
`qsort` feeds the desc; no float grid. So a byte-for-byte desc match is
feasible (§4.3), the strong bar; the differential also grades each C board with
the TS solver (§4.4 — the generator is solver-gated). If a subtle solver
divergence makes byte-match intractable within the session, the fallback is the
§4.4 verdict-agreement bar on C-generated boards (documented if taken), but the
generator's own correctness still requires the faithful solver either way.
</content>
