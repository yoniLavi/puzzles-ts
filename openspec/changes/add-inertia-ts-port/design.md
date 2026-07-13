# Design — Inertia TS port

## Context

Inertia (`puzzles/inertia.c`, ~2250 lines) is a movement/graph game, not a
deduction game. Port #32. The recent ports (the Latin family, Pattern, Light Up,
Slant, Bridges) all centre on a deductive solver plus `findMistakes` and an
explained hint; Inertia has none of those and instead leans on the parts of the
`Game` contract exercised by Pegs (blitter sprite), Sixteen (slide animation) and
Blackbox (status bar). The long-tail-risk checklist (playbook §1) comes back
clean: no supersede, no editor letters, no undo-via-state-string equality, no
keypad, no leaf library beyond `random.ts`.

## Goals / non-goals

- **Goal:** full behavioural parity — the slide, the death, the two flashes, the
  route-following aid, the status bar, the octant mouse input.
- **Goal:** a byte-match differential on the generator (§4.3).
- **Non-goal:** an explained `hint()` (see D3), `findMistakes` (see D4), or
  pixel-for-pixel reproduction of the C frontend (byte-parity scope is the
  generator/solver/codec — playbook §4).

## Decisions

### D1 — The solution-following aid is ported faithfully, into the *state*

Upstream's Solve does **not** finish the game. `solve_game` computes a route (a
sequence of the 8 directions) and returns it as an `S…` move; `execute_move`
installs it into the game state (`state->soln`, `state->solnpos`) without moving
the ball. Thereafter:

- `game_redraw` draws a yellow arrow on the ball pointing along `soln[solnpos]`;
- `IS_CURSOR_SELECT` (Enter/Space) plays that direction;
- any move the player makes is checked against the route — if it matches, the
  route advances; if it deviates, `execute_move` **re-solves from the new
  position** and installs the fresh route; if the new position is unsolvable, or
  the player dies, or the last gem is collected, the route is discarded.

This is a genuinely good aid and it is what parity demands, so it is ported as-is
rather than being re-expressed through the fork's hint system. Two consequences
for our engine:

- The route lives on the immutable `State`. Upstream refcounts it across
  `dup_game`; in TS it is a frozen `readonly number[]` shared by reference between
  states, with `solnPos` an ordinary number field — GC replaces the refcount
  (playbook §3.1). Two states can share one route array because neither ever
  mutates it.
- `executeMove` therefore **calls the route solver** when the player deviates
  from an installed route. That is a pure function of the state, so replay,
  undo/redo and save/load all reproduce it deterministically. It only runs while
  a route is installed (i.e. after the player pressed Solve), never in normal
  play, so the cost is confined to the aid.

### D2 — `solve()` returns the route move; the midend's "solved with help" flag is correct

`Midend.solve` executes the returned move and marks the game solved-with-help.
Inertia's solve move only installs the route, so the game is *not* won by it —
`status()` still reports "in progress" until the last gem is collected. That is
exactly upstream's behaviour (`state->cheated = true` while `game_status` keeps
returning 0), and the status bar says `Auto-solver used.` rather than
`Auto-solved.` until the board is finished.

### D3 — No `hint()`

The route arrow *is* the step-by-step guide, computed by the same solver a hint
would call, and the player already advances it one step at a time with Enter. A
`hint()` would duplicate Solve while offering no *why*: the fork's hint bar
(playbook / hint-authoring §1) asks a hint to explain why a move is **forced**,
and no step of an approximate TSP tour is forced — a different tour is equally
valid. Adding a narration like "this way to the nearest gem" would be the "just
because" fallback the narratable-deduction doctrine explicitly rejects. So the
Hint button stays off for Inertia, deliberately.

### D4 — No `findMistakes`

Every reachable position is legal: there is no wrong-but-legal state to detect.
Dying is not a mistake to be flagged, it is a state you undo out of (upstream's
`game_status` pointedly never reports a loss, "on the grounds that if the player
has died they're quite likely to want to undo and carry on"). Per playbook §3.5 a
game with no notion of a wrong-but-legal state correctly omits the hook, so Check
& Save degrades to plain Quick-save — the right behaviour here.

### D5 — The deaths counter lives on the Ui and resets on save/load

Upstream keeps `deaths` on `game_ui` (so that undo/redo never re-count a death)
and preserves it across serialisation via `encode_ui`/`decode_ui`. Our save
envelope (`engine/save.ts`) carries `params`/`desc`/`moves`/`pos` and has **no ui
slot**, so a quick-loaded game restarts the tally at zero. We keep `deaths` on the
`Ui` — moving it into the state would make undo rewind the tally, which is worse
and contradicts upstream's intent — and accept the reset as a small, display-only
divergence. Adding UI serialisation to the save envelope is an engine-level change
and is deliberately not bundled into a game port; if the owner wants the tally
preserved, that is a follow-up.

### D6 — Status bar cannot tick the gem count mid-slide

`game_redraw` recounts the gems *from the frame being drawn*, so upstream's status
bar counts down one by one as the ball slides through a line of gems.
`Game.statusbarText(state, ui)` sees no animation time, so ours updates once, when
the move lands. This is display-only, and the byte-parity scope doctrine (playbook
§4) puts display under "neat visuals", not reproduction. Everything else in the
status bar (`DEAD!`, `COMPLETED!`, the `Auto-solver used.` prefix, `Deaths: N`,
and the one-off decrement while the fatal move is still animating) is faithful.

### D7 — `NARROW_BORDERS` is defined by the web build

`cmake/platforms/webapp.cmake` defines `NARROW_BORDERS`, so the browser build's
Inertia has `BORDER = 1`, not a full tile (playbook §3.2). We port the narrow
variant — parity is with what the browser actually showed.

### D8 — Byte-match differential is feasible; the `qsort` is a red herring

The desc comes only from `gengrid`, whose RNG draws are two `shuffle` calls (the
piece grid, then the gem-candidate list) — both reproduced bit-identically by
`random.ts`. The `qsort` in `solve_game` sorts `backedges`, whose keys
(`target·n + source`) are **distinct by construction** (two directions out of one
node can never reach the same node — distinct rays from a point share only their
origin, and the origin case is excluded), so tie-order is not even a question; and
`solve_game` never touches the desc anyway. Unlike Undead (§4.8), byte-match is
therefore on the table, and the differential asserts it.

### D10 — The bare digit keys are accepted, not just `MOD_NUM_KEYPAD` ones

Upstream binds the eight directions to the number pad — but only with the
`MOD_NUM_KEYPAD` bit set. **This web frontend never sets that bit:**
`puzzle-view-interactive.ts`'s `puzzleKeyMap` handles the arrow keys and then
falls through to "any single character → its char code", so a number-pad `7`
arrives as the plain character `'7'`. The consequence in the shipped C build is
that Inertia's four **diagonal** moves are unreachable from the keyboard
altogether — you can only make them with the mouse.

So the port takes the bare digits as well as the modified ones. This is a
deliberate (small) divergence, and it is the kind the fork exists for: without
it a keyboard-only player cannot play the game. Inertia binds no other digit, so
there is nothing for it to collide with.

### D11 — Dev-verify surfaced an app-shell focus bug (handed off, not fixed here)

Driving the route aid in the browser exposed a **pre-existing app-shell issue**:
after any command is picked from the game menu, focus is restored to the menu's
trigger button, so the next `Enter`/`Space` activates the *menu* instead of
reaching the board (`puzzle-screen.ts`'s window-level key redirect only fires
when `document.activeElement` is `body`/`documentElement`). Inertia feels it
hardest — its aid loop is literally "pick Solve from the menu, then press Enter
to follow the route" — but it swallows `CURSOR_SELECT` in **every** game that
takes a keyboard cursor, and it predates this port.

It is not fixed here: the correct fix is an app-shell focus change affecting all
32 games, and it needs a decision about the commands that legitimately open a
dialog (which must keep focus). Recommendation: a small follow-up change that
returns focus to `puzzle-view-interactive` after a menu command settles.

### D9 — Rendering: no per-tile cache key packing beyond upstream's

Upstream's drawstate is one `unsigned short` per cell holding the cell character
OR'd with the flash bits (`FLASH_DEAD`/`FLASH_WIN`) — already the packed-int
pattern the playbook prescribes, so it ports directly to an `Int32Array` (§3.2).
There is no mistake/hint overlay to fold into the diff key: the route arrow is
drawn on the *ball*, which is a blitter sprite repainted every frame, so it can
never go stale (the §3.2 overlay trap does not apply). The blitter follows the
Pegs pattern — allocated lazily in `redraw` (we do not have a `GameDrawing` in
`setTileSize`).
