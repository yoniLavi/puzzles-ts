# Loopy port — where this leaves off

`add-aperiodic-tilings` is change **2 of 3** delivering Loopy, the last unported
game. This note is the handoff for the next session; the strategic context is in
[`AGENTS.md`](../../../AGENTS.md) and the decisions are in this change's
[`design.md`](./design.md) (see especially **Findings during implementation**).

## What now exists

`grid.ts` is **complete at all 18 tilings**. `puzzles/grid.c` has no remaining
capability that the TS port lacks.

New in this change:

- `src/native/engine/tilings/{hat,spectre,penrose}.ts` + their `-grid.ts` glue,
  and two **generated** table modules (`hat-tables.ts`, `spectre-tables.ts`)
  with their generator scripts checked in beside them.
- `grid-desc.ts` — `gridNewDesc` / `gridValidateDesc`.
- `grid-trim.ts` — `gridTrimVigorously`.
- `n-times-root-k.ts` — exact `round(n·√k)`, shared by penrose (k=5) and
  spectres (k=3).

**The contract change 3 should build on:** `gridNewDesc` is the only function in
the module that consumes randomness; `gridNew` is a pure deterministic function
of `(type, width, height, desc)`.

## Change 3 — `add-loopy-ts-port`

Facts established by the `loopy.c` survey in change 1, still worth not
re-deriving:

- **No backtracking at any difficulty.** `solve_game_rec` is misnamed — four
  deduction rungs run to a fixpoint. `DIFF_TRICKY` isn't its own solver; it only
  unlocks extra branches inside `dline_deductions`. This fits the shared
  [`runDeductionFixpoint`](../../../src/native/engine/deduction-fixpoint.ts)
  runner, and makes Loopy a strong Palisade-bar candidate for a later
  `add-loopy-hint`.
- **Three byte-parity traps, two of them upstream bugs a clean port would
  silently "fix"** — changing which boards generate:
  1. `face_setall_identical` sets `retval = false` and never reassigns it, so it
     always reports "no progress" even when it changed the board.
  2. `parity_deductions` receives `(clue - yes) % 2`, which is **negative** when
     `clue < yes`. C's truncating `%` yields `-1`, which is truthy, so the XOR
     always gives `LINE_YES`. TS `%` truncates identically, so a *literal* port
     matches — but the hygiene fix `((x % 2) + 2) % 2` breaks it.
  3. Two deliberate `switch` fallthroughs in `interpret_move` (non-stylus
     YES/NO fall into the `'u'` case).
- **No keyboard input and no drag** — mouse clicks only, so `gridNearestEdge` is
  the entire input path. There is an `autofollow` preference (off/fixed/adaptive).
- `loopy.c` includes `tree234.h` but never uses it — don't port a dependency for it.
- `MAX_FACE_SIZE 14` is a hard assert in the solver.
- **Loopy has its own grid enum**, ordered differently from `GRIDGEN_LIST` and
  frozen into saved game IDs. Keep both orderings and the mapping between them
  (change 1 design D9). Per-type *minimum* sizes live there too (`amin`/`omin`),
  not in the geometry.

Stage 2 of that change deletes `puzzles/loopy.c` and its now-unused subtree
(`grid.c`, `loopgen.c`, `penrose.c`, `penrose-legacy.c`, `hat.c`, `spectre.c`,
`tree234.c`, and `auxiliary/grid-trace.c`).

### One thing change 3 MUST decide: the empty-Penrose-patch policy

This change found an **upstream crash reachable from Loopy's UI**. Small Penrose
patches can come out empty — the seed triangle lands outside the bounding box,
so the BFS never runs — and upstream then aborts in `dsf_new(0)`. Observed: P2
fails at width 3 for every height tried; P3 fails at 4×4 on some seeds. Full
detail, including the single-letter-desc diagnostic tell, is in `design.md`
under "Findings during implementation", and in the comment block above
`aperiodic_fixtures` in `puzzles/auxiliary/grid-trace.c`.

The geometry layer's part is done: `gridTrimVigorously` throws
`GridTrimmedAwayError` instead of aborting. **Loopy must decide what to do with
that.** The failure is **per-seed, not per-size** — the same `(type, w, h)`
succeeds or fails depending on the draw — so:

- Raising the minimum size is the *easy* fix but is not obviously correct: it
  forbids sizes that work for most seeds.
- Catching the error and regenerating with a fresh seed is the more faithful
  fix, and matches how the rest of the collection handles a generator that
  occasionally fails to produce a usable board.

`loopy.c:713-717` currently accepts 3×3 for both Penrose variants
(`GRIDLIST` has `amin = omin = 3`), so doing nothing reproduces the crash.

### Carry these forward

- **Never short-circuit a weighted random draw.** All three aperiodic tilings
  call `randomUpto` unconditionally even for single-entry candidate lists
  (hat's `PARENTS_T`, spectre's `poss_J`/`poss_L`). This is now rule (d) in the
  [porting playbook](../../../docs/porting/game-port-playbook.md).
- **Split a differential when the thing under test consumes randomness.**
  Recording `(seed → desc)` and `(desc → geometry)` as separate assertions is
  what let a red test mean "wrong draw order" or "wrong geometry" but never
  "somewhere in 2,400 lines". Loopy's generator has the same property, only
  more so; do the same there.
- **The parallel-agent pattern worked again.** Three tilings, each agent owning
  an exclusive file set, with the only shared edit a dispatch switch written up
  front against an agreed contract — so contention was a compile error, never a
  silent wrong answer. Stub files + a live-but-failing differential gave each
  agent its own feedback loop from the first minute.
- **Verify a delegated test's oracle.** One agent pinned a sha256 of a full
  incidence dump. That would have been circular if computed from its own output;
  it turned out to be genuinely C-derived, but it cost nothing to re-derive it
  from `grid-trace` and confirm. (It is now an FNV-1a in the test, because
  `tsconfig.json` sets `"types": []` and `src/` must not acquire Node types.)

## Acceptance status of this change

Like change 1, **there is nothing to acceptance-test**: no game renders an
aperiodic tiling until Loopy lands, so there is no user-visible surface to
drive. Assurance comes from:

- the index-exact C differential — 23 fixtures, 231 assertions, covering both
  RNG fidelity (seed → desc) and geometry (desc → full incidence);
- the tier-1 tests per tiling, including the table-structure invariants the
  differential only checks implicitly;
- the full gate (`tsc` → `biome ci` → 3714 tests → `vite build`).

**The first real acceptance test of this code is still Loopy itself.** If
something is subtly wrong in a tiling, that is where it will show up.
