# Design — Pattern (Nonograms) TS port

## Long-tail-risk check (playbook §1)

Read against `puzzles/pattern.c`; Pattern is clean on all four:

| Risk | Verdict |
| --- | --- |
| `midend_supersede_game_desc` | **Not used.** The board is static; the desc never changes mid-game. No `me` back-reference needed. |
| Undo via state-string equality | **Not used.** `interpret_move` returns an explicit `F`/`E`/`U` rectangle move *only when a cell in the rect would actually change* (local `move_needed` scan); otherwise `MOVE_UI_UPDATE`. No state stringification. |
| `#ifdef EDITOR` move letters | **None.** No editor build. |
| `printing.c` | `game_print` exists upstream but printing was deleted at fork. **Skip** — do not port `game_print`/`game_print_size`. |

## Key decisions

### D1 — Immutable shared "common" vs immutable state
Upstream splits the state into a refcounted `game_state_common` (w, h, the clue
arrays `rowdata`/`rowlen`, `immutable[]`, font size) and a per-move `game_state`
(`grid`, `completed`, `cheated`). In idiomatic TS the clues are computed once at
`newState` from the desc and held on a **frozen** clue object shared by every
cloned state (GC, no refcount); only the 3-state `grid` (a `Uint8Array`) plus
`completed`/`cheated` clone per move. `cloneState` copies the `Uint8Array` and
shares the frozen clues — the Galaxies pattern.

### D2 — Desc format (clue rows, optional immutable suffix)
The desc is a `/`-separated list of `w` column clues then `h` row clues, each a
`.`-separated list of positive run lengths (an empty line is an empty section).
There is an **optional** `,`-suffix encoding immutable pre-filled clue squares
(run-length alphabet) — produced only by the upstream `STANDALONE_PICTURE_GENERATOR`,
never by the normal generator. The fork's generator emits no immutable squares,
but `validateDesc`/`newState` still **parse** the suffix so externally-supplied
or picture-derived shared IDs round-trip. `validateDesc` reproduces upstream's
per-line capacity check ("more numbers than will fit") and the suffix
length/character checks.

### D3 — Moves: drag-fill rectangle + cursor
`PatternMove` is a discriminated union: a `fill` move carries
`{ state: Full|Empty|Unknown, x, y, w, h }` (the upstream `F`/`E`/`U x,y,w,h`
rectangle); the keyboard path produces the same rectangle form (a 1×1 rect for a
single cell, or the control/shift drag rectangle). `interpretMove` keeps the
upstream drag mechanics on the `Ui` (drag start/end, snap-to-line for non-Unknown
drags, the "trash an area" exception for middle-button Unknown), returning a
`UI_UPDATE` during the drag and the concrete move only on release when a cell
would change. Immutable cells are never overwritten.

### D4 — Solver-gated generator → byte-match differential (§4.4)
`generate_soluble` loops: fill a random grid (each cell full with prob ~½ via the
upstream draw sequence), run the per-line solver, and accept only when the puzzle
is **uniquely line-solvable** from its clues. The published desc is therefore
decided by the solver's solved/stuck verdict, so a faithful byte-match requires
the TS solver to reach C's **exact verdict** on every intermediate board (not
merely "a correct solver"). Port `solve_puzzle`'s line logic (the
`do_row`/`do_col` fixpoint over `do_line` with its `compute_rowdata` clue match)
verbatim in behaviour. Differential: a committed gated
`pattern-differential.test.ts` asserting `newDesc(p, seed).desc === fixture.desc`
across the presets/seeds (the strongest bar, §4.3), generated from a transient
`puzzles/auxiliary/pattern-trace.c` (deleted with `pattern.c` at stage 2).

### D5 — `findMistakes` (playbook §3.5)
Pattern is uniquely solvable, so Check & Save needs `findMistakes`. The unique
solution is recovered by running the line solver from the clues to completion
(it must complete — the generator guaranteed unique line-solvability). Flag every
player cell whose `Full`/`Empty` mark contradicts the solved cell; an `Unknown`
cell is never a mistake. Render flagged cells with the standard inset
`COL_MISTAKE` overlay, **in the diff key** (§3.2 — a `drawnWrong` sidecar so the
overlay repaints on the Check-&-Save frame even when the tile value is unchanged).

### D6 — Rendering parity (`check_errors` red clues)
Upstream draws clue numbers grey, but recolours a line's clue numbers
**red** when that line is fully determined (no `Unknown` cells) yet its runs do
not match the clue (`check_errors`). Reproduce this — it is gameplay feedback, not
decoration. Cache key packs the 3-state cell + per-line error flags into an
`Int32Array` (§3.2, never `BigInt64Array`); clue-number colour is part of the
keyed state so a clue flips red/grey without a full repaint.

### D7 — On-screen keys
Pattern defines `current_key_label` (cursor-select cycles black/white/grey) but no
digit keypad. It is not a digit-entry game, so `requestKeys` is **not**
implemented (an absent hook yields an empty keypad, correct here — the Flip
precedent). The cursor + select keys drive entry on touch via the existing
controls.

### D8 — `needsRightButton` Game-interface flag (refinement)
Pattern is upstream `REQUIRE_RBUTTON`: empty cells are marked only with the
right button. The midend hardcoded `needsRightButton: false` for every TS game;
Pattern is the first TS port that genuinely needs it, so this change adds an
optional `readonly needsRightButton?: boolean` to the `Game` interface and wires
it through `Midend.getStaticProperties` (`this.game.needsRightButton ?? false`).
This is the allowed first-port interface refinement; the `ts-engine` spec delta
lands with archive. **Known follow-up:** the app shell's consumer of
`needsRightButton` is currently commented out (`puzzle-view-interactive.ts`), so
a touch-only device has no secondary-action affordance yet — this affects every
right-button TS game (Unruly shipped before the flag existed) and is an
app-shell task to surface to the owner, not a Pattern-specific defect. Pattern is
fully playable with mouse + keyboard (right-click, and `Ctrl`/cursor-select for
empty/cycle).

## Out of scope
- Explained `hint()` — a separate change (hint-authoring guide); Pattern's line
  solver is a strong candidate but lands after parity acceptance.
- `game_print` / printing.
