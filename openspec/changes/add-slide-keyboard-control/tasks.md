# Tasks — add-slide-keyboard-control

## 1. Decide the interaction

- [ ] 1.1 Settle D1's open point: does a *selected* arrow press step one cell, or
      slide as far as the reachable set allows? Decide with a board in front of
      you, at the largest preset.
- [ ] 1.2 Confirm D2 — the Solve route keeps the step key while it is installed —
      still reads correctly once you have played it.

## 2. Implement

- [ ] 2.1 `SlideUi` gains the cursor and selection fields, alongside the existing
      drag fields. Keep the two apart: a keyboard selection is not a drag, and
      `cancelDrag` must not silently clear a keyboard selection (or must, but
      deliberately — say which).
- [ ] 2.2 `interpretMove` gains the cursor branch, built on `gridCursorMove` and
      `computeReachable`. Reuse the drag's move construction; do not write a
      second one.
- [ ] 2.3 Per D3, verify the cursor branch is unreachable from `asPrimary`'s
      right→left fold.
- [ ] 2.4 `render.ts` draws the cursor and the selected block, distinguishable
      from the drag preview and its landing shadow, in both schemes and at the
      smallest tile size.
- [ ] 2.5 Cursor visibility follows the collection's idiom: the first arrow press
      reveals the cursor rather than moving it, if that is what the other games
      do — check two of them rather than assuming.

## 3. Verify

- [ ] 3.1 Tier 1: keyboard sequence ≡ equivalent drag, in both resulting state
      and move count (D5).
- [ ] 3.2 Tier 1: an arrow press leaving the reachable set is refused.
- [ ] 3.3 Tier 1: with a Solve route installed, the step key still walks it.
- [ ] 3.4 Tier 2.5: render scenario + snapshot for cursor and selection.
- [ ] 3.5 Browser (Chrome via `playwright-cli`): **solve a board using only the
      keyboard.**
- [ ] 3.6 Confirm touch and mouse are unchanged — `touch-input.test.ts` still
      passes and the drag gesture still survives a long press.

## 4. Docs and specs

- [ ] 4.1 `slide` spec: MODIFIED "Slide input, movement and completion" — drop
      "mouse or touch drag only … it has no keyboard cursor", add the keyboard
      route and its scenarios. Check the *parameters* requirement, which repeats
      the claim in its own prose.
- [ ] 4.2 `help/games/slide.md`: describe the keyboard controls. It currently
      says only "Use the mouse to drag the blocks around".
- [ ] 4.3 If the playbook gained anything (a keyboard-for-a-drag-game pattern),
      write it into `docs/porting/game-port-playbook.md` §3.8 in the same change.
- [ ] 4.4 `openspec validate add-slide-keyboard-control --strict`.
- [ ] 4.5 Owner acceptance before archiving — it is player-visible.
