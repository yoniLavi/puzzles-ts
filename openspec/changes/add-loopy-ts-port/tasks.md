# Tasks — add-loopy-ts-port

## 1. The dline invariant, before anything that depends on it

Design D3a: if `grid.ts`'s ring orderings and the dline index formulas disagree,
every dline deduction silently indexes the wrong pair, the solver quietly gets
weaker, and — because the generator is solver-gated — the puzzles differ. Nothing
crashes. This is the worst failure shape in the port, so it is pinned first.

- [ ] 1.1 Implement `dlineIndexFromDot(g, dot, i)` and
      `dlineIndexFromFace(g, face, i)` (`2*edge.index + (edge.dot1 === dot ? 1 : 0)`)
      with the two bit accessors (at-least-one / at-most-one).
- [ ] 1.2 Tier-1 test across **all 18 tilings**: the two formulas agree — for
      each face `f` and index `i`, `dlineIndexFromFace(f, i)` is the same slot as
      `dlineIndexFromDot(f.dots[i], j)` for the corresponding `j`. This is what
      upstream's `DEBUG_DLINES` blocks existed to eyeball.
- [ ] 1.3 Tier-1 test: `dlineIndexFromDot` is injective over each dot's ring, and
      every index lands in `[0, 2*numEdges)`.

## 2. Params, grid table, state and desc codec

- [ ] 2.1 The single `LOOPY_GRIDS` table (design D6e) collapsing upstream's four
      macro-generated parallel arrays: `{ title, type: GridType, amin, omin }`
      indexed by **Loopy's** ordering. Carry upstream's "do not insert except at
      the end" warning — **the array index is the wire format** (D4).
- [ ] 2.2 Difficulty table `{ id, title, char }` (`e`/`n`/`t`/`h`), and
      `encodeParams`/`decodeParams` (`%dx%dt%dd%c`; note `decodeParams` resets
      `diff` to Easy up front but does **not** reset `type`).
- [ ] 2.3 `validateParams` in upstream's order: grid-type range → `amin` on both
      dimensions → `omin` on at least one → delegate to `gridValidateParams`.
      Per-type minima live **here**, not in the geometry (D4).
- [ ] 2.4 `paramConfig` (width, height, grid-type choices, difficulty choices).
- [ ] 2.5 Presets — the **two-level** menu with its "More..." submenu, and the
      `h`-before-`w` title quirk (D6e). Confirm the app shell renders a nested
      preset menu; if it does not, that is a real finding to surface, not to
      quietly flatten.
- [ ] 2.6 State: clues (`Int8Array`, `-1` = none), lines (`Uint8Array`,
      `YES=0/UNKNOWN=1/NO=2` with `opp(x) = 2-x` — **load-bearing arithmetic**,
      D3b), `lineErrors`, `exactlyOneLoop`, `solved`, `cheated`.
- [ ] 2.7 Desc codec: the mixed-base run-length clue encoding (`0-9`/`A-Z` for
      clues, `a-z` for runs of 1–26 empties, flushing at `> 25` **before** the
      increment), and the `<gridDesc>_<clueDesc>` composition.
- [ ] 2.8 `validateDesc`, with the face count **memoised** per
      `(type, w, h, gridDesc)` (D3c) — upstream rebuilds a whole grid every call,
      which for the aperiodic tilings is now a full generation plus a trim.

## 3. The solver

Four rungs to a fixpoint, no backtracking at any difficulty (`solve_game_rec` is
misnamed). Port against the C one rung at a time.

- [ ] 3.1 `SolverState` as a class with `clone()` — `dlines` only from
      `DIFF_NORMAL`, `linedsf` only from `DIFF_HARD`, both typed `| null` so the
      compiler enforces the difficulty guards (D3b). No `free`.
- [ ] 3.2 `solverSetLine` with its four count caches (per dot and per face), and
      `mergeDots`/`mergeLines` over the shared `Dsf`/flip-dsf.
- [ ] 3.3 Test-only cache verifier (upstream's `check_caches`): the incremental
      counts equal a fresh recount. Catches a `solverSetLine` bookkeeping slip at
      the point of damage rather than three rungs later.
- [ ] 3.4 `trivialDeductions` (EASY) — per-face and per-dot rules, including the
      `order - clue == no + 1` adjacent-unknown-pair refinement.
- [ ] 3.5 `dlineDeductions` (NORMAL) — the face half with its `mins`/`maxs`
      interval matrices over **one hoisted scratch buffer** sized to the grid's
      true maximum face order (D3b: `MAX_FACE_SIZE 14` evaporates), then the dot
      half. Both `DIFF_TRICKY`-gated blocks live here and nowhere else.
- [ ] 3.6 `linedsfDeductions` (HARD), including **`faceSetallIdentical`
      returning a constant `false`** (design D3.1) with the comment explaining
      why, plus a regression test asserting it returns `false` *even when it
      mutates*.
- [ ] 3.7 `parityDeductions` — keep `totalParity` as a **`number`**, not a
      boolean, and keep the truthiness test, so the negative-modulo path matches
      C for free (design D3.2). Comment that the path is unreachable on any board
      the game constructs, and why.
- [ ] 3.8 `loopDeductions` (EASY) and the `SOLVER_AMBIGUOUS` distinction — the
      Solve button fills those in, the generator must **not** count them as fair
      deductions (`gameHasUniqueSoln` requires exactly `SOLVER_SOLVED`).
- [ ] 3.9 `solveGameRec`'s fixpoint with the `(thresholdDiff, thresholdIndex)`
      pair and the return-value protocol (each rung returns the *lowest* rung
      that could notice what it did, or `DIFF_MAX` for no progress). This is a
      speed optimisation that is **load-bearing for which puzzles generate** —
      port it exactly.
- [ ] 3.10 Replace the three solver `goto`s with the shapes named in the survey:
      extract `trivial_deductions`' `goto found` search into a helper returning
      the pair or `null`; `goto finished_loop_deductionsing` becomes an early
      return.

## 4. The generator

- [ ] 4.1 `addFullClues` over the already-ported `generateLoop` — **no bias
      callback** (upstream passes `NULL`), then derive every clue from the
      face-colour boundary. Note `FACE_COLOUR(null)` is white, which is what makes
      boundary clues come out right.
- [ ] 4.2 `removeClues` — shuffle the face list, then one full solver run per
      face, keeping a blanking only if the board stays uniquely solvable.
- [ ] 4.3 `newDesc` with **both** retry loops nested as design D1 specifies:
      an outer bounded loop over `gridNewDesc` → `gridNew` catching
      `GridTrimmedAwayError`, and the existing inner clue-generation retry
      (upstream's `goto newboard_please`) unchanged inside it. **The nesting
      order is not negotiable** — inverting it re-derives the grid on every
      failed clue attempt and changes the RNG stream.
- [ ] 4.4 The too-easy rejection: reject if the board is solvable one difficulty
      rung lower, restarting at the **clue** stage (not the grid stage).
- [ ] 4.5 Unit-test D1's retry directly: a Penrose size/seed that degenerates
      must produce a valid board rather than throwing, and the retry must be
      deterministic (same seed → same board), so shared game IDs still reproduce.
      No ordinary differential fixture reaches this path — the C aborts there.

## 5. Input, moves and completion

- [ ] 5.1 Move model: a discriminated union of ops (design D5), not upstream's
      move string. `{ kind: "set"; edge; state } | { kind: "solve" }`.
- [ ] 5.2 `interpretMove`: the coordinate conversion (**`Math.trunc`**, not
      `Math.floor` — grid coords are negative for several tilings), then
      `gridNearestEdge`, then `nextLineState(button, old, stylus)` as an explicit
      table (design D5a). Set `wantsStylusModifier: true` and strip the modifier
      in the game, since Loopy genuinely reads `MOD_STYLUS`.
- [ ] 5.3 `autofollow` (off / fixed / adaptive) as a `Set<number>`-accumulating
      walk from both endpoints, terminating when it revisits the clicked edge.
      This is cleaner **and safer** than upstream's `goto autofollow_done`, whose
      label placement disagrees with its own comment — so it needs a differential
      test on a closed-loop click specifically.
- [ ] 5.4 `executeMove` — an absolute *set*, not a toggle, so re-application is
      idempotent. Then `checkCompletion` on every move.
- [ ] 5.5 `checkCompletion`: the dot-dsf component classification
      (NONE/LOOP/PATH/SILLY/EMPTY), the hard vertex errors, the
      largest-sensible-component highlighting, `exactlyOneLoop`, and the win
      condition. Upstream explains at length why `findloop.c` is the wrong tool
      here — keep that reasoning in the port.
- [ ] 5.6 Prefs: `draw-faint-lines` (boolean, default true) and `auto-follow`
      (choices off/fixed/adaptive, default off). Drop the env-var
      `legacy_prefs_override`.
- [ ] 5.7 `textFormat` — square grids only. Resolve the param-dependent
      `canFormatAsText` question the cheapest way that works (design D6d) and
      record which way it went.

## 6. Rendering

- [ ] 6.1 Palette in C enum order (`BACKGROUND, FOREGROUND, LINEUNKNOWN,
      HIGHLIGHT, MISTAKE, SATISFIED, FAINT`), with **luminance-aware** derivation
      for `LINEUNKNOWN`/`FAINT` (design D6c) and the divergence recorded in the
      code.
- [ ] 6.2 `computeSize`/`setTileSize` over `gridComputeSize`, multiplying
      **before** dividing (upstream's rounding-error note) and using the
      **`NARROW_BORDERS`** arm — `BORDER = DOT_RADIUS`, 1–3 px, not `tilesize/2`
      (settled in D6a).
- [ ] 6.3 `redraw`: the diff key (per edge `lineErrors ? ERROR : lines[i]`, per
      face `clueError`/`clueSatisfied`) and the five-phase colour z-order
      (`FAINT, LINEUNKNOWN, FOREGROUND, HIGHLIGHT, MISTAKE`) as pre-bucketed
      lists. **Drop** the bbox/clip/16-object incremental machinery (D6a).
- [ ] 6.4 Clue text via `gridFindIncentre`, with the screen-position cache
      **invalidated in `setTileSize`** (design D6b — upstream never does, which is
      a latent bug under this app's `ResizeController`).
- [ ] 6.5 The clue error/satisfied rule, including the `exactlyOneLoop`
      special case that treats UNKNOWN as NO once the loop closes (upstream's
      30-line comment explains why: players who never right-click would otherwise
      get neither a flash nor an error highlight).
- [ ] 6.6 The three-segment completion flash over `FLASH_TIME = 0.5`.
- [ ] 6.7 Tier-2.5 render-scenario tests + snapshots, covering at least one
      square, one hex-family, one dodecagonal and **both** aperiodic families —
      this is the first time these tilings render anywhere.

## 7. Differential

- [ ] 7.1 `puzzles/auxiliary/loopy-trace.c` on the established pattern; add its
      `cliprogram()` line.
- [ ] 7.2 Fixture matrix covering **all 18 grid types** (design D6) — breadth
      across tilings matters more than depth per tiling, because this change is
      also the first real exercise of `extend-grid-tilings` and
      `add-aperiodic-tilings`. Avoid the Penrose sizes/seeds that abort the C
      (an oracle limitation, not a port limitation — task 4.5 covers those).
- [ ] 7.3 `loopy-differential.test.ts`: TS `newDesc` reproduces the C desc
      byte-for-byte **and** the TS solver grades every C board at exactly the
      recorded difficulty.

## 8. Registration and stage 1 close-out

- [ ] 8.1 Register in `ts-ported-ids.ts` + `games/index.ts` (TS-served).
      `puzzles/loopy.c` stays — stage-2 gate.
- [ ] 8.2 Full gate green (`tsc -b --noEmit` → biome → `vitest run` →
      `vite build`).
- [ ] 8.3 `openspec validate add-loopy-ts-port --strict`.
- [ ] 8.4 **Dev-verify in the browser across several tilings**, not just square.
      Changes 1 and 2 shipped with no user-visible surface and were accepted on
      that basis; their handoffs both say the first real acceptance test of the
      tilings is Loopy. Budget for tiling bugs surfacing here — when something
      looks wrong in one tiling only, suspect the tiling.
- [ ] 8.5 Update `docs/porting/game-port-playbook.md`.

## 9. Stage 2 — on owner acceptance only

- [ ] 9.1 Flip `TS_PORTED` in `puzzles/CMakeLists.txt`.
- [ ] 9.2 Delete `puzzles/loopy.c` and the now-unused subtree: `grid.c`,
      `loopgen.c`, `penrose.c`, `penrose-legacy.c`, `hat.c`, `spectre.c`,
      `tree234.c`, plus `auxiliary/{grid-trace.c, loopy-trace.c,
      spectre-tables-dump.c}` and their `cliprogram()` lines.
- [ ] 9.3 `rm -rf build/wasm/` and rebuild — loopy in the catalog, no
      `loopy.wasm`. Icons already exist from the WASM era.
- [ ] 9.4 Archive, then commit port + archive together.
- [ ] 9.5 Write `NEXT-STEPS.md` handing off to `retire-c-engine` (the orphaned
      leaves, `webapp.cpp`, the Emscripten build, the worker's WASM path, the
      `USE_TS_LEAVES` machinery — and `divvy.c`'s own `separate` blocker).
