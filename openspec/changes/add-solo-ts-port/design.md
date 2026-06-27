# Design: Solo TS port

Context: `solo.c` is the largest game (~5790 lines) and the only Latin-family
member with a **bespoke** solver (no `engine/latin.ts`). It is four composable
variants (standard / jigsaw / X / killer) across two difficulty axes. The
playbook (§1–§7) and the Keen/Towers/Unequal ports are the procedural baseline;
this file records only the Solo-specific decisions.

## D1 — Bespoke solver, not `engine/latin.ts`

Solo's `struct solver_usage` is a richer candidate model than the generic
`latin_solver` cube: it tracks per-row/column/block/diagonal "this digit is placed
here" position grids *and* a per-cell candidate cube, and several techniques
(`solver_set`, the killer cage deductions, the X-diagonal and jigsaw-block groups)
read structure the generic framework doesn't model. Forcing `latin.ts` to carry
all of this would distort it for the four games that depend on its current shape
and gain nothing (Solo is the last latin-family port). **Decision: port Solo's
solver as a self-contained `solo/solver.ts`, keyed off a "constraint group" list
(rows, columns, blocks, + optionally the two diagonals) so X-type and jigsaw fall
out of the same loops rather than special-casing.** Use the C as the logic
reference; write it idiomatically (discriminated difficulty sentinel, typed
arrays, no `dup`/`free`).

## D2 — Variant model: one game, a constraint-group list

`cr = c·r`. Jigsaw is `r === 1` (then `c` is the grid edge length and the blocks
come from `divvy`, not the `c × r` rectangle). The solver and the completion check
both iterate a **list of constraint groups** (each a list of `cr` cell indices
that must hold every digit once): the `cr` rows, the `cr` columns, the `cr`
blocks, and — when `xtype` — the two diagonals. This keeps X-type and jigsaw out of
the technique bodies. Killer adds a *second* independent partition (the cages) with
sum clues, handled by the killer techniques, not the digit-uniqueness groups.

## D3 — Param + desc codec (faithful to upstream)

**Params** `{ c, r, symm, diff, kdiff, xtype, killer }`. Encoding (from
`encode_params`): base is `"{c}x{r}"` when `r > 1`, else `"{c}j"` (jigsaw); then
`"x"` if `xtype`, `"k"` if `killer`; in *full* mode, the symmetry
(`m8`/`m4`/`md4`/`m2`/`md2`/`r4`/`a`; `r2` is the default and omitted) and the
difficulty (`db`/`di`/`da`/`de`/`du`; `dt` = `DIFF_BLOCK` default omitted).
`decode_params` is lenient (eats unknown chars), accepts the legacy `{c}x{r}j`
"jigsaw of a former rectangle" form (`j` after a seen `r` sets `c *= r; r = 1`),
and must round-trip the preset list. `kdiff` is not surfaced in the public
encoding (it is fixed per preset / config) — match upstream.

**Desc** (from `encode_puzzle_desc`): the givens **grid encoding** first; then, for
**jigsaw** (`r === 1`), `","` + the **block-structure** encoding; then, for
**killer**, `","` + the **cage block-structure** + `","` + the **cage-sum grid**
encoding. `encode_grid` is the standard run-length blank/`digit` encoding;
`encode_block_structure_desc` is the run-length internal-edge encoding (same family
as Keen's, transposed read order). `newState` rebuilds the block `Dsf` (and the
cage `Dsf` + per-cage sum for killer). `validateDesc` checks grid length, block
sanity, and (killer) the cage-sum grid.

## D4 — `divvy` as a Solo-local leaf

`divvy_rectangle` (`divvy.c`) partitions a rectangle into `k`-omino-ish connected
blocks; it is **Solo-only** upstream. Port it lazily as `solo/divvy.ts` (idiomatic
typed-array union-find + the retry loop), local until a second consumer appears
(then promote to `engine/` per playbook §2.1). It is RNG-driven, so its draw
sequence must be faithful for a byte-match generator (playbook §4.5). Both
`puzzles/divvy.c` and the local port's C reference are deleted with `solo.c` at
acceptance.

## D5 — Differential: byte-match where feasible, verdict-record where not

Solo's generator is RNG-driven over the bit-identical `random.ts`, so a faithful
port *should* reproduce the desc byte-for-byte for a fixed seed — the Keen/Unruly
precedent (playbook §4.3). The two risks:

1. **Solver-gated minimiser (playbook §4.4).** Givens are removed while the graded
   solver still solves at the target difficulty, so the published givens depend on
   the TS solver reaching C's *exact* verdict on every intermediate board. This is
   the dominant correctness risk and the reason the solver must be ported
   faithfully (including any upstream quirk), not merely "correctly". The
   debugging loop is playbook §4.7.
2. **Any `qsort`/order-dependent step** in generation would break byte-match
   between glibc-trace and wasm (playbook §4.8). If one exists in the killer or
   jigsaw path, that variant's differential records **order-independent solver
   verdicts** (unique-solvable + recorded difficulty) instead.

**Decision: attempt byte-match per variant; record in this file which variants
achieve it and which fall back to verdict-record, after reading the generator.**
Start with standard (most likely byte-match), then jigsaw, X, killer.
`solo-trace.c` is built pure-C (playbook §4.2). _[To be filled in during the
generator port: per-variant byte-match vs verdict-record outcome.]_

## D6 — Rendering: jigsaw borders, killer cages, X shading

- **Block borders** come from the block `Dsf`, not a `c × r` modulo test, so jigsaw
  irregular blocks and rectangular blocks use the same "thick line between cells in
  different blocks" pass (upstream draws block edges from `whichblock`).
- **Killer cages**: dashed inset outlines + the cage-sum label at the cage's
  top-left-most cell (upstream `draw_number`/cage dashes). The cage partition is a
  second `Dsf`.
- **X-type**: shade the two diagonals (upstream tints the diagonal cells).
- Cache: `Int32Array` per-tile key packing digit + pencil bitmask + highlight/
  cursor + given flag; every overlay not in the tile value (mistake, hint later) in
  the diff key via a sidecar (playbook §3.2). Palette index-for-index with the C
  enum (playbook §3.3); check `augmentation.ts` for any solo `paletteOverrides`
  before appending the pencil-indicator colour (playbook §3.7).

## D7 — Pencil-mark UX inherited wholesale (playbook §3.7)

Solo carries all four pencil-mark features exactly as Towers/Keen: `canMarkAll`
(the `M` key fills every empty cell's candidates), sticky pencil mode (default on),
the CapsLock-style corner indicator, and notes-as-`findMistakes`-markings. The
`pencil-keep-highlight` default-on entry in `src/store/settings.ts` already lists
`solo` — match upstream's `newUi` defaults regardless (playbook §3.4 gotcha).

## D8 — Out of scope: hint

The explained `hint()` is a separate change (`add-solo-hint`). The base port ships
`findMistakes` (required for Check & Save) but no hint. This mirrors the
Keen/Towers/Unequal sequencing.

## D9 — Symmetry in the generator

The generator removes givens in symmetry orbits (`SYMM_*` → the set of cells mapped
onto each other). Port `symmetries()` faithfully (it drives both which cells are
removed together and the RNG draw order, so it is byte-match-relevant). All eight
modes (`NONE/ROT2/ROT4/REF2/REF2D/REF4/REF4D/REF8`) are reachable from the config
even though presets only use a few.
