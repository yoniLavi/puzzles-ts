# add-aperiodic-tilings

## Why

This is **change 2 of 3** delivering Loopy, the last unported game. Change 1
(`extend-grid-tilings`) landed everything periodic and deterministic; `gridNew`
today throws for the four aperiodic types with an explicit pointer at this
change.

The split between the two was drawn at the **RNG boundary** (change 1, design
D1): a periodic grid is a pure function of `(type, width, height)`, so its
differential needed no seed plumbing and a failure had exactly one possible
cause — wrong geometry. Everything that consumes randomness, produces or
validates a grid `desc`, or needs `grid_trim_vigorously` was deliberately held
back to here.

Loopy's presets span all 18 tilings, so the four aperiodic ones are not
optional: without them change 3 cannot ship.

## What Changes

- **`src/native/engine/tilings/hat.ts`** — the hat aperiodic monotile
  (~891 lines of C logic + ~2,391 lines of lookup table). A 14-state serpentine
  kite enumerator; the simplest control flow of the three, so it goes first and
  establishes the table-transcription approach.
- **`src/native/engine/tilings/spectre.ts`** — the spectre monotile (~599 +
  ~1,380 table lines). Mutual recursion between the hex-level and
  spectre-level step functions. Its tables are X-macro expansions in the C and
  so SHALL be flattened by a script, not transcribed by hand.
- **`src/native/engine/tilings/penrose.ts`** — Penrose P2 (kite/dart) and P3
  (thick/thin rhombs), ~894 lines with no external table file. Logically the
  hardest: genuine recursion, a BFS with a visited set, and the half-tile
  pairing that emits each rhomb exactly once.
- **The four aperiodic `gridNew*` generators** in `grid.ts`, replacing today's
  `throw`, plus their callback plumbing into the three tiling modules.
- **`gridNewDesc(type, width, height, rng)` / `gridValidateDesc(...)`** — the
  full desc round-trip. Change 1 implemented only the triangular arm and the
  "every other type rejects a non-null desc" rule; this change generalises it
  to the aperiodic types, which is where the RNG actually enters.
- **`gridTrimVigorously`** — called only by these four generators. Upstream
  uses an `O(numDots²)` dense matrix (millions of entries for a 10×10 spectre
  patch); this port SHALL use a `Map` keyed on the ordered dot-index pair
  (change 1, design D8).
- **`n_times_root_k`** (`misc.c:569`) — an exact bitwise `round(n·√k)`, written
  that way *specifically* to avoid FP rounding. It SHALL NOT be substituted
  with `Math.round(n * Math.sqrt(k))`.
- **`gridComputeSize`** extended to the four aperiodic types.
- **Differential coverage** extended over the existing
  `puzzles/auxiliary/grid-trace.c` harness (retained by change 1 for exactly
  this) rather than a new harness.

Explicitly **not** in this change:

- **`penrose-legacy.c` is deliberately dropped.** It is reached only via
  `if (*desc == 'G')` — the pre-rewrite desc format, which
  `grid_new_desc_penrose` never emits. It is also the only float-bearing tiling
  code. A `'G'` desc SHALL be rejected.
- Loopy itself, and the C deletions — both are change 3.
- Spectre's 3-colouring sidecar, which serves a dev harness only.

## Impact

- Affected specs: `grid` (one requirement MODIFIED to drop the aperiodic
  caveat; several ADDED for the aperiodic tilings, the desc round-trip and
  trimming).
- Affected code: new `src/native/engine/tilings/{hat,spectre,penrose}.ts` plus
  their generated table modules; `grid.ts`, `grid-tilings.ts` extended;
  differential fixtures extended.
- No game behaviour changes — no game consumes any aperiodic tiling until
  change 3. The 14 periodic tilings and Pearl's square path must stay
  byte-identical; that is this change's regression bar.
- `puzzles/{grid,penrose,penrose-legacy,hat,spectre}.c` are **not** deleted
  here — `grid.c` remains Loopy's dependency and the trace harness is still
  needed. All go in change 3's stage 2.

## Acceptance note

Like change 1, this change has **no user-visible surface**: no game renders an
aperiodic tiling until Loopy lands. Its assurance therefore comes from the
index-exact C differential and the gate, not from a human driving it — and, as
change 1's handoff records, **the first real acceptance test of this code is
Loopy itself**. Any subtle tiling error surfaces there.
