# Design — audit-input-mode-parity

## D1. What "parity" means, so the sweep has a pass/fail

Not "every mode does the same thing" — a finger has no right button and a
keyboard has no coordinates, so identical *mechanics* are impossible and not
wanted. The bar is **reachability**:

> Every input the game accepts is reachable in every mode, and a player using one
> mode alone can play a board to completion.

That gives each cell of the 57 × 3 table a decidable verdict, and it is the bar
the frontend's own affordances were built for: long-press and two-finger tap
exist to give touch a right button, and the on-screen keyboard exists to give
touch the character keys.

Three verdicts, and **the third must be written down or it is indistinguishable
from the first**:

- **OK** — reachable, checked.
- **BROKEN** — not reachable, and should be. A defect.
- **EXEMPT** — not reachable, deliberately, with the reason stated *in the spec*.
  An exemption that lives only in a comment or only in someone's head is how
  "nobody has thought about this" and "we decided this" become the same thing.

## D2. Check the instrument before trusting the sweep

This repository's standing rule, and it applies sharply here because the obvious
instrument is misleading in both directions.

**Grepping a game's `index.ts` for `CURSOR_UP` under-reports.** Several games get
their cursor handling from a shared helper — `border-grid.ts`'s
`interpretBorderGridInput`, the latin-family input helper, `gridCursorMove`. A
sweep that reads only the game file will convict games that are fine.

**A press-level test over-reports.** The existing touch guard passing tells you a
press works, not that the game is playable — the §3.8c trap breaks the *drag*
while leaving the press intact, so a game can pass the current sweep and still be
unusable with a finger.

**And a third, found the hard way on 2026-08-26: no behavioural sweep of any
depth can see a key the frontend never sends.** Feed `interpretMove` the button
`8` and a game testing `button === 8` handles it perfectly — through a real
`Midend`, at any tier. The defect is not in the game; it is that nothing
upstream of it emits `8`, because `puzzleKeyMap` sends `127` for Backspace. That
is invisible to the instrument this design chose, and it had shipped in **fourteen
of the fifty-seven games** — a quarter of the collection, found in one pass by a
check nobody had built, against a trap the playbook has carried for months.
Ascent's cost a keyboard player any way to correct a typo mid-number.

The check that sees it is a **source scan**, not a behavioural test, and that
follows from what is being asserted: *that no behaviour exists*. Read the codes
`puzzleKeyMap` can produce, read the codes the game sources compare against,
fail on a comparison with no producer. Built and green as
`src/engine/emittable-keys.test.ts`; task 3.5 is what remains.

**The same instrument check applies to this document.** The §3.8a bullet in the
proposal asserted that `MOD_NUM_KEYPAD` is never set. It is set, and always has
been — an audit acting on that sentence would have deleted Cube's and Bricks'
*working, tested* keypad bindings as dead code. So: **before convicting a
binding, check what the frontend does, in the frontend, not in the playbook.**
Two of this repo's four documented input traps turned out to be misstated when
somebody finally looked, which is the same lesson `docs/test-strength.md` §7
records about measurements.

So: derive coverage mechanically *through the registry and the real `Midend`*
(the existing guard's own method — it works on a game the day it is registered,
without anybody remembering), and confirm a sample by hand in the browser. The
sweep is the net; the browser pass is what catches what the net's mesh is shaped
to miss.

Note the existing guard's own recorded near-miss, which is the shape to avoid:
an early cut "missed Untangle entirely, because its vertices sit at arbitrary
points that a coarse grid never hit" — it swept, found nothing, and would have
reported health. **A sweep must be able to say how many live targets it actually
hit**, and fail when that is zero.

## D3. Where the collection-wide guard can and cannot reach

Worth deciding up front, because it bounds what this change can promise.

**Reachable by an in-process sweep** (tier 1, through a real `Midend`): whether a
press, a drag sequence, or a cursor key is *consumed* and what it leaves behind;
whether a long-press-as-`RIGHT_BUTTON` drag does what the left-button drag does;
whether a game responds to any cursor key at all.

**Not reachable in-process**: whether the resulting gesture is *usable* — hit
targets big enough for a fingertip, a cursor a player can see, an on-screen
keyboard that offers the keys the game wants. Those need the browser, and the
audit should say plainly which findings are which rather than implying the sweep
covers both.

**A hole underneath both**: `src/utils/touch.ts` has no tests, and it is where
the gesture *decisions* are made. A per-game sweep that sends a synthetic
`RIGHT_BUTTON` proves the game copes with the decision; it does not prove
`detectSecondaryButton` makes the right one. Those are two different guards and
the audit should not let one stand in for the other.

**Deliberately out of scope**: cross-engine behaviour. Chrome alone is sufficient
evidence for this phase (owner directive, 2026-07-28) and "WebKit untested" is
not an open gap.

**Two operational notes for whoever does the browser pass**, both of which cost
this project time on 2026-08-26 and neither of which is guessable:

- **The colour-scheme setting defaults to `"light"`, not `"system"`**, so
  Playwright's `emulateMedia({colorScheme:'dark'})` does nothing — the media
  query is never consulted. `localStorage.colorScheme` is only an early-paint
  mirror. The setting lives in IndexedDB: database `PuzzleAppData`, store
  `settings`, record `puzzle-common`, field `data.colorScheme`. Write it, then
  reload, then confirm `document.documentElement.className` contains `wa-dark`
  *before* screenshotting anything.
- **A keypress sent immediately after `page.goto` is swallowed** by the focus
  redirect. Send a throwaway key or wait before concluding that the first press
  did nothing — an input sweep is precisely the activity that would misread it
  as a defect.

## D4. Fix inline, or file — the split

`audit-author-known-issues` is the precedent: it fixed three live defects in the
audit change and promoted or withdrew the rest with reasons.

**Fix here** when the fix is local and the correct behaviour is not in question —
the §3.8c right-onto-left fold in a game that has no use for a secondary button,
a missing bare-digit binding beside an existing keypad one. These are one-line
fixes whose only risk is regressing another mode, which the guard now covers.

**File separately** when a new interaction has to be *designed* — Loopy's missing
keyboard is not a binding, it is "where does a cursor live on eighteen different
tilings", which is a change of its own with its own design. Slide is the worked
example of that shape, and it is now **done and archived**
(`2026-08-26-add-slide-keyboard-control`), so it is a reference rather than a
dependency.

The distinction is not size, it is whether anybody has to make a product
decision.

**A third case, which neither branch handles and which this audit will meet
again: N games sharing one defect usually means the layer below is wrong.** The
dead-Escape finding presented as three per-game bugs and D4 as written would
have filed three per-game fixes; the actual repair was one line in
`view-interactive.ts`, and fixing it per-game would have left three files each
testing a code nothing sends. Likewise the seven dead erase keys were not seven
bugs but one missing shared predicate — now `isEraseKey`/`isCancelKey` in
`engine/pointer.ts`. **So before recording the second instance of a finding, ask
what would have to be true for both, and fix that instead.** This is where
`needsRightButton` (task 4b.1) most likely lands too: eighteen games declaring
a capability nothing reads is not eighteen findings.

## D5. Loopy is the interesting policy question

Loopy is now the **only** game whose spec normatively says it has no keyboard —
Slide's sentence went with `2026-08-26-add-slide-keyboard-control`. Loopy's input is per-*edge* across eighteen
tilings including aperiodic ones, so "move the cursor to the next edge" has no
canonical meaning — upstream gives it no keyboard either (checked against
`loopy.c` in the sibling clone: **zero** `CURSOR_` references, so the port
inherited the absence rather than dropping a cursor it was given), and the port
recorded the inheritance rather than deciding it.

The audit does not have to solve Loopy. It has to force the choice: either it is
**EXEMPT** with the reason in the `loopy` spec and its help page, or it is
**BROKEN** and gets a change. What it may not remain is undecided-and-unwritten,
because that is the state that made nine games touch-dead for months.
