# Design: Guess TS port

Guess is small and self-contained, but it is the first port whose geometry is
not a `w×h` grid and the first to need an obfuscated-bitmap desc. The decisions
below record the non-obvious choices.

## D1 — File layout

Three files plus a local leaf:

- `state.ts` — `GuessParams`, `GuessState`, `GuessMove`, `GuessUi`,
  param/desc codecs, presets, `markPegs` (feedback), `isMarkable`, `status`,
  `textFormat`/`canFormatAsText` (upstream has none → `canFormatAsText = false`).
- `obfuscate.ts` — `obfuscateBitmap(bytes, decode)`, `bin2hex`, `hex2bin`.
  Local to Guess (the "lazy, idiomatic, local until a second consumer" doctrine,
  exactly like Galaxies' `dsf.ts` started local). It is a clear promotion
  candidate — `mosaic`, `mines`, and others obfuscate their descs too — so it is
  written as a standalone module that could move to `engine/` unchanged.
- `render.ts` — `GuessDrawState`, `colours`, `computeSize`, `setTileSize`,
  `newDrawState`, `redraw`, and the blitter drag sprite. Geometry helpers
  (`COL_*`, `GUESS_*`, `HINT_*`, `SOLN_*` macros) become small functions over the
  drawstate.
- `index.ts` — `Game` glue: `interpretMove`, `executeMove`, `computeHint`, the
  `guessGame` object, `registerGame`.

There is no `solver.ts` and no real `generator.ts`: `newDesc` just draws a random
sequence (honouring `allowMultiple`) and obfuscates it; "solve" reveals the
answer.

## D2 — State vs Ui split mirrors upstream exactly

Upstream keeps the *live editing* state in `game_ui`, not `game_state`. We do the
same, because our `Ui` is mutable and persisted via `encodeUi`/`decodeUi`, which
is precisely upstream's contract:

- `GuessState` (immutable, cloned per move): `guesses` (each a `{ pegs[],
  feedback[] }`), `holds[]` (the holds *as submitted*), `solution`, `nextGo`,
  `solved` (`+1` win / `-1` lose / `0` playing).
- `GuessUi` (mutable): `currPegs` (working row), `holds[]` (live), `colourCur`,
  `pegCur`, `displayCur`, `markable`, `dragCol`, `dragX`, `dragY`, `dragOpeg`,
  `showLabels`, `hint` (cached lexicographically-first row for incremental
  `computeHint`).

`changedState` (a new engine hook — see D11) reproduces upstream's
hold-carrying: after a transition, each non-held working peg is cleared and each
held one is pre-filled from the just-submitted row, holds are reset on solve, and
the cached hint is dropped on undo (`newGo < oldGo`).

## D3 — Move encoding

Two `GuessMove` variants, a discriminated union:

- `{ type: "guess", pegs: number[], holds: boolean[] }` — submit the working
  row. `executeMove` validates each peg against `[minColour, ncolours]`
  (`minColour = allowBlank ? 0 : 1`), runs `markPegs` to fill feedback, and sets
  `solved = +1` on all-correct-place else advances `nextGo` (losing, `solved =
  -1`, when the rows run out).
- `{ type: "solve" }` — reveal: `solved = -1` (upstream `solve_game` returns
  `"S"`, which sets lose-reveal). `canSolve = true`.

Upstream serialises these as `"G1,2,3_,4"` / `"S"`; our codec is a clean JSON
move, and the desc/seed reproducibility (D6) is what keeps shareable IDs working
— old C-format move strings are expendable per the pivot doctrine.

## D4 — Hint reproduces upstream's `'h'` key, not the unified `hint()` system

Upstream's hint is **not** a board overlay or an auto-played plan: pressing
`'h'`/`'H'`/`'?'` computes the lexicographically-first row consistent with all
feedback so far and *fills the working row* with it (a `game_ui` mutation),
moving the cursor to the submit position. We reproduce this exactly: the hint key
returns `UI_UPDATE` after `computeHint(state, ui)` mutates `ui.currPegs` /
`ui.pegCur` / `ui.displayCur`. This is the parity-faithful behaviour and needs no
custom hint rendering.

We deliberately **do not** wire Guess into the cross-game `hint()` plan hook in
this change (it would need bespoke hint rendering — a working-row preview — and
risks diverging from the C feel). It is a clean follow-up: `hint()` could return
a one-step plan whose move is the suggested submission. Deferred, noted in
"Out of scope".

`computeHint` is ported faithfully including the `ui.hint` cache (it only ever
*narrows*, so it is reused across calls and rebuilt from scratch after undo) and
the `mincolour`/`maxcolour` bounds that keep the lexicographic search fast.

## D5 — Drag sprite via blitter (Pegs precedent)

The drag interaction is faithful to upstream and built on the same blitter API
Pegs uses (`blitterNew`/`blitterSave`/`blitterLoad`). The drag state lives in
`GuessUi` (`dragCol`, `dragX`, `dragY`, `dragOpeg`); the drawstate mirrors it
(`dsDragCol`, `blitOx`, `blitOy`, `blitPeg`). `redraw` restores the saved
background, then (if dragging) saves the new background and draws the floating
peg — exactly upstream's load-then-save ordering. The blitter is allocated lazily
in `redraw` (we do not have `GameDrawing` in `setTileSize`), the same lazy
pattern Pegs uses.

Drag sources: the colour bar (new colour), a current-row peg (move/clear), or a
past-guess peg (copy a previous colour). Dropping onto a current-row slot sets
that peg; dropping a current-row peg outside clears it.

## D6 — Desc codec keeps game IDs byte-identical to C

`newDesc` mirrors `new_game_desc`: for each peg pick `random_upto(ncolours)`
(retrying on a repeat when `!allowMultiple`), write `colour+1` into a byte array,
`obfuscateBitmap(bmp, npegs*8, /*decode*/false)`, then `bin2hex`. `validateDesc`
and `newState` `hex2bin` + `obfuscateBitmap(..., /*decode*/true)`. Because our
`random.ts` is bit-identical and we port the SHA-1 obfuscation faithfully, a
given seed yields the *same hex desc* on the C and TS builds — so the
differential check is pure desc equality plus feedback-formula equality, with no
solver or board comparison needed.

`obfuscate_bitmap`'s masking function copies a base SHA state and finalises it
per 20-byte digest block (`final = base; SHA_Bytes(&final, numberbuf); ...`).
`sha1.ts` exposes `shaInit`/`shaBytes`/`shaFinal` but not a state copy, so we add
`shaCopy(s): ShaState` (a deep clone of the `ShaState` fields) — a minimal,
self-contained addition with its own unit test.

## D7 — No animation, no flash, no statusbar

`animLength` and `flashLength` return 0 (upstream both `0.0F`). `wantsStatusbar =
false` (upstream `false`). `isTimed = false`. The only `COL_FLASH` use is the
static "this row is markable" indicator colour, handled in `redraw`, not a timed
flash.

## D8 — Differential check

Mirrors Flood/Galaxies shape:

- **Gated** `guess-differential.test.ts`: against a frozen
  `__fixtures__/guess-c-reference.json` produced by a transient
  `puzzles/auxiliary/guess-trace.c`, assert (a) `newDesc` for the recorded seeds
  produces the exact C hex desc (proves rng + obfuscation end-to-end), and (b)
  `markPegs` reproduces C's feedback for recorded (guess, solution) pairs.
- **Advisory** `scripts/diff-guess.test.ts` (kept per precedent): same assertions
  live against the C build, review-only.

The transient `guess-trace.c` is added, used to freeze the fixture, then removed
together with `guess.c` on owner acceptance.

## D9 — Params, presets, validation

`GuessParams = { ncolours, npegs, nguesses, allowBlank, allowMultiple }`. Encode
`c{ncolours}p{npegs}g{nguesses}{b|B}{m|M}`; decode the same letters leniently
(unknown letters ignored, like upstream). Presets: **Standard**
`{6,4,10,false,true}` and **Super** `{8,5,12,false,true}`. `validateParams`:
reject `ncolours < 2 || npegs < 2` ("Trivial solutions are uninteresting"),
`ncolours > 10` ("Too many colours"), `nguesses < 1`, and
`!allowMultiple && ncolours < npegs`.

## D10 — Accessibility helpers

Port `currentKeyLabel` (Submit/Place/Hold labels) and `getCursorLocation`
(cursor rect around the active working-row peg) faithfully; both feed existing
engine surfaces and are cheap.

## D11 — New engine hook: `changedState` (upstream `game_changed_state`)

Guess is the first port to need upstream's `game_changed_state` with a
non-trivial body: the working row is reconstructed from the current state's holds
on **every** transition, including undo/redo, which produce no `Move` to hang the
logic on inside `interpretMove`. The eight prior ports all had an empty upstream
`changed_state`, so the midend never carried the slot.

We add an optional `Game.changedState(ui, oldState, newState)` and have the
midend call it (mutating `this.ui` in place) after every real
move/undo/redo/solve/restart and once at new-game setup (`oldState = null`),
**before** `setupAnimation` and the repaint, and **never** on a bare `UI_UPDATE`
(that is exactly when the player is editing the working row — reconciling then
would wipe the edit). This is a small, faithful, reusable primitive, specified in
the `ts-engine` delta. Placement detail: in `applyMove`/`undo`/`redo` the call
goes immediately before `setupAnimation`; in `startFrom`/`restartGame` it goes
after the `ui`/history are set up. Absent hook ⇒ no-op (the eight prior games are
unaffected; their `Game` objects don't define it).

The Guess working row is **not serialised** (the engine has no `encodeUi`/
`decodeUi`); `newUi(state)` seeds the row from the passed state and `changedState`
keeps it current thereafter. A mid-edit working row is therefore lost across a
save/reload — acceptable per the "old saves expendable" pivot doctrine and a
minor UX detail; in-session play (the parity-relevant path) is fully faithful.
