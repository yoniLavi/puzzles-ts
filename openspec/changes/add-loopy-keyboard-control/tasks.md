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

- [ ] 2.1 Cursor state on the `Ui` — the dot index plus the highlighted incident
      edge — named for what it holds. Match the nearest neighbour's vocabulary
      rather than inventing a new one; `unify-cross-game-vocabulary` lands
      first, so take the name it settles on.
- [ ] 2.2 The arrow rule (D2): sort the dot's incident edges by angular distance
      from the pressed arrow, take the first, and advance on a repeat of the
      same arrow. **Reset the repeat index when the arrow changes or the cursor
      moves**, or the second press of a fresh direction skips an edge.
- [ ] 2.3 **Enter and Space are the left and right mouse buttons** (D3): Enter
      toggles line↔unknown, Space toggles cross↔unknown. Both already in
      `puzzleKeyMap`. Note the keyboard does **not** need the three-state cycle
      the stylus needs — it has two keys, so it mirrors the mouse directly and
      the cycle stays a touch affordance.
- [ ] 2.4 **Route the keyboard through the same code the pointer uses.** The
      auto-follow preference extends a click along a forced path; a keyboard
      select must take that path, not a parallel one. This is the Slide rule and
      it is the difference between two routes agreeing and two routes *being*
      the same move.
- [ ] 2.5 Cursor travel (D4): try auto-advance to the far dot on drawing a line,
      **one dot per press**, and check un-drawing stays easy (arrow back, Enter
      again toggles the same edge off).
- [ ] 2.6 Render the cursor and the highlighted edge on every tiling, from grid
      geometry rather than a lattice.

## 3. Verify

- [ ] 3.0 **Write this one first** (D5), because it is the proof of D2's
      coverage claim rather than a check on it: for **each of the 23 presets**,
      walk the (dot, arrow, select) transition graph and assert **every edge is
      reachable and settable to all three states**. Guaranteeing coverage by
      construction is the reason the arrow rule has a repeat press; this is what
      makes that guarantee true rather than argued. It is also what would have
      caught the plain-angular-nearest hole had that rule been chosen.
- [ ] 3.1 **Test the equality, not the new path** (the Slide lesson): make the
      same edge change both ways and compare the move, the board and the move
      count. Asserting the keyboard in isolation passes just as happily against
      a second input model you were trying not to build.
- [ ] 3.2 Tier 2.5 render scenario for the cursor on at least one aperiodic
      tiling. **Do not let 3.0 stand in for this** — a coverage proof says an
      edge is reachable and nothing about whether a player can see the cursor on
      a Penrose patch, which is a rendering question and needs eyes (the input
      audit's design D3, which holds here unchanged).
- [ ] 3.3 **Remove `loopy` from `NO_KEYBOARD` in
      `src/engine/input-parity.test.ts`** — the acceptance test for this change
      is already written, and it also asserts that a keyboard-only sequence
      *commits a move*, not merely that a key was consumed.
- [ ] 3.4 Browser pass in Chrome via the `playwright-cli` skill: play a board to
      completion with no pointer, on a square grid and on one aperiodic tiling.

## 4. Close out

- [ ] 4.1 `loopy` spec: replace the open-defect paragraph in "Loopy input and
      rendering" with the control scheme as a normative rule.
- [ ] 4.2 `help/games/loopy.md`: document the keys.
- [ ] 4.3 `docs/games/input.md` § "Giving a drag game a keyboard" — add whatever
      generalises about giving a *geometric* game a keyboard, if anything does.
- [ ] 4.4 `openspec validate add-loopy-keyboard-control --strict`.
- [ ] 4.5 Owner acceptance — this is a new control scheme, so the judgement is
      how it feels, not whether the keys are wired.
