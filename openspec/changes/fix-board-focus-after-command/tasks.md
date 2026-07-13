## 1. Implementation

- [x] 1.1 `PuzzleScreen.focusBoard()` — focus `puzzle-view-interactive` in a
      microtask (both `wa-dropdown` and a clicked button focus themselves
      synchronously after our handler returns).
- [x] 1.2 Override `handleCommand` to call it for every handled command (the
      game menu, `data-command` controls, end-notification buttons).
- [x] 1.3 `handleToolbarClick` on `<puzzle-history>` for the toolbar buttons,
      which bypass the command bus. Skip a click that opens a menu
      (`slot="trigger"` in the composed path) and a keyboard activation
      (`detail === 0`).

## 2. Tests

- [x] 2.1 Tier-3 (`puzzle-screen.test.ts`): a handled command focuses the board,
      and only after a microtask; an unhandled one doesn't. A pointer toolbar
      click focuses it; a keyboard activation doesn't.

## 3. Verification

- [x] 3.1 Dev-verify in a real browser: menu → Solve → Enter walks Inertia's
      route (and does *not* reopen the menu); a real click on Undo returns focus
      to the board and the arrow keys then play; clicking the history dropdown's
      trigger still opens it with focus intact for arrow-key navigation.
- [x] 3.2 Full gate green.
- [ ] 3.3 **Owner acceptance** → archive.
