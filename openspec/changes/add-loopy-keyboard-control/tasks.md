# Tasks — add-loopy-keyboard-control

## 1. Decide what an arrow key means — **DONE, see `design.md`**

- [x] 1.1 **Cursor's home: a dot** (D1). Chosen against face-walking and
      edge-stepping, both of which are ill-defined exactly where the game is
      most interesting. A dot always has a ring of incident edges on every
      tiling, and the grid already supplies it — `GridDot` carries `x`, `y` and
      `edges` in clockwise order; `GridEdge` carries `dot1`/`dot2`. No geometry
      to invent.
- [x] 1.2 **Arrow → edge: angular nearest, repeat press takes the next** (D2).
      Measured dot degree across all 23 presets first: it **never exceeds 6**,
      and the aperiodic tilings turn out to be the *easy* case (~75% of Hats and
      Spectres dots have degree 2). The hard case is the triangular grid — and
      plain angular-nearest **has a reachability hole there**: six edges at 60°
      against four arrows at 90° ties at 60°/120° and 240°/300°, and a
      consistent tie-break can strand an edge from *both* its endpoints. The
      repeat press closes it by construction.
- [x] 1.3 Upstream has no prior art to check — `loopy.c` contains zero
      `CURSOR_` references, which is why the port inherited the absence. The
      transferable precedent is **Slide**, not another loop game: route the
      keyboard through the pointer's own code so the two are the same move by
      construction (D3), and move one step per press (D4).

## 2. Implement (per `design.md`)

- [x] 2.1 `ui.cursor: LoopyCursor` — `{ dot, edge, arrow, visible }` in
      `src/games/loopy/cursor.ts`. The *name* is the collection's
      (`unify-cross-game-vocabulary` settled `ui.cursor`); the *shape* is
      Loopy's, because the position is a dot index and an arrow press chooses
      an edge rather than moving. `cursor-vocabulary.test.ts` finds cursors by
      the grid-cell shape and so does not see it; `loopy-keyboard.test.ts`
      guards it, and the spec and `docs/games/input.md` say so.
- [x] 2.2 `edgesByDirection` ranks by angular distance (ties clockwise, then
      by index, so the order is total); `nextEdgeFor` takes the first, or the
      next after the current on a repeat of the same arrow, wrapping.
      `cursor.arrow` is reset to 0 whenever the cursor moves, so a fresh arrow
      never skips an edge.
- [x] 2.3 Enter → `LEFT_BUTTON`, Space → `RIGHT_BUTTON`, **and Backspace /
      Delete → `MIDDLE_BUTTON`** (the erase key was not in D3; design D4's
      settlement records why it is bound). No stylus cycle on the keyboard.
- [x] 2.4 One `setEdge(state, ui, e, button, stylus)`; the pointer arm and the
      keyboard arm differ only in where `e` comes from. The equality test (3.1)
      asserts autofollow extends a keypress exactly as it extends a click.
- [x] 2.5 Auto-advance on drawing a line, one dot per press, the drawn edge
      staying chosen so Enter-Enter undraws; **plus Shift+arrow travel** (walk
      one dot along the first-ranked edge, touching nothing) so a player can
      reach another part of the board without drawing across it. Design D4
      records the decision; the coverage test asserts every dot on every preset
      is reachable by travel alone.
- [x] 2.6 A `COL_CURSOR` disc under the cursor's dot and a halo under the
      chosen edge, both from grid geometry, each painted *beneath* the mark it
      highlights so the edge's own state stays legible.

## 3. Verify

- [x] 3.0 `loopy-keyboard.test.ts`, "the arrow rule covers every edge on every
      tiling": for each of the **23 presets**, from every dot, `degree` presses
      of each arrow choose each incident edge exactly once and the next press
      wraps; every edge is reached from either endpoint; every dot is reachable
      by travel. **Two things the proof found that the design's one-seed sweep
      had not**: a degree-**7** dot on Penrose rhombs (the design said "never
      exceeds 6" — corrected in `design.md`; the rule never depended on the
      number), and that the aperiodic tilings need boards ≥ 6×6. The triangular
      hole is exhibited, not described: the test finds edges that are the
      first choice of no arrow from *either* end, and shows the repeat reaches
      every one of them.
- [x] 3.1 Same edge set by keyboard and by click, autofollow off and on
      (`toEqual` on the move, then on the boards; with autofollow on the corner
      click is extended round the corner and so, identically, is the keypress).
      Enter/Space/Backspace compared step for step against left/right/middle
      through six state changes.
- [x] 3.2 Tier-2.5 frame on **Spectres** 6×6 through a real `Midend`: no cursor
      op before the first key; after one arrow exactly one halo line and one
      disc, landing on the chosen edge's endpoints and the cursor's dot, each
      painted before the mark it sits under; snapshot committed; a pointer press
      clears both.
- [x] 3.3 `NO_KEYBOARD` is empty, with a comment saying it is meant to stay so.
      `input-parity.test.ts`, `cursor-vocabulary.test.ts` and
      `emittable-keys.test.ts` green (258 tests).
- [x] 3.4 Browser pass in Chrome via `playwright-cli` — see the note under
      "Owner acceptance" below for what was seen.

## 4. Close out

- [x] 4.1 `loopy` spec: ADDED "Loopy is playable from the keyboard alone";
      the old "Loopy input and rendering" is **REMOVED** and re-founded as
      "Loopy pointer and keyboard input, and rendering" — `openspec` refuses a
      MODIFIED delta that drops the "cannot yet play" scenario, which is the
      right call, so the requirement is retired whole and every surviving
      sentence and scenario reproduced.
- [x] 4.2 `help/games/loopy.md` documents the keys and what the cursor looks
      like.
- [x] 4.3 `docs/games/input.md` § "Giving a geometric game a keyboard" — six
      things that generalised, including the one that did not fit the shared
      cursor and why.
- [x] 4.4 `openspec validate add-loopy-keyboard-control --strict` — valid.
- [ ] 4.5 **Owner acceptance** — a new control scheme, judged on feel. Two
      choices in particular are the owner's to overrule: Shift+arrow as the
      travel key, and auto-advance keeping the drawn edge chosen (so Enter
      twice undraws) rather than clearing the choice.
