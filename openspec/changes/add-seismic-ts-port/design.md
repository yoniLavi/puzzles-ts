# Design — add-seismic-ts-port

## Context

Seismic implements *Hakyuu* (a.k.a. *Ripple Effect*), one of thirteen
third-party puzzles from x-sheep's `puzzles-unreleased` collection that this fork
bundles. Unlike Simon Tatham's `unfinished/` experiments, these thirteen already
**ship in the catalog as C/WASM games**, so the standard two-stage parity gate
applies unchanged: stage 1 registers the TS impl with the C/WASM build retained
as the in-app fallback; stage 2 (owner-accepted) flips `TS_PORTED` and deletes
the C (playbook §1.1).

The game: the grid is partitioned into regions (stored in a `Dsf`). A region of
size N must contain one each of 1…N. Two equal numbers Z on the same row/column
must have at least Z cells between them (**Seismic** mode); or two equal numbers
may not be orthogonally/diagonally adjacent (**Tectonic** mode, where every
region is a 5-cell shape). It is a deductive puzzle with a unique solution — a
Solo-family interaction (click a cell, type a digit, right-click for pencil
marks), but over `Dsf` regions rather than Latin rows/columns/boxes, so it does
**not** use `engine/latin.ts`; its solver is a bespoke candidate-elimination
engine over a per-cell bitmask.

The C is ~2069 lines and self-contained apart from `dsf` (its `solver(seismic
… dsf.c)` line names the one leaf dependency, already ported to
`engine/dsf.ts`). The header records a real limitation — the generator "has a
near-zero chance of generating sizes higher than 7×7" — which is the difficulty
curve upstream shipped, not a defect to fix (playbook rule 3; see Risks).

**Long-tail risk checklist (playbook §1) — clean, with one note.** Seismic's
`set_public_desc` is `NULL` and it does not supersede its desc; it compares no
stringified state for undo (no-op entry is suppressed *locally* in
`interpret_move` by returning `NULL` when the value is unchanged); it has no
`#ifdef EDITOR` move letters. The one note: it ships a real `game_print`, but
this fork deleted the print pipeline at the fork and promises no replacement, so
`game_print` is **not** ported (D8) — consistent with every prior port.

## Decisions

### D1 — Regions on the shared `Dsf`; no minimal-element map

The C stores regions in a `DSF` and reads `dsf_canonify`/`dsf_size` heavily. Two
facts make the shared `engine/dsf.ts` `Dsf` (union-by-size) a byte-match-faithful
replacement with **no** `dsf_new_min` variant:

- **The wall layout is membership-determined.** `new_game_desc` emits a wall
  between two cells iff `dsf_canonify(a) != dsf_canonify(b)` — a *membership*
  comparison, not a read of the canonical element's identity. The playbook §2.2
  "membership-determined ⇒ byte-identical regardless of which root union-by-size
  picks" case applies directly. Nowhere does Seismic read `canonify(i)` *as a
  cell coordinate* (the Filling/Keen minimal-cell trap), so **no minimal-element
  map is needed** — clues live per-cell in `grid`, not at a region's minimal cell.
- **`canonify` is used only as a region *identifier*.** `seismic_solver_areas`,
  `seismic_solver_attempt` and `seismic_validate_game` index arrays sized `w·h`
  by `dsf_canonify(i)`; the merge accumulator `cells[canonify(i)] |= …` in
  `seismic_gen_areas` writes to whichever element is currently canonical and is
  always re-read through `canonify`, so a differing root choice leaves a stale but
  never-re-read slot and changes nothing observable.

So: a per-cell region id via `dsf.canonify`, region size via `dsf.size`, and the
`Dsf` reset (`dsf_reinit`) between generator retries. Record the "no min-map"
reasoning in `state.ts` so a future reader doesn't "restore fidelity" by adding
one.

### D2 — One engine, two modes: a mode-parameterised keep-apart rule

Seismic and Tectonic differ in exactly two places, both parameterised off
`state.mode` rather than forked into two code paths:

- **The keep-apart propagation** (`seismic_place_number` / the error scan in
  `seismic_validate_game`): Seismic rules out number `n` in the `n` cells either
  side along both axes; Tectonic rules it out in the 8 neighbours.
- **Region size**: Seismic regions range 1…9 (`AREA_BITS(size)`); Tectonic
  regions are always 5, and `tectonic_gen_numbers` additionally **remaps** the
  filled numbers by descending frequency (1 must appear most often), a fixed
  post-pass. Port that remap verbatim (byte-match surface).

The candidate bitmask is a `Uint16Array` (`NUM_BIT(n) = 1 << (n-1)`,
`AREA_BITS(k) = (1<<k)-1`); a cell's marks are its live candidate set. This is the
one deduction engine the future explained hint will reuse (the narratable-engine
doctrine — solver and hint are two projections of one engine), but the hint is a
**separate change**; this port ships only the solver.

### D3 — The two-part run-length desc codec (byte-match surface)

`new_game_desc` emits `⟨walls⟩,⟨clues⟩`:

- **Walls** — over `ws = (w−1)·h + w·(h−1)` border positions (all horizontal
  borders first, then all vertical), a run-length scheme that alternates a
  **decimal count** for a run of walls and a **letter** `a`–`z` (with `z` = a
  continuation of 26) for a run of non-walls. The encoder's `erun`/`wrun`
  interplay and the decoder's inverse are fiddly; port them as **exact inverses**,
  verbatim.
- **Clues** — a letter run-length for empty runs and the digits `1`–`9` for
  clue cells; missing trailing data decodes as empty (`'S'` sentinel).

`validate_desc` (over the shared decode) reports the C's four verdicts —
`INVALID_WALLS` (unknown character), `INVALID_REGION` (a region larger than 9),
`INVALID_CLUESIZE` (a clue larger than its region), else `VALID`. Reproduce all
four. The codec is byte-match surface (D7); model the move set with a
discriminated union (D5), never these characters.

### D4 — The marks-based solver and the solver-gated generator

**Solver** (`seismic_solve_game(maxdiff)` → difficulty reached, or `-1`): seed
each cell's candidates to `AREA_BITS(regionSize)`, apply every given, then loop:

- **Easy** — *naked single* (`seismic_solver_marks`: a cell with one candidate is
  placed) and *hidden single in region* (`seismic_solver_areas`: a number with a
  single candidate cell in its region is placed).
- **Hard** — *trial placement* (`seismic_solver_attempt`: tentatively place a
  candidate; if that immediately leaves some region unable to hold a number it
  needs, rule the candidate out).

`seismic_place_number` does the constraint propagation (place, clear the number
from the keep-apart cells and from the rest of the region). `seismic_validate_game`
returns `COMPLETE`/`UNFINISHED`/`INVALID` and is the win test. Idiomatic shape: a
`SeismicSolver` over the bitmask array + grid + region `Dsf`, discriminated
progress codes rather than the C's magic `-1/0/1`.

**Generator** (`seismic_gen_puzzle`, retried in `new_game_desc` until it
succeeds):

1. Fill a full valid solution — `seismic_gen_numbers` (shuffle cells, place the
   lowest legal number; may fail → whole retry) or `tectonic_gen_numbers`
   (sequential random placement + the frequency remap of D2).
2. `seismic_gen_areas` — start from singleton regions (each cell its own,
   `cells[i] = NUM_BIT(grid[i])`), shuffle the border list, merge two regions
   when they share no number; fail if a resulting region isn't a complete 1…N set.
3. `seismic_gen_clues` — shuffle cells, strip each while the puzzle stays solvable
   at the target difficulty.
4. `seismic_gen_diff` — accept only if solvable at `diff` **and not** at `diff−1`.

The RNG draws (the shuffles in steps 1–3, plus `shuffle(spaces,5)` per cell in
Tectonic) are the byte-match surface: reproduce their **order** exactly over
`random.ts`. Because the generator is **solver-gated at every strip**, the desc is
a pure function of the seed and a single byte-match assertion validates generator,
solver and codec together (D7) — the strongest check available.

### D5 — Move model: a discriminated union, note machinery on state

Model the move as a discriminated union, not the C's `"R…"`/`"P…"`/`"S…"`/`"M"`
strings (the Loopy/Pearl/Tracks precedent):

```ts
type SeismicMove =
  | { kind: "set"; x: number; y: number; n: number }     // place n (0 = clear)
  | { kind: "pencil"; x: number; y: number; n: number }  // toggle mark (0 = clear all)
  | { kind: "solve"; grid: ReadonlyArray<number> }       // fill the solution
  | { kind: "markAll" };                                  // fill every empty cell's marks
```

`interpretMove` builds these; `executeMove` applies them onto an immutable state
(GC, no `dup`/`free`). State carries `grid` (`Uint8Array`), `flags` (fixed / live
dup-error / live distance-error bits), `marks` (`Uint16Array` pencil bitmask), the
region `Dsf` (shared by reference across states — it never changes after
`newGame`, the §3.1 shared-immutable pattern), `completed`, `cheated`. Digit
entry is **capped at the cell's region size** and rejected on a fixed cell or a
no-op, exactly as the C's `interpret_move` (local no-op suppression, playbook §1).

### D6 — `findMistakes`: unique solution ⇒ ship it, notes first-class

Seismic has a unique solution, so `findMistakes` is **required** — Check-&-Save
hard-blocks only when `canFindMistakes` is true, which is
`game.findMistakes !== undefined` (playbook §3.5). Re-solve from the **givens
only** (`FM_FIXED` clues) to the unique solution, then flag:

- a placed cell whose value contradicts the solution (`kind: "cell"`), and
- an empty cell whose **non-empty** pencil notes have crossed out the solution's
  value for that cell (`kind: "note"`) — the cross-game notes-are-first-class
  convention (playbook §3.7).

Return `[]` when the givens aren't uniquely deducible. Render flagged cells with a
`COL_MISTAKE`-style overlay through an `OverlaySidecar` in the diff key (playbook
§3.2 — an overlay missing from the diff key silently fails to repaint a frame
after the move).

**Keep the C's always-on live error highlighting too, as a separate display
feature.** `seismic_validate_game` colours a duplicate-in-region (`FM_ERRORDUP`)
and a distance/adjacency violation (`FM_ERRORDIST`) red on every move — a *local
consistency* check, weaker than the *contradicts-the-unique-solution* check
`findMistakes` performs. Both exist and serve different roles; keep the live red
colouring in `render` and additionally implement `findMistakes` for Check-&-Save.

### D7 — Differential: byte-match desc over the presets + a bounded size sweep

`puzzles/auxiliary/seismic-trace.c` (`#include "../unreleased/seismic.c"` — the
**first** unreleased-game trace harness; add its `cliprogram()` line) dumps the
generated desc per `(params, seed)`. `seismic-differential.test.ts` asserts the TS
`newDesc` reproduces the C desc **byte-for-byte** across all twelve presets and a
size sweep. Because generation is solver-gated, that one assertion validates the
generator's draw order, every solver deduction, the region merge, and the codec at
once. **Bound the sweep at ≤ 7×7** and budget generous time per fixture: upstream's
generator is slow and near-certain to fail above 7×7 (Risks), so a differential
that sweeps large sizes would hang, not fail informatively.

### D8 — Rendering: static region geometry + dynamic overlays; no animation

`game_anim_length` is `0` — there is **no move animation**; the only motion is a
three-phase completion **flash** (`FLASH_TIME = 0.7`, `FLASH_FRAME = 0.1`). Port
`game_redraw` faithfully but idiomatically:

- **Border geometry:** `cmake/platforms/webapp.cmake` defines `NARROW_BORDERS`, so
  the compiled arm is `BORDER = GRIDEXTRA*2` and `computeSize` subtracts
  `GRIDEXTRA*2` (playbook §3.2 — check the define, don't port the desktop
  default). Region boundaries are drawn as `GRIDEXTRA` insets plus the four
  corner-pixel fills, all off `Dsf` membership of the neighbours. That membership
  is **static** for the life of a game (the `Dsf` never changes), so the region
  geometry can be computed once; only the per-cell overlays change.
- **Per-tile cache** keyed on an `Int32Array` (playbook §3.2) packing the placed
  value, the pencil bitmask, the cursor/pencil-cursor highlight and the live-error
  bits. When the bits run out, push the `findMistakes` overlay into an
  `OverlaySidecar` checked in the cache-miss branch — never widen to `BigInt`.
- **Numbers** coloured fixed (black) / live-error (red) / guess (green); **pencil
  marks** laid out in the C's grid; the engine paints no pixels of its own — the
  game fills its own background in the `!ds.started` branch (rendering doctrine).
- **Print** (`game_print`/`game_print_size`) is **not** ported (Context).

`game_print` aside, this is display code — match the *look*, prefer clean code,
not pixels (byte-parity is not a display concern).

### D9 — The full pencil-mark note-taking UX (playbook §3.7/§3.8)

Seismic is a candidate-pencil game, so it carries the four default-on note-taking
divergences:

- **Mark-all** (`canMarkAll: true`) — the C's `M` key fills every empty cell's
  marks with `AREA_BITS(regionSize)` (all of 1…N for the cell's region). Keep it
  **fill-only** and faithful to the C (Undead's stance in §3.7): Seismic's
  keep-apart rule is not a plain uniqueness region, so the adaptive
  fill-then-clean variant is out of scope (and would diverge from the C's `M`).
- **Sticky pencil mode** — a `pencilSticky` `Ui` boolean (default true) via the
  `prefs` hook: right-click toggles a persistent pencil mode, left-click only
  moves the highlight. A right-click on a filled/given cell toggles the mode but
  does not select it.
- **A pencil-mode indicator** — a small pencil glyph while pencil mode is on.
  Seismic's grid has no obviously cache-safe cell, so repaint the indicator region
  explicitly at the end of `redraw`, tracking last-drawn on/off (playbook §3.7).
- **On-screen keypad** (`requestKeys`) — the C's `game_request_keys` returns
  `'1'`…`'n'` plus clear, with `n = mode === TECTONIC ? 5 : 9`. Use
  `digitKeys(mode === TECTONIC ? 5 : 9)` from `engine/key-labels.ts` (§3.8);
  per-cell entry is still capped at the actual region size (D5).

### D10 — Params, config summary, presets

Params `{ w, h, diff, mode }`. `encodeParams`: `"%dx%d"` + `"T"` for Tectonic +
(full only) `"d" + diffChar` (`e`/`h`). `decodeParams`: width, optional `x`height
(square fallback), optional `T`, optional `d`+char. `validateParams`: `w ≥ 4`,
`h ≥ 4`, `diff < DIFFCOUNT`. Twelve presets ({4,6,7}² × {Easy,Hard} ×
{Seismic,Tectonic}), default index 4 = `6×6 Easy Seismic`.

`describeParams` must emit the keys the existing `augmentation.ts` `seismic`
template `"{game-mode:Seismic|Tectonic}: {width}x{height} {difficulty:Easy|Hard}"`
reads — `{ "game-mode": <0|1>, width: String(w), height: String(h),
difficulty: <0|1> }` (numeric index for a choice, string for a dimension;
playbook §3.4). `paramConfig` (the Custom-type dialog) supplies Width / Height
(strings via `parseConfigInt`) + Difficulty and Game-mode (choices), keyed
`width` / `height` / `difficulty` / `game-mode` to match the C config slugs.

## Risks

- **The generator does not scale (upstream's own TODO).** It is slow at 6×6–7×7
  and near-certain to fail above 7×7 (`seismic_gen_areas` "is a dumb way of
  generating a region layout"). This is the curve upstream shipped, not a defect —
  do **not** rewrite it (playbook rule 3). Consequence: a pathological Custom size
  can hang, exactly as the C/WASM build does today. Keep `validateParams` faithful
  (no upper bound), but **bound the differential sweep at ≤ 7×7** (D7) and budget
  generous per-fixture time. If owner smoke-testing finds the hang unacceptable, a
  soft size warning is a *follow-up*, not part of this faithful port.
- **Two modes double the differential surface.** Cover both Seismic and Tectonic
  in every fixture tuple (the Tectonic frequency-remap in D2 is a distinct
  byte-match path).
- **Two overlapping error concepts.** The live dup/distance highlighting (display)
  and `findMistakes` (Check-&-Save, contradicts-solution) are separate by design
  (D6) — don't collapse them; the live check must not gate Check-&-Save and
  `findMistakes` must not depend on the live flags.
- **Small, well-understood otherwise.** One leaf dep (`dsf`, already ported), no
  aperiodic geometry, no animation. The codec (D3) and the RNG draw order (D4) are
  the only byte-match-fragile surfaces, and the differential catches both.

## Implementation findings

Recorded after the port landed; where these overturn a decision above, this
section is authoritative (the `add-loopy-ts-port` F1–F8 precedent).

### F1 — The scaling limit, measured; D-Risks resolved by a `validateParams` bound

The design left "generation hang on large Custom sizes" as an open question with
a recommendation to ship faithful. Measuring it first (playbook §4, "measure a
rare failure before you design the recovery for it") settled it without needing
to ask. Success rate of the region-merge stage, 200,000 attempts per shape:

| cells        | 16   | 25    | 36      | 48       | 49        | 56 | 64 |
|--------------|------|-------|---------|----------|-----------|----|----|
| success rate | 1/22 | 1/191 | 1/4,167 | 1/66,667 | 1/200,000 | 0  | 0  |

So it is *both* failure modes at once, and they want opposite fixes:

- **Up to 49 cells: unlucky, so retry** — bounded by `retryLimit`. The costliest
  legitimate board across the 28 differential fixtures (7×7 Hard, Seismic) needed
  **1,184,978** attempts, so `MAX_ATTEMPTS = 5_000_000` (~12× that
  configuration's mean) never trips on a board the generator can reach.
- **Above ~50 cells: impossible, so reject in `validateParams`** — `MAX_CELLS =
  49`, exactly the playbook's prescription, with the Custom dialog showing the
  reason instead of freezing for minutes. It excludes no configuration either
  build can produce, so the byte-match differential is untouched. Verified in the
  browser: a 10×10 submit is refused instantly with the message.

The bound's one cost, recorded because it is a real (if unlikely) loss: this
engine passes `full = true` to `validateParams` for a `:desc` game ID as well as
a `#seed` one, so a *hand-authored* `10x10:⟨desc⟩` ID is refused too.

### F2 — The wall codec is not a round-trip in the C; fixed in the range where it isn't

Upstream writes a run of `n` gap borders as a bare `'a' + n - 1`, and treats that
letter as also standing for the wall that ended the run. Its **reader** does the
same only for `'a'..'y'`: `'z'` means "26 gaps and *no* wall". So a gap run of
exactly 26 silently loses a wall on the way back, and a run of 27+ emits a
character outside `'a'..'z'` that the reader rejects as invalid.

That range has no defined upstream behaviour (playbook §4 rule 1), so
`encodeWalls` chunks long runs into `'z'` units — precisely what the reader
already means by `'z'` — and lets the residue, or the following wall run, carry
the wall. Output is character-for-character identical to the C for every run of
≤ 25, which is every run any generated board has produced; the 28-fixture
byte-match confirms it. Guarded by a test that decodes with a decoder written
strictly to the *C's* reading rules, so the encoder is checked against upstream's
grammar rather than against itself.

### F3 — `game_redraw` truncates the pencil bitmask into a `char`

`game_redraw` declares `char c, p` and then assigns `p = state->marks[i1]`, but
`marks` is a **9-bit** candidate mask. Bit 8 is lost, so **a pencilled 9 is never
drawn**. This is playbook §3.2's "a display-only value with the wrong type is a
bug you may just fix": fixed here (the mask is read as a `number`).

It takes a nine-cell region to expose, and *no generated board has one* — the
region grower would have to land all nine numbers in a single region — so the
regression test hand-builds a board with one through the same codec the generator
writes, and checks a 9 is both enterable (`interpretMove` caps entry at the
region size) and drawn.

### F4 — D9's mark-all no-go stands, but for a different reason

D9 declined the adaptive fill-then-clean mark-all because "Seismic's keep-apart
rule is not a plain uniqueness region". That reasoning is wrong — the *dsf
region* is a plain uniqueness region (one each of `1..N`), and striking
candidates already placed in it would be sound. The real blocker is mechanical:
the shared `adaptiveMarkAllMove` / `obviousCandidateMarks`
(`engine/candidate-hint.ts`) is written for a **square** board — it walks `w * w`
cells and caps candidates at `w` — while Seismic's grid is rectangular and its
candidate range is per region. Widening a helper five games share for one game is
not worth it (playbook's "record the no-go with its reason"), and upstream's `M`
is fill-only regardless. Revisit if a second rectangular candidate game appears.

### F5 — The port is faster than the C, so the 7×7 cost is upstream's, not a regression

The trace harness records the C's own generation milliseconds per fixture, so the
comparison is a fact rather than an impression. The TS port is faster on every
one — 7×7 Hard Seismic: **C 42.9 s, TS 27.8 s**; 7×7 Easy Seismic: C 18.2 s, TS
12.4 s; 6×6 Tectonic Easy: C 1.95 s, TS 1.82 s. See "Owner decision wanted"
below: the cost is real and worth fixing, but it is not something this port
introduced.

### F6 — D7's differential: 28/28 byte-for-byte, first run

All twelve presets, both modes, both difficulties, a second seed per preset size,
and a non-square size sweep. Because generation is solver-gated at every clue
removal *and* graded against the tier below, that one assertion validates the
generator's draw order, every solver rung, the region merge and both halves of
the codec together. It also caught nothing — the port matched first time — which
is itself the useful signal: the divergences in F2 and F3 are confined to display
and to inputs the generator never produces, exactly as claimed.

### F7 — `solve()` errors rather than filling partially

Upstream's `solve_game` emits whatever the solver managed, so a board it cannot
finish is half-filled into the player's grid irreversibly. This port returns
`{ ok: false }` instead. Unreachable on any generated board (the generator only
accepts boards its own solver completes), and `executeMove`'s solve arm is not on
the differential's path, so this costs no verification.

### F8 — D1 confirmed: no minimal-element map needed

`dsf_canonify` is read only as a region *identifier* — accumulated into `w·h`
scratch arrays and always re-read through `canonify`, with the wall layout emitted
from a membership comparison. The byte-match across all 28 fixtures is the proof.

### F9 — A board with no clues at all is a legitimate upstream output

Several C fixtures decode to an entirely empty clue grid (`6x6dh` seed
`seismic-6x6-h-s` is `…,zj`: 36 empty cells, no givens). The region layout alone
forces the answer. Surprising to read, but faithful, and the solver handles it —
worth knowing before treating a clueless board as a codec bug.

## Owner decision wanted (does not block this port)

**Should the region generator be replaced?** The author's own Status note asks for
it — "the generator step that creates randomly filled regions needs to be
completely replaced with a different approach" — and F1 quantifies why: a 7×7
board costs 12–28 s, and 8×8 and up (10×10 being *the* common Hakyuu size) cannot
be generated at all. A constructive region grower (grow a region cell by cell,
placing the number it still needs, instead of merging blindly and hoping) would
make every size instant and lift the ceiling.

The cost is the one thing that makes it a decision rather than a task: it changes
every board, so the 28-fixture byte-match — which is what validates the solver and
codec — would have to be given up or reduced to the weaker §4.8 verdict check.
The `upstreamDirtyGate` shape from `add-spokes-ts-port` is the escape hatch (keep
upstream's algorithm behind an option that only the differential sets), and would
likely apply here too. Recommendation: a separate change, after this one is
accepted, taking that shape.
