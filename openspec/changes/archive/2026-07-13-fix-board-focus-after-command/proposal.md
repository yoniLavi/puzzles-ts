# Fix: the board keeps the keyboard after you press a control

## Why

Clicking any control on the puzzle screen leaves the board deaf to the keyboard.

Pick a command from the game menu and `wa-dropdown` focuses its own trigger
button as it closes — so the next Enter *reopens the menu* instead of reaching
the puzzle. Click a toolbar button (undo, redo, hint, mark-all, check-&-save)
and focus stays on the button, so the cursor keys go nowhere. The stray-key
redirect in `puzzle-screen`'s `handleBubbledKeyDown` cannot rescue either case:
it only fires when `document.activeElement` is `body`/`documentElement`, i.e.
when *nothing at all* is focused. The only way back is to click the board.

This hits every keyboard-playable game — which is most of them, since a keyboard
cursor is standard across the collection. It is worst on **Inertia**, whose
solution-following aid is literally "pick Solve from the menu, then press Enter
to walk the route": the aid is unusable, because that Enter reopens the menu.
Surfaced by owner-acceptance testing of `add-inertia-ts-port` (its design D11),
and deliberately not fixed there — an app-shell focus change affecting every
game does not belong inside a game port.

## What Changes

- **A command hands the keyboard back to the board.** `PuzzleScreen` overrides
  `handleCommand` and focuses `puzzle-view-interactive` once the command has
  run. This covers the game menu, every `data-command` control, and the
  end-notification buttons.
- **A clicked toolbar button does too.** `puzzle-history`'s buttons are wired to
  their own click handlers rather than to the command bus, so they get their own
  path: a click listener on `<puzzle-history>` in the screen's template.
- **Two exclusions, both deliberate.** A click that *opens* a menu keeps focus
  (the open menu needs it for its own arrow-key navigation). A click with
  `detail === 0` — a keyboard activation, i.e. tab to the button and press Enter
  — keeps focus too: that player is walking the tab order on purpose and would
  lose their place. Only a real pointer click hands the keyboard over.
- Focus is handed over in a **microtask**, because `wa-dropdown` (as it closes)
  and a clicked button both focus themselves out from under us otherwise.

Dismissing a menu with Escape or a click-away is unchanged: focus returns to the
trigger, which is the correct and conventional behaviour for a dismissal.

## Impact

- Affected specs: `app-shell` (new capability).
- Affected code: `src/screens/puzzle-screen.ts`, `src/screens/puzzle-screen.test.ts`.
- Behavioural change for all 32 games; no engine or per-game code touched.
