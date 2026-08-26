# Tasks — add-loopy-keyboard-control

## 1. Decide what an arrow key means (design.md, before any code)

- [ ] 1.1 Pick the cursor's home — dot, edge or face — against **all eighteen
      tilings**, not just the square one. Write down what the rule does on a
      Penrose patch and on a twelve-sided face, because that is where every easy
      answer stops working.
- [ ] 1.2 State the arrow → edge mapping as a rule a player can predict, and say
      what it does when a dot has three, five or seven incident edges.
- [ ] 1.3 Check upstream's other loop games for prior art before inventing one
      (`../puzzles/` is readable). Note what they do and why it does or does not
      transfer to an irregular tiling.

## 2. Implement

- [ ] 2.1 Cursor state on the `Ui`, named for what it holds. Match the nearest
      neighbour's vocabulary rather than inventing a new one — see
      `unify-cross-game-vocabulary`.
- [ ] 2.2 Select and erase reach **all three edge states**, the way the stylus
      cycle already does (`wantsStylusModifier`), so a keyboard player is not
      left with two of the three.
- [ ] 2.3 **Route the keyboard through the same code the pointer uses.** The
      auto-follow preference extends a click along a forced path; a keyboard
      select must take that path, not a parallel one.
- [ ] 2.4 Render the cursor on every tiling, from grid geometry rather than a
      lattice.

## 3. Verify

- [ ] 3.1 **Test the equality, not the new path** (the Slide lesson): make the
      same edge change both ways and compare the move, the board and the move
      count. Asserting the keyboard in isolation passes just as happily against
      a second input model you were trying not to build.
- [ ] 3.2 Tier 2.5 render scenario for the cursor on at least one aperiodic
      tiling.
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
