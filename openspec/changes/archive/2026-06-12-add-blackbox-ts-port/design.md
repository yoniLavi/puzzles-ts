# Design: Port Black Box to TypeScript

## D1 — State representation: keep the unified grid, clone for immutability

Upstream stores one `unsigned int grid[(w+2)*(h+2)]` that overlays two disjoint
encodings: arena cells (offset `(1,1)`..`(w,h)`) carry ball flags
(`BALL_CORRECT`/`BALL_GUESS`/`BALL_LOCK`), and firing-range cells (the border
ring) carry laser display values (a laser number, or `LASER_HIT`/`LASER_REFLECT`
with flag bits). A separate `exits[nlasers]` maps each entry index to its exit
index (or hit/reflect), plus `LASER_WRONG`/`LASER_OMITTED`/`LASER_FLASHED`
overlay flags.

The port keeps this representation verbatim: `state.grid: Int32Array` of
`(w+2)*(h+2)` and `state.exits: Int32Array` of `nlasers`, with scalar fields
`w, h, minballs, maxballs, nballs, laserno, nguesses, nright, nwrong, nmissed,
reveal, justwrong`. Rationale:

- **The laser physics ports line-for-line.** `range2grid`/`grid2range`/
  `isball`/`fireLaserInternal` are subtle (the entry-cell instant-hit/
  instant-reflect priority, the clockwise/anticlockwise turn rules, the
  matched-pair numbering). A faithful grid layout lets the deductions be
  transcribed with confidence rather than re-derived; there is no corpus to
  catch a re-derivation slip.
- **Immutability is GC + clone, not `dup_game`/`free_game`.** `cloneState`
  copies the two typed arrays and the scalars (cheap; Galaxies/Sixteen do the
  same per `executeMove`). `executeMove` clones then mutates the clone, exactly
  the upstream shape minus the manual free.
- The vestigial `done` field (set but never read in C) is dropped.

A fully idiomatic per-field model (a `Set` of ball cells, a `Map` of laser
results) was considered and rejected: it would force a translation layer at
every `GRID(...)` site in the laser tracer, adding exactly the re-derivation
risk D1 exists to avoid, for no readability win in the hottest, subtlest code.

## D2 — Moves as a discriminated union

Upstream's `execute_move` parses a `sprintf`'d string (`T x,y`, `F n`, `R`,
`LB x,y`, `LC x`, `LR y`, `S`) with `sscanf` and `goto badmove`. The port uses

```ts
type BlackboxMove =
  | { type: "toggleBall"; x: number; y: number }
  | { type: "toggleLock"; x: number; y: number }
  | { type: "toggleColumnLock"; x: number }
  | { type: "toggleRowLock"; y: number }
  | { type: "fire"; rangeno: number }
  | { type: "reveal" }
  | { type: "solve" };
```

`executeMove` switches on `type`; illegal moves throw (the midend treats a throw
as a rejected move, the `badmove` analogue). Structured-clone-safe, so no custom
`serialiseMove`.

## D3 — Laser flag constants

The laser-result flag bits are kept as named constants in `state.ts`
(`LASER_OMITTED`, `LASER_REFLECT`, `LASER_HIT`, `LASER_WRONG`, `LASER_FLASHED`,
`LASER_EMPTY = -1`, `LASER_FLAGMASK`). `BALL_CORRECT`/`BALL_GUESS`/`BALL_LOCK`
likewise. `render.ts` imports the display-relevant ones. `LASER_EMPTY` is `-1`
(`~0` in C on a 32-bit `unsigned`, but every use is an equality/`!=` sentinel
test, so `-1` in a signed `Int32Array` is exactly equivalent and avoids the
unsigned dance).

## D4 — `checkGuesses(state, cagey)` and the deterministic feedback random

`checkGuesses` is ported faithfully, including the **cagey** path used by the
`R` (verify) move:

1. If any *already-fired* laser contradicts the player's guessed layout, pick
   one at random and flag it `LASER_WRONG`, set `justwrong`, reveal nothing
   else.
2. Else if any *unfired* laser would have distinguished guess from solution,
   fire one at random, flag it `LASER_OMITTED`, set `justwrong`.
3. Else run the full reveal: fire every laser on both the real and guessed
   layouts, mark divergences, and (if consistent and the ball count is in
   range) commit the guesses as correct, filling `nright`/`nwrong`/`nmissed`.

The "pick one at random" in steps 1–2 must be **deterministic per board state**
so that re-verifying the same wrong guess highlights the *same* laser (upstream
seeds a temporary `random_state` from the raw grid bytes). The port mirrors
this: `randomNew(new Uint8Array(grid.buffer, ...))` then `randomUpto`. This need
not be byte-identical to C (no corpus); it only needs to be a stable function of
the grid, which seeding from the grid bytes gives.

`check_guesses` mutates `state` in place in C. In the port it runs on the
already-cloned `executeMove` result, so it stays a local mutation of the new
state — pure with respect to the caller.

## D5 — Press-to-highlight laser flash (Ui + animLength)

Firing a laser (or pressing an already-fired one) briefly highlights its entry/
exit tiles. Upstream drives this through `game_ui`: `flash_laserno` (which
laser) and `flash_laser` (`0` none / `1` always, until `LEFT_RELEASE` / `2` only
while animating). `game_anim_length` returns `CUR_ANIM` when `flash_laser == 2`
(keyboard), and `redraw` sets `ds.flash_laserno` from `ui.flash_laser` +
`animTime`. The port keeps these three `ui` fields and the same `animLength`/
`redraw` logic. Mouse press → `flash_laser = 1` (held until release); keyboard
select → `flash_laser = 2` (cleared when the `CUR_ANIM` animation elapses).
`LEFT_RELEASE` returns `UI_UPDATE` and zeroes `flash_laser`.

## D6 — Status mapping, error counter, `changedState`

- `status(state)`: `reveal && nwrong == 0 && nmissed == 0 && nright >= minballs`
  → `"solved"`; `reveal` (otherwise) → `"lost"`; else `"ongoing"`. First port to
  return `"lost"`. The midend maps a solve-triggered reveal to
  `"solved-with-help"` itself; nothing game-side needed.
- `ui.errors` increments in `changedState` when `newState.justwrong &&
  ui.newmove` (a wrong *verify*, not an undo into a justwrong state). `newmove`
  is set true only when `interpretMove` returns a real move, and reset in
  `changedState`. The counter is **session-only** (the engine has no
  Ui-serialisation hook); upstream persists it via `encode_ui`. Documented
  minor divergence (Out of scope).

## D7 — `obfuscate.ts` promotion

Black Box is the second consumer of the obfuscated-bitmap desc codec Guess
ported. Per the established second-consumer promotion rule (`SortedMultiset`
when Pegs joined Flip; `Dsf` when the engine gained a second user), the module
moves `src/native/games/guess/obfuscate.ts` →
`src/native/engine/obfuscate.ts` unchanged (it was already written as a
standalone module anticipating this), and Guess's `state.ts` + `obfuscate.test.ts`
repoint their imports. No behavioural change; Guess's existing tests cover it.

## D8 — Desc format and obfuscation kept

The desc is the obfuscated hex bitmap `[w, h, ball1x, ball1y, …]` exactly as
upstream. Keeping the obfuscation is not nostalgia: the desc is the shareable
game id, and an un-obfuscated desc would print the ball positions in the URL,
revealing the answer. (Old C-format shared ids are expendable per the migration
doctrine, but there is no reason to diverge from a format that costs nothing and
already has a tested TS codec.) `validateDesc` checks length parity and that
every de-obfuscated ball coordinate lies in the arena.

## Testing

- **Tier-1 logic** (`blackbox.test.ts`): laser tracer on hand-verified layouts
  (straight miss → exit pairing; head-on hit; single-ball reflection;
  instant-hit and instant-reflect entry-cell cases; double-deflection path);
  `checkGuesses` reveal counting (right/wrong/missed) and the cagey
  single-error feedback determinism; desc obfuscate→deobfuscate round-trip and
  `validateDesc` rejections; params round-trip + `a-b` range + validation;
  `status` mapping across ongoing/solved/lost.
- **Tier-2 render-ops** (`blackbox-render.test.ts`): drive `redraw` against a
  recording `GameDrawing` double — a covered arena cell draws cover+circle, a
  guessed ball draws a black ball, a fired laser tile draws its number/`H`/`R`
  text, a wrong-guess reveal draws the red cross, the reveal button appears only
  when `CAN_REVEAL`.
- **Differential**: advisory/deferred (no gated corpus), per Cube/Fifteen.
