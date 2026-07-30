# Design — add-rome-ts-port

## Context

Rome is Nikoli's *Roma*: an arrow-filling logic puzzle. Fill every empty square
with an arrow (up / down / left / right) so that (1) every outlined region
contains only *distinct* arrows, and (2) following the arrows from any square
eventually reaches one of the circled goals. The C header rewrites rule 2 into
two local invariants that the whole implementation turns on: **no arrow may
point off the grid**, and **the arrows must not form a loop** — because a
disjoint-set forest that merges each arrow with the square it points at will,
for a valid board, collapse every square into a component containing exactly one
goal (or one empty square, mid-solve).

So Rome carries **two disjoint-set forests**: a static one for the *region
layout* (which squares share an outlined area, used to detect duplicate arrows),
and a transient one rebuilt on every validity check for *arrow connectivity*
(used to detect off-grid arrows and loops). Everything below follows from that.

The source is ~2,314 lines, and its only non-core dependency is `dsf` (the
`puzzle(rome …)` CMake entry has no `solver(…)` line, so it links nothing beyond
the always-present core `dsf.c`). This is an idiomatic transcription of a
finished game; the decisions below record what is not mechanical.

**Long-tail risk checklist (playbook §1) — clean.** Rome's `set_public_desc` is
`NULL` and it does not supersede its desc; it compares no stringified state for
undo (no-op moves are suppressed *locally* in `interpret_move`/`execute_move`);
it has no `#ifdef EDITOR` move letters. The one non-null trap is that Rome ships
a real `game_print` — but this fork ships **no print feature** (printing.c was
dropped at fork), so it is not ported, exactly as every prior port has left
print alone. No long-tail trap bites.

## Decisions

### D1 — State: two DSFs, an arrow grid and a pencil-marks grid, immutable

Model `RomeState` as `{ w, h, regions, grid, marks, completed, cheated }`:

- **`regions`** — the static region-layout DSF (upstream `state->dsf`), a
  min-canonical disjoint-set forest built once from the desc's wall list and
  carried by reference through `cloneState` (it never changes after decode). Two
  squares share a region iff they share a canonical root.
- **`grid`** — one cell per square, a small bitfield (`FM_FIXED`, `FM_GOAL`,
  `FM_UP/DOWN/LEFT/RIGHT`). A cleaner TS shape than the C `int` is a per-cell
  discriminated value (`empty` / `goal` / an arrow direction, plus a `fixed`
  flag); pick whichever keeps the codec and solver readable, but the *arrow
  direction set* must stay a bitmask-friendly representation because the solver's
  `marks` are genuinely a **set of candidate directions** (see D3).
- **`marks`** — the pencil-mark candidate set per square (upstream `state->marks`,
  reused by the solver as its working candidate set). Player pencil marks are
  genuine gameplay and part of the save.

State is immutable; `cloneState` copies `grid`/`marks` and shares `regions` by
reference. The error/display flags (`FE_*`, `FD_*`) the C ORs into `grid` are
**not** stored — they are recomputed by the validity check (D5) and by the
renderer, never serialised.

The arrow-connectivity DSF is *transient*: `validateGame` allocates it per call
(or reuses a scratch buffer) and it never lives on the state — it exists only to
classify the current arrows into off-grid / loop / reaches-goal.

### D2 — Params and codec

`RomeParams { w, h, diff }` with `diff ∈ { EASY, NORMAL, TRICKY }`. Twelve
presets: `{4,6,8,10}² × 3` difficulties, default preset index 3 (`6×6 Easy`).
`validateParams`: `w ≥ 3`, `h ≥ 3`, `diff` in range (upstream order and
messages).

Params codec: `%dx%d` then `d<diffchar>` on `full`, with `diffchars = "ent"`
(EASY=`e`, NORMAL=`n`, TRICKY=`t`). `decodeParams` reads `w`, an optional `x`h
(else `h = w`), and an optional `d`+diffchar. `paramConfig` is Width / Height /
Difficulty (a `C_CHOICES` mapped to the declarative choice config, playbook
§3.4).

Desc codec — two comma-separated parts, ported as exact inverses (byte-match
surface, D7):

1. **Region borders**: a run-length list over the `(w-1)*h + w*(h-1)` inter-cell
   edges (horizontal separators first, then vertical). A digit token is a run of
   `n` walls; a letter `a`–`y` is a run of `1`–`25` non-walls followed by one
   wall; `z` is a run of 26 non-walls with no trailing wall. Decoding merges
   non-wall edges into `regions`; encoding walks `regions` canonical roots to
   recover the wall bits.
2. **Clue grid**: after `,`, a run-length of cells — letters `a`–`z` are runs of
   empty squares, `U`/`D`/`L`/`R` are fixed arrows, `X` is a fixed goal.

`validateDesc` reproduces the upstream checks and *distinct messages*: invalid
wall characters, invalid clue characters, a region larger than 4 cells
(`INVALID_REGIONS` — a region can hold at most the 4 distinct arrows), and a
goal in a region of size ≠ 1 (`INVALID_GOALS`). It also rejects a desc that is
not `STATUS_INCOMPLETE` on decode (a fully-determined or already-invalid board).

### D3 — The deductive solver: candidate sets, guess-free at every tier

`rome_solve(state, maxdiff)` is a **pure-deduction** fixpoint over per-square
candidate direction sets (`marks`), with **no backtracking at any difficulty**.
It repeatedly runs the validity check (to rebuild the arrow-connectivity DSF and
per-region placed-arrow sets) and then applies deduction rules until one fires,
looping until the board is `COMPLETE`/`INVALID` or no rule fires:

- **EASY** — `single` (a square with one candidate is filled), `doubles` (rule
  out arrows already placed elsewhere in the region), `loops` (rule out a
  candidate that would connect a square to its own region-neighbour and form a
  loop).
- **NORMAL** adds — `find4Position` (in a size-4 region, a direction that fits
  only one square is placed there), `nakedPairs` (two squares sharing the same
  two candidates eliminate those from the rest of the region), `expand` (the
  unique candidate that grows the goal-reaching component is forced).
- **TRICKY** adds — `opposites` (a square whose only candidates are up/down
  cannot be pointed at by an up or down arrow from the same region; likewise
  left/right).

Because every tier is closed-form deduction, **Rome satisfies the guess-free
generation policy** (`feedback_guess_free_generation`) with no "Unreasonable"
tier: EASY/NORMAL/TRICKY are all fully deducible, they just admit progressively
more techniques. This is confirmed from the C — there is no recursive/guessing
fallback anywhere in `rome_solve`. Port the rules idiomatically (discriminated
progress return, not a magic `int`), but keep the *set* of techniques and their
firing order identical — the order gates which puzzles the generator emits (D6).

The candidate set is genuinely a small set of the four directions, so a 4-bit
mask (or a `Set<Dir>` if it reads better) is the right shape; the solver mutates
a scratch copy, never the immutable state.

### D4 — Move model: a discriminated union; pencil marks are gameplay

Per the repo convention (Loopy D5, Pearl, Tracks), model the move as a
discriminated union rather than upstream's `"R x,y,c"` / `"P x,y,c"` / `"S…"`
strings:

```ts
type RomeMove =
  | { kind: "place";  x: number; y: number; dir: Dir | null } // set/clear an arrow
  | { kind: "pencil"; x: number; y: number; dir: Dir | null } // toggle a mark, or clear all
  | { kind: "solve";  arrows: ReadonlyArray<Dir | null> };    // full-grid solution
```

`interpretMove` builds these; `executeMove` applies them immutably. A `place`
sets or clears `grid[y*w+x]` (rejecting fixed clues); a `pencil` toggles a
single direction in `marks[y*w+x]` (or clears the square on `null`); a `solve`
overwrites every non-fixed square from the solver's result and sets
`completed`/`cheated`. `interpretMove` returns `null` for a genuinely null move
(out of grid, on a fixed clue, or a `place` that repeats the existing arrow) —
suppressing no-ops *locally*, exactly as the C does, so there is nothing to
reach state-string equality for (the playbook §1 phantom risk).

Pencil marks live on the immutable state and round-trip through the save codec.

### D5 — `findMistakes`: Rome is uniquely solvable, so it ships the check

Rome's `validateGame` already computes a full **rule-violation set**: an arrow
pointing off the grid (`FE_BOUNDS`), a duplicate arrow within an outlined region
(`FE_DOUBLE`), and an arrow that is part of a loop (`FE_LOOP`). Because Rome is a
**uniquely-solvable logic puzzle**, this is exactly the `findMistakes` contract
(playbook §3.5): `findMistakes(state)` returns each square participating in one
of those violations, and **Check & Save hard-blocks** when the set is non-empty.

Relationship to the always-on error styling: upstream *also* tints duplicate
arrows red and off-grid arrows' backgrounds inline in `redraw`, independent of
any check action. That passive feedback is ported as part of rendering (D8); the
`findMistakes` hook is the on-demand Check overlay + save hard-block over the
same violation set. They are complementary, not redundant — one is passive, one
is the explicit "am I still consistent, and checkpoint it" action. `findMistakes`
is the single source of the violation set; the renderer consumes it.

Loop detection is bounded by the C's `FE_LOOPSTART` marker (walk each loop once
from its start square, stopping when it returns) — port that guard so the walk
cannot spin.

### D6 — The generator: faithful, solver-gated, byte-match portable

`rome_generate` is byte-match portable and ported faithfully over `random.ts`:

1. **`generateArrows`** — shuffle the square order; fill each empty square with a
   shuffled-first legal arrow (running the EASY solver incrementally to keep the
   partial board consistent), placing a **goal** where no arrow is legal, while a
   cluster-avoidance pass (`joinArrows` → `suggest`) steers away from growing a
   run of ≥3 identical arrows. Reject if there are more than `max(1, wh/25)`
   goals or the finished board is not `COMPLETE`.
2. **`generateRegions`** — from 1×1 regions, shuffle the inter-cell edges once
   and merge the two regions across an edge iff they share no arrow direction and
   neither is a goal (so every region stays ≤ 4 cells with distinct arrows).
3. **`generateClues`** — shuffle squares; blank each non-goal clue and keep it
   blanked iff the board is still solvable at the target difficulty.

Then gate: the board must be solvable **at** `diff` and **not** solvable at
`diff-1` (so the difficulty is exactly right). The whole `rome_generate` is
retried until it returns success. The RNG surface is exactly these `shuffle`
calls plus the solver's deterministic deductions, so the desc is a pure function
of the seed and reproduces byte-for-byte (D7 differential). Playbook rule 3
applies to any temptation to "improve" the generator: a weaker/less-varied
generator is the curve upstream shipped, not a defect.

No `aux` threading: upstream's `new_game_desc` never writes `aux`, and
`solve_game` re-runs the solver from scratch, so `solve()` re-derives the
solution with no stored hint (playbook §3.6).

### D7 — Leaf-lib reuse: `dsf` only, min-canonical

Rome uses `dsf` two ways (region layout + arrow connectivity) and nothing else.
Reuse the shared `src/native/engine/dsf.ts`. Confirm it supports the
**min-canonical** flavour Rome relies on (upstream `dsf_new_min` / `dsf_minimal`
/ `dsf_size` — canonical element is the minimum index, needed by the
goal-reaching component walk and the region-size checks); if the shared `Dsf`
lacks a min-canonical mode or a size query, extend it there (the refactor-as-you-go
directive) rather than forking a Rome-local copy — a second consumer justifies
the shared shape. No `latin`/`matching`/`grid`/`tree234`/`findloop` needed.

### D8 — Rendering: region outlines, arrows, pencil marks, aids, flash

Port `game_redraw` faithfully but idiomatically, per-tile cached on a packed
`Int32Array` key (playbook §3.2 — the packed value is the arrow/goal bits, the
pencil-mark set, the cursor/entry flags and the flash phase):

- **Region outlines** via `GRIDEXTRA` insets on edges where adjacent squares
  differ in region canonical root (drawn from the static `regions` DSF).
- **Arrows** as line-and-head strokes (`rome_draw_arrow`), goals as filled
  circles, **pencil marks** as small arrows in the four quadrants.
- **Colour aids** (upstream prefs, default states preserved): squares whose
  arrows reach a goal get a blue-ish background (`sgoals`, default **on** — a
  genuinely helpful built-in aid), loop squares optionally get a red background
  (`sloops`, default **off**); off-grid and duplicate arrows are tinted red
  inline (the passive half of D5).
- **Cursor / drag entry** highlighting for the keyboard place/pencil modes and
  the mouse-drag entry direction.
- **Completion flash**: the three-phase highlight over `FLASH_TIME = 0.7`
  (`(int)(flashtime / FLASH_FRAME) % 3`). No slide/arrow animation —
  `game_anim_length` is `0`.

**Border geometry**: `cmake/platforms/webapp.cmake` defines `NARROW_BORDERS`, so
the compiled arm is `BORDER = GRIDEXTRA*2` (= 2), **not** `tilesize/2` — check
this rather than porting the desktop default (playbook §3.2, the same fact Loopy
and Slide rely on). `computeSize` is `w*TILESIZE + 2*BORDER - GRIDEXTRA*2` by the
same in height. The game fills its own background; the engine paints no pixels of
its own.

The two highlight prefs (`sgoals`/`sloops`) live on the ephemeral `Ui` with the
upstream defaults; surfacing them as user-togglable prefs follows whatever prefs
surface the app has, else the defaults stand — a minor display decision, not a
gate.

### D9 — Input: drag-to-place and keyboard cursor

Rome's input (upstream `interpret_move`, `REQUIRE_RBUTTON`) is ported to the
shared pointer/keyboard model, all drag state on the ephemeral `Ui`:

- **Grab** — `LEFT_BUTTON` (place mode) or `RIGHT_BUTTON` (pencil mode) on a
  non-fixed square sets the active square and mode.
- **Drag** — the pointer's offset from the grabbed square's centre picks a
  direction (`|dx| < |dy|` → up/down else left/right; back onto the square →
  clear); emit a `UI_UPDATE` as the entry direction changes.
- **Release** — commit a `place`/`pencil` move for the entry direction (or a
  `UI_UPDATE` if it is a no-op).
- **Keyboard** — a cursor moved by the arrow keys; Enter toggles place mode,
  Space toggles pencil mode, then a direction key (or the numpad-direct `8/2/4/6`
  → U/D/L/R, and backspace to erase) commits. `MOD_NUM_KEYPAD` never arrives in
  this frontend, so bind the **bare** digits `8/2/4/6` (playbook §3.8a) as the C
  path already keys off the bare characters.

Coordinate conversion uses the shared `fromCoord` with `BORDER` from D8.

### D10 — Differential: byte-match on desc

`puzzles/auxiliary/rome-trace.c` (established pattern, `#include
"../unreleased/rome.c"`, a `cliprogram()` line) dumps the generated desc for
`(w, h, diff, seed)` tuples. `rome-differential.test.ts` asserts the TS
`newDesc` reproduces the C desc **byte-for-byte** across a preset+difficulty
matrix and a small size sweep. Because generation is solver-gated at every step,
that single assertion validates the generator, the eight solver deductions, the
DSF connectivity classification and the codec **together** — the strongest check
available and the reason byte-parity is worth keeping on this path (playbook §4
intro, `feedback_byte_parity_scope`).

### D11 — Stage-2 catalog mechanics

Rome already ships as a C/WASM catalog game, so stage 1 simply registers it in
`ts-ported-ids.ts` + `games/index.ts` (TS-served, C/WASM stays the fallback —
the empty-registry path is the fallback). Stage 2, on owner acceptance, adds
`TS_PORTED` to the existing `puzzle(rome …)` entry in
`puzzles/unreleased/CMakeLists.txt` (the entry stays put — no CMakeLists move,
unlike the unfinished games), deletes `puzzles/unreleased/rome.c`, and rebuilds
after `rm -rf build/wasm/` (so no `rome.wasm` is emitted). Icons already exist.

## Risks

- **Solver/generator fidelity is the whole game.** The desc depends on the
  solver's verdict on every intermediate board, so any deviation in a deduction
  rule or its firing order changes which puzzles are emitted and breaks the
  byte-match. Port the rules and their order verbatim; the differential (D10) is
  the tripwire.
- **Generation can retry many times.** `rome_generate` loops until a board
  passes the solvable-at-`diff` / not-at-`diff-1` gate; at the larger presets
  this can be several attempts. Inherent to the upstream algorithm, not a port
  regression — budget the differential's time accordingly.
- **DSF min-canonical semantics.** The goal-reaching walk and region-size checks
  rely on min-canonical roots and size queries; confirm/extend `engine/dsf.ts`
  (D7) rather than assuming the current API covers it.
- **Two error surfaces (D5/D8).** The passive inline red and the `findMistakes`
  overlay draw from one violation set; keep that single-sourced so they cannot
  disagree.

## Open questions for the owner

1. **Catalog acceptance (D11).** Stage 2 (flip `TS_PORTED`, delete the C) rides
   the usual owner-acceptance gate; stage 1 stands regardless.
2. ~~**Highlight prefs (D8).**~~ **Resolved during implementation** — see F3.

## Findings during implementation

Recorded here because several of them overturn a decision above.

### F1 — D7 was wrong about `dsf_new_min`, and the correction cuts both ways

D7 said Rome relies on a "min-canonical" forest whose `dsf_canonify` returns a
class's smallest index, and that `engine/dsf.ts` might need extending. **It
does not, and it doesn't.** `dsf_new_min` allocates a *separate* `min[]` array
that only `dsf_minimal` reads; `dsf_canonify` on a min-dsf is the ordinary
union-by-size root, identical to the shared `Dsf`'s.

Both halves of that matter:

- **No extension is needed.** Rome's single `dsf_minimal` use (marking the
  squares that reach a goal) is *exactly* a same-class test — its scan from the
  class minimum is an optimisation, not a semantic — so it ports to
  `dsf.equivalent(x, i)`. Task 8.2 is therefore "already covered", not
  "extended".
- **But the shared `Dsf`'s root *identity* became load-bearing.** Because the
  canonical root is not the minimum, `rome_naked_pairs`' `for (k = c; k < s; k++)`
  can genuinely skip region members whose index is below the root, weakening the
  deduction on exactly those regions. That is a real upstream quirk, it is
  solver-gated into the generator, and it is portable only because
  `engine/dsf.ts` already reproduces `dsf.c`'s tie-break (larger class wins;
  second argument on a tie). Had D7's premise been implemented, every board
  would have changed. Preserved verbatim with a comment at the site.

### F2 — `findMistakes` ships **both** layers, overriding D5

D5 specified the rule-violation set alone (off-grid / duplicate / loop). That is
what upstream computes, and it is what the board already shows live — but it is
a *strict subset* of "wrong", and the gap is the dangerous one: a player can
place an arrow that breaks no rule and still contradicts the unique solution,
and a live-only hook would let Check & Save store that board. That is precisely
the failure `findMistakes` exists to prevent (playbook §3.5, and the Boats
finding of 2026-07-28, which postdates this design).

So `findMistakes` returns the rule violations **and** re-solves from the fixed
clues, flagging every placed arrow the unique solution disagrees with
(`kind: "wrong"`), returning `[]` for that layer when the board is not
deducible. The renderer keeps upstream's passive red *and* adds an inset red
ring for the flagged squares — the ring is what makes a wrong-but-legal arrow
visible at all, since it has nothing to recolour.

**Pencil marks are deliberately not checked.** The cross-game convention
(playbook §3.7) treats a note that has crossed out the true value as a mistake,
but that reading only holds where notes *are* candidates. Rome's own
documentation says its pencil marks "can be used for any purpose" — a player may
equally be marking the arrows they have ruled *out* — so no reading of a note
can be called wrong. Declined with the reason recorded, per the
refactor-as-you-go guardrail.

### F3 — the two highlight preferences ship as real preferences (D8 open question)

The recommendation in the open question ("keep the defaults; add a prefs surface
only if the app grows one") was written as if the app had none. It does:
`Game.prefs` has existed since Untangle. So both upstream toggles ship as
preferences with upstream's own keywords (`goal`, `loop`), labels and defaults
(goal-reaching **on**, loops **off**), persisted per puzzle by the midend.

### F4 — the desc codec's writer and reader disagree above 25, harmlessly

The wall encoder emits `z` for a run of 26 non-walls **and consumes the wall
that follows**, while the decoder reads `z` as 26 non-walls with *no* trailing
wall (and a longer run leaves the alphabet entirely). Both sides are reproduced
verbatim rather than "completed" — the disagreement is unreachable, because a
region holds at most four squares, so the longest run of consecutive non-walls a
Rome board can produce is a handful. Same family as the Seismic finding
(playbook §4.3): read what the *reader* accepts before deciding what the writer
owes it.

### F5 — two generator scratch structures are deliberately never reset

`rome_generate_arrows` allocates its cluster-detection forest and its `suggest`
array once and calls `rome_join_arrows` inside the fill loop **without
reinitialising either**. Merges therefore accumulate across the whole fill —
and since every still-empty square has an arrow mask of zero, they *all* merge
early and stay merged — while `suggest` only ever gains bits. It also ORs the
neighbour's whole cell (goal and error bits included) into `suggest`, where
those bits are inert. All of it feeds the arrow choices and hence the
description, so all of it is reproduced as-is.

### F6 — no `FD_TOGOAL` bit can ever land on an empty square

Worth writing down because it is what makes upstream's `solve_game` safe.
`rome_solve` initialises its candidate sets from the grid *before* the first
validity check clears the display bits, so a square carrying only `FD_TOGOAL`
would be read as non-empty and given an empty candidate set — a stuck solver.
It cannot happen: a goal's component is `{G} ∪ {X : X → Y, Y ∈ component}`, so
every member other than the goal has an arrow. Pinned by a test.

### F7 — an idiomatic speed-up that is provably the same traversal

`rome_naked_pairs` rescans the whole board for each candidate square (an
`O(cells²)` inner pair of scans, inside a fixpoint, inside a per-clue
generation loop). Both scans are "region members in ascending index order,
above a lower bound", so the port precomputes ascending member lists once per
solve and filters them by the same bounds — including the F1 skip. Identical
traversal, identical verdicts, and the 26/26 byte-match is the proof. Generation
measures 3–60 ms across the presets against the C's 0.2–17 ms recorded in the
fixtures, i.e. the same order of magnitude and no product concern.

### F8 — `interpretMove`'s release check masks to the arrow bits

Upstream compares the whole cell (`c == state->grid[y*w+x]`) when deciding
whether a drag release is a no-op, so a square already carrying an error bit
emits a move that changes nothing but still takes an undo slot. The port
compares the arrow bits, which suppresses the genuine no-op. Input layer only —
the desc differential never runs `interpretMove`.

### F9 — Solve reports an error rather than filling a board it cannot finish

Upstream's `solve_game` writes out whatever the solver reached, so on a board it
cannot deduce (a hand-written `:desc`) Solve leaves a partial fill and no win.
The port returns "Unable to solve this puzzle." instead. Generated boards are
solver-gated, so this changes nothing on any reachable puzzle.
