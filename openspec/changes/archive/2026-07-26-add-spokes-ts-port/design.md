# Design — add-spokes-ts-port

## Context

Spokes (© 2014 Lennard Sprong) is one of the 13 third-party puzzles in
`puzzles/unreleased/`. Unlike upstream's `unfinished/` experiments, its frontend
is complete and it **already ships as a C/WASM catalog game in this fork**, so the
two-stage parity gate applies in full: stage 1 registers the TS engine with the
C/WASM build as a live fallback, and stage 2 (owner-accepted) flips `TS_PORTED`
and deletes the C.

The whole game turns on one representation the C header states: **a hub is eight
spokes, each a 2-bit state** (`HIDDEN` = no spoke possible, `EMPTY` = undecided,
`LINE` = drawn, `MARKED` = ruled out), over the eight compass directions
(`DIR_RIGHT … DIR_TOPRIGHT`, with `INV_DIR(d) = d ^ 4`). A spoke and its inverse on
the neighbour are always kept in lock-step (`spokes_place`). The clue on a hub is
the number of `LINE` spokes it must end with; a clue of `0` means "no hub here" (a
hole). Everything below — codec, solver, generator, input, rendering — follows from
that model.

**Long-tail risk checklist (playbook §1) — clean, with one note.** Spokes'
`set_public_desc` is `NULL` and it does not supersede its desc; it compares no
stringified state for undo (no-op toggles are suppressed *locally* in
`interpretMove`, D5); it has no `#ifdef EDITOR` move letters. The one thing to flag:
**Spokes has a real `game_print`** (it is not a stub, unlike Sokoban/Slide). This
fork deleted the print pipeline, so the port does **not** carry printing and makes
no print promise — consistent with fork policy; recorded so it isn't mistaken for a
dropped feature.

## Decisions

### D1 — Hub/spoke model + the flat one-char-per-cell desc codec

State is two parallel typed arrays over `w*h` cells:

- `numbers` — the clue per cell (`Int8Array`; `0` = a hole/no-hub, `1..8` = the
  required line count).
- `spokes` — the packed hub per cell (`Uint16Array`; eight 2-bit spokes). `GET_SPOKE`
  / `SET_SPOKE` become small helpers; `spokes_place(i, dir, s)` sets the spoke and its
  inverse on the neighbour.

The `blank_game` seeding (hide the three spokes that point off each edge) and
`new_game`'s hole-processing (a `0`/`X` cell hides its own spokes, its neighbours'
spokes pointing at it, and the diagonals that would graze it) port directly.

**The desc codec is trivial and is *not* run-length.** A description is exactly
`w*h` characters, one per cell in row-major order: a clue digit `'0'`–`'8'`, or `'X'`
for a hand-authored hole (which `new_game` reads as clue `-1`, then normalises to a
`0` hole). The generator only ever emits digits (`numbers[i] + '0'`). `validateDesc`
reproduces the C: reject a char that is neither `'0'`–`'8'` nor `'X'`, and
distinguish "too short" (fewer than `w*h` chars) from "too long" (trailing data).
Idiomatically this is a `string` of length `w*h`; no block/run machinery is needed
(contrast Slide/Sokoban) — which also makes the byte-match differential (D9) a plain
string compare.

### D2 — The tiered deductive solver, `dsf`-backed validator

Port `spokes_solve` idiomatically. It runs a fixpoint of deduction rules, gated by a
difficulty level (`EASY` / `TRICKY` / `HARD`, plus the internal `DIFF_LIMITED` =
`EASY − 1`, a bounded pass capped at `ACTION_LIMIT = 4` actions):

- **`spokes_solver_ones`** — mark every spoke joining two clue-`1` hubs (connecting
  them would strand a pair), skipped when the whole grid is exactly two hubs.
- **`spokes_solver_full`** — per hub: if `available − marked == clue`, draw every
  remaining `EMPTY` spoke as `LINE`; if `lines == clue`, `MARK` the rest.
- **`spokes_solver_diagonal`** — mark the `EMPTY` diagonal that would cross an existing
  `LINE` diagonal in the same cell corner.
- **`spokes_solver_attempt`** (Tricky/Hard) — bounded contradiction look-ahead: try a
  spoke as `LINE` (or `MARKED`), recursively solve at a *lower* tier, and if that
  yields `STATUS_INVALID`, commit the opposite. Tricky recurses at `DIFF_LIMITED`
  (depth-bounded), Hard at `DIFF_EASY`.

`spokes_validate` returns `INVALID` / `INCOMPLETE` / `VALID` by counting lines/marks
per hub, checking for crossing `LINE` diagonals, and — via a **`dsf`** over the
line-connected hubs plus a per-set count of still-drawable lines (`spokes_find_isolated`)
— detecting a closed-off set that can never reach the rest (`INVALID`) or a fully
connected, fully satisfied board (`VALID`). This is the sole leaf dependency (D10).

Model the discriminated status as a union/enum, not C's magic `0/1/2`; the recount
scratch (`nodes` / `lines` / `marked` / `dsf` / `open`) becomes an object the solver
allocates once, not `snew`/`sfree`.

### D3 — The Tricky/Hard tiers are deterministic contradiction reasoning, not guessing

`spokes_solver_attempt` is trial-and-error, which invites the guess-free question
(`feedback_guess_free_generation`). It is **not** a guessing tier: it is exhaustive,
deterministic contradiction look-ahead — try a value, and if it provably leads to an
invalid board, the *opposite* value is forced. A human solves the same way ("this
line would isolate a group, so it must be marked"). It draws no randomness and reaches
a forced conclusion, so it satisfies the pure-deduction bar the way other Tatham
solvers' recursion tiers do. Port it faithfully at all three difficulties; do not
weaken the harder tiers or rename them. (Recorded because a reviewer scanning for
`attempt`-style recursion should not read it as a guess-free violation.)

### D4 — Generator: fill-everything then solver-gated strip, byte-match portable

`spokes_generate` (via `new_game_desc`) is solver-gated and RNG-faithful:

1. `spokes_generate_hubs` draws **every** horizontal and vertical line and **one
   random diagonal per interior cell** — the sole RNG surface is one
   `random_upto(rs, 2)` per interior cell (choose `\` vs `/`) — recording every drawn
   line in a `temp` list.
2. `shuffle(temp)` — the only other RNG draw.
3. Walk the shuffled lines; for each, tentatively remove it (keeping every hub at
   ≥ 1 line), recompute the clue numbers, clear, and re-solve at the target
   difficulty. Keep the removal only if the board stays uniquely solvable
   (`STATUS_VALID`); otherwise restore the line.
4. Final acceptance gate: the puzzle must be solvable at `diff` **and not** at
   `diff − 1` (so it genuinely needs its difficulty), unless `diff == EASY`.
   `new_game_desc` loops `spokes_generate` until this holds.

The resulting desc is just the per-hub `LINE` counts rendered as digits. Because the
generation path is a pure function of the seed and the solver's verdict on each
intermediate board, the desc reproduces **byte-for-byte** over the bit-identical
`random.ts` (D9). Reproduce the RNG draw order exactly (the per-cell diagonal choice,
then the single `shuffle`); an "optimised" candidate selection that skips or reorders
draws silently diverges the desc (playbook §4.3).

### D5 — Input: drag / right-drag / keyboard on the half-grid

`interpret_move` ports to a discriminated-union move built directly:

```ts
type SpokesMove =
  | { kind: "set"; index: number; dir: number; state: SpokeState } // toggle one spoke
  | { kind: "solve"; spokes: ReadonlyArray<{ index: number; dir: number; state: SpokeState }> };
```

- **Drag** (`LEFT_BUTTON`/`RIGHT_BUTTON` → `…_DRAG` → `…_RELEASE`): the press records
  the start hub on the ephemeral `Ui`; each drag event computes the pointer's angle
  from the start hub (`atan2`, snapped to one of eight directions with a dead-zone
  radius) and updates `drag_end`, emitting `UI_UPDATE`; the release toggles the spoke
  between the two hubs — left toggles `LINE`⇄`EMPTY`, right toggles `MARKED`⇄`EMPTY` —
  **unless** it is a `LINE` diagonal whose crossing partner is already a `LINE`
  (rejected). A release that resolves to no valid toggle returns `UI_UPDATE`, not a
  move (local no-op suppression — the long-tail "state-string undo" phantom does not
  apply).
- **Keyboard**: an arrow-key cursor lives on the `(3w−2)×(3h−2)` half-grid (hubs on
  even sub-cells, direction pickers between them); `CURSOR_SELECT` draws a line,
  `CURSOR_SELECT2` marks. Reuse `engine/pointer.ts` cursor helpers where they fit.

Coordinate conversion uses the shared `fromCoord` (playbook §2.3): `BORDER = 0` for
Spokes (D7), so it is a plain floor into the tile; hubs are centred in their tiles
(`TOCOORD(x) = x*tilesize + tilesize/2`). All drag state lives on the `Ui`, never on
the state.

### D6 — `findMistakes`: flag drawn lines the unique solution forbids

Spokes is uniquely solvable — the generator only accepts a board the tiered solver
deduces to a single `STATUS_VALID` completion — so it **ships `findMistakes`** per the
edge-drawing §3.5 pattern (Rectangles/Tracks):

- Re-solve a clean copy (clues only) with the full solver to the unique solution's
  spoke grid.
- Flag every spoke the player has drawn as `LINE` that the solution does **not** have
  as a line (a definite mistake), and every spoke the player has `MARKED` where the
  solution needs a line. A *missing* line is merely incomplete, never a mistake, so a
  partially-but-correctly drawn board reports zero.
- Return `[]` when the board is not uniquely deducible.

This is distinct from Spokes' existing **live** error rendering (`COL_ERROR` for an
over-marked/over-lined hub or an isolated set) — that is immediate local validation,
not a comparison against the solution. Render flagged spokes with a mistake overlay
and fold the wrong-spoke bits into the per-hub cache key (playbook §3.2 — the overlay
must be in the diff key or it won't repaint). A Palisade-grade explained **hint** is a
natural, *separate* follow-up change (the solver already produces narratable forced
deductions); it is out of scope here, as with every prior port.

### D7 — `BORDER = 0`; no border geometry to choose

Spokes has **no border** at all — `game_compute_size` is `w*tilesize × h*tilesize`
with no border term, `FROMCOORD(x) = x/tilesize`, `TOCOORD(x) = x*tilesize +
tilesize/2` — and there is no `#ifdef NARROW_BORDERS` variant to pick (unlike Slide /
Slant). `computeSize` is a plain `w×h` tiles; hubs centre in their tiles. Checked in
the source, recorded so the port doesn't invent a border.

### D8 — `solve()`: reset then fill the deduced solution

`solve_game` runs the full solver (unrestricted difficulty) on a copy and emits a move
that first clears the board to `EMPTY` and then sets every solved spoke to its `LINE`
or `MARKED` value. Model it as the `{ kind: "solve"; spokes }` variant carrying the
resolved spoke list; `executeMove` clears then applies, and sets `completed`.
`solve()` re-derives the solution from the clues (no `aux` threading needed — the
solver is a pure function of the board, playbook §3.6). Test Solve **through a real
`Midend`**, not just the game's `solve` directly.

### D9 — Differential: byte-match on desc

Because the generator is solver-gated over the bit-identical `random.ts`, a single
byte-match differential validates the generator, the tiered solver **and** the codec
together — the strongest check available. Add `puzzles/auxiliary/spokes-trace.c` on
the established pattern (`#include "../unreleased/spokes.c"`, `STANDALONE_SOLVER`
trick, dump the desc for each `(w, h, diff, seed)` tuple) and a gated
`spokes-differential.test.ts` via `describeDescDifferential` (playbook §4.1): assert
TS `newDesc` reproduces the C desc byte-for-byte across all six presets and a small
size sweep, with `validateDesc` as the `extra` check. The advisory
`scripts/diff-spokes.test.ts` shape is optional and, if added, is deleted with the C
at stage 2 (playbook §4.1). Note the trace harness `#include`s the **unreleased** path
(`../unreleased/spokes.c`).

### D10 — Leaf reuse: `dsf` only

`solver(spokes ${CMAKE_SOURCE_DIR}/dsf.c)` in `puzzles/unreleased/CMakeLists.txt`
confirms the sole leaf dependency: **`dsf`**, already ported at
`src/native/engine/dsf.ts` (`Dsf`, union-by-size). Spokes' solver uses it only for
membership/size (connectivity + isolated-set detection), so the shared `Dsf` fits
without matching `dsf.c`'s root-choice (playbook §4.4). No `latin`, `findloop`,
`tree234`/`SortedMultiset`, or `grid` is needed.

### D11 — Stage-2 catalog mechanics (shipped-fallback game)

Spokes already ships a C/WASM build, so — unlike an `unfinished/` game — the two-stage
gate does **not** collapse (playbook §1.1): stage 1 registers the TS engine in
`ts-ported-ids.ts` + `games/index.ts` and the C/WASM build remains the live in-app
fallback (`ts-ported-ids.test.ts` is satisfied because `spokes` is already in the
catalog). Stage 2, on owner acceptance, adds `TS_PORTED` to the existing
`puzzle(spokes …)` entry in `puzzles/unreleased/CMakeLists.txt` (so no `spokes.wasm`
is built), deletes `puzzles/unreleased/spokes.c`, `rm -rf build/wasm/`, and rebuilds.

## Findings from implementation (stage 1)

These were discovered while building the port and either overturn or refine a
decision above. Recorded here because each cost real investigation.

### F1 — The differential is green 25/25 byte-for-byte, first run

D9's bet paid off exactly as designed: 25 fixtures across all six presets, a
size sweep down to the 2×2 minimum and up to 8×8, and every one reproduces the
C description byte-for-byte. Because the generator is solver-gated at every
candidate line removal, that one assertion validates the RNG draw order (one
`randomUpto(2)` per interior cell, then the single shuffle), every deduction
rung, **the exact recursion tiers of the contradiction look-ahead** (Tricky →
`DIFF_LIMITED` with `ACTION_LIMIT`, Hard → `DIFF_EASY`) and the flat digit
codec, all at once. Nothing weaker would have caught a one-rung tier mistake.

### F2 — Upstream's difficulty gate re-solves a *dirty* board, and largely does not bind

D4 step 4 describes the acceptance gate as "solvable at `diff` and **not** at
`diff − 1`, so it genuinely needs its difficulty". That is what the C *says*;
it is not what the C *does*. `spokes_generate` runs that final re-solve on the
scratch board without clearing it first, so the solver starts from whatever
position the **last candidate's** solve left behind — frequently a *finished*
solution, which `spokes_validate` accepts immediately, failing the gate for
reasons that have nothing to do with the board's difficulty.

Measured consequences (fixed seeds, this port):

- The gate saw an already-complete leftover board in **31–45%** of attempts
  across 4×4/6×6 Tricky/Hard.
- **10 of 12** 4×4 "Hard" boards also solve at Tricky; 3 of 12 "Tricky" boards
  also solve at Easy. The tiers grade far more weakly than advertised.
- Clearing the board before the gate *does* fix the grading.

**First decision: reproduce the quirk** — on the reading that a weaker-than-
intended difficulty curve is the curve upstream shipped (playbook §4 rule 3),
weighed against losing the byte-match oracle. **Overturned by the owner
2026-07-24** ("it's ok to fix issues where upstream is clearly wrong"), and the
re-measurement that followed shows the trade was never as expensive as F2
originally costed it. See F7.

### F3 — Generation cost is fine; the alarming numbers were measurement error

An early reading of "20 s for a 6×6 Hard board" turned out to be vitest
overhead plus CPU contention, not the algorithm. Measured in a plain Node
process (which is what the browser worker resembles): 6×6 Hard **0.6–2.0 s**,
8×8 Hard **3.3–4.6 s**, and every preset below that is sub-second. A CPU
profile put ~35% of generation in `spokesSolverRecount`, so that function's
three per-cell spoke tallies were replaced by one 256-entry byte-lookup
(`spokeCounts` in `state.ts`) — a pure constant-factor change, with the
byte-match differential proving it altered no behaviour. No divergence needed.

(A C-vs-TS speed comparison would be meaningless here: `scripts/build-native.sh`
configures with an empty `CMAKE_BUILD_TYPE`, so the trace harness is an
unoptimised build.)

### F4 — The keyboard cursor stays a blitter, against the playbook's default

Playbook §3.2 says a C cursor blitter usually should *not* become a TS blitter —
fold the cursor into the cell's packed cache key instead, and let the cell
repaint erase it. That does not work here. A Spokes cell repaint deliberately
clears only a **plus-shape**, leaving its four corner squares untouched so the
diagonal-line pass can own them (see the `render.ts` header); at its diagonal
offsets the cursor lands inside exactly those corners, so a key-folded cursor
would have no reliable way to be erased. The blitter is kept, and the recording
`GameDrawing` still sees the cursor's real `drawLine` ops (only save/load are
no-ops), so it is tier-2 testable regardless.

### F5 — `validateParams` gains a difficulty check the C omits

`decode_params` writes an out-of-range integer for an unrecognised difficulty
letter and `validate_params` never checks it, so a hand-typed game id like
`6x6dz` would index `spokes_diffchars` out of bounds in `encode_params`. The
port decodes that to an invalid sentinel and rejects it with "Unknown
difficulty rating" (the idiom Mathrax established). Inert on the generator
path, so the differential is unaffected.

### F6 — Not a Spokes bug: a fast click leaves the press highlight stuck

Dev-verification surfaced that a plain click (press and release faster than the
worker round-trip) leaves the pressed hub showing its green `COL_HOLDING` rim
until the next input. It is **not** a port regression: `handlePointerDown` in
`src/puzzle/puzzle-view-interactive.ts` awaits `processMouse(press)` before
installing `pointerTracking`, so a `pointerup` arriving during that await is
dropped by `handlePointerUp` and the release never reaches the game. Verified
by unit test (press → highlight, release → cleared, both correct at the engine
level) and by driving the **C/WASM** build of Spokes, which shows the identical
stuck highlight. It affects every game with a press-driven overlay; Spokes just
makes it maximally visible. Filed as its own change —
`fix-click-release-race` — since the fix is app-shell input shared by all 49
games.

## Risks

- **Solver-gated generation cost.** Each candidate-line removal runs a full solve, and
  the harder tiers recurse; generation at 6×6 Hard may take several attempts. This is
  upstream's behaviour, not a port regression — budget the differential's time
  accordingly rather than assuming sub-second generation.
- **Contradiction look-ahead depth.** The Tricky/Hard `attempt` recursion must bound
  its depth exactly as C does (Tricky → `DIFF_LIMITED` with `ACTION_LIMIT`, Hard →
  `DIFF_EASY`); getting the recursion tier wrong changes solver verdicts and diverges
  the desc (D9). Port the tier mapping verbatim.
- **findMistakes vs live errors.** Keep the solution-comparison `findMistakes` (D6)
  and the existing live `COL_ERROR` rendering conceptually separate; conflating them
  would either over-flag mid-solve or leak the solution.

## Open questions for the owner

None blocking. Spokes ships a working C/WASM fallback, its icons and augmentation
summary exist, and the generator/solver/codec are faithfully portable with a
byte-match oracle. The explained hint is a deliberately separate later change.

### F7 — The gate is fixed, and it costs nothing (owner call, 2026-07-24)

`spokesGenerate` now blanks the scratch board, re-derives the clues and clears
it before the "…and not one tier easier" solve, exactly as the strip loop above
it already does. Two things that were wrong in F2's costing:

- **Grading**, 12 fixed seeds each. Upstream's gate: 10/12 4×4 Hard and 5/12
  6×6 Hard boards also solve at Tricky. Cleared: **0/12 at every size and tier
  measured**. This is not a marginal improvement — the tier label was close to
  meaningless at 4×4 Hard.
- **Cost** (plain Node, median of 6 seeds). 6×6 Tricky **538 ms → 177 ms**,
  6×6 Hard 1055 ms → 1023 ms, 8×8 Hard 2853 ms → 2019 ms. Fixing it made
  generation *faster*, because most of the dirty gate's rejections were
  spurious: it was throwing away perfectly good boards on the strength of a
  leftover position. F2's "4×4 Hard 3.3 → 15.2 attempts, 202 → 1045 ms" was
  measured under vitest contention and does not reproduce (4×4 Hard is 8 ms →
  74 ms — both trivial).

**The oracle is kept.** `newSpokesDesc` takes an `upstreamDirtyGate` option that
restores upstream's exact gate, and `spokes-differential.test.ts` — its only
caller, guarded by a test asserting the flag still changes the outcome — sets
it. So all 25 fixtures still match the C byte-for-byte, and the only code the
oracle no longer covers is the four-line clear itself, which is covered
behaviourally instead ("grades honestly: a Hard board is not crackable at
Tricky"). This is worth naming as a reusable move: an oracle exists to validate
*the hard parts*, and a flag that lets the differential run the upstream
algorithm while the game ships the corrected one keeps both, at the price of one
boolean.

### F8 — The satisfied-hub cue existed upstream but was invisible (owner request)

The owner asked for the Bridges-style "this cell already has all its
connections" colour. Spokes already had it — `game_redraw` fills a hub whose
line count matches its clue with `COL_DONE`, which is pure white — but it cannot
be seen in either colour scheme: light mode's background is a near-white grey,
and in dark mode `puzzle-view.ts` deliberately hands the game **pure white** as
its background, so the "highlight" *is* the background. Display code has never
been in byte-parity scope, so this is simply fixed: a new `COL_SATISFIED` a
clear step below the background (greys invert correctly under the dark-mode
adaptation, so one derivation serves both), and a `mark-satisfied` preference
defaulting on, mirroring Bridges' `auto-mark-complete`. `COL_DONE` survives as
the completion-flash colour only.
