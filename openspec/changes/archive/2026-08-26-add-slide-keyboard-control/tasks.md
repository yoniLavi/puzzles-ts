# Tasks — add-slide-keyboard-control

## 1. Decide the interaction

- [x] 1.1 D1's open point: **one cell per press**. Not a preference — a
      slide-to-the-end cursor cannot stop *inside* a corridor, so it cannot
      reach every cell of the reachable set, and a keyboard that cannot express
      a move the drag can express is the defect this change exists to remove.
      That is the same objection D1 already used against the free cursor.
- [x] 1.2 D2 confirmed in the browser: with a route installed, Enter walks it to
      completion; the route's orange accent and the red cursor coexist legibly.

## 2. Implement

- [x] 2.1 `SlideUi` splits into **grab** (ephemeral, cancelled with the board)
      and **cursor** (a position on a grid whose size has not changed, so it
      survives). D3a settled by breaking the assumption instead of choosing
      between its horns: there are not two states to keep apart, there is *one
      grab reached two ways*, so the drag fields were renamed rather than
      duplicated — `dragging`→`grabbed`, and with them `FG_DRAGGING`→`FG_GRABBED`
      and `COL_DRAGGING*`→`COL_GRABBED*`, because `dragging` set true by a
      keypress is false documentation. No `grabFromKeyboard` flag: nothing
      downstream branches on how the block was picked up.
- [x] 2.2 `interpretMove` gains the cursor branch. `grabBlockAt` and
      `releaseGrab` are the one grab implementation, called by both arms.
- [x] 2.3 D3 verified, and guarded by asserting the **mapping** rather than an
      outcome, so a fold widened into a range fails the test.
- [x] 2.4 `render.ts` draws the cursor. The grabbed block is drawn *exactly* as
      the drag draws it — one grab, one rendering; the cursor is what
      distinguishes keyboard play. **The flag word was full** (31 usable bits,
      all spoken for): the bit came from deleting `BG_NORMAL`, which was written
      on every non-target square and read nowhere.
- [x] 2.5 Cursor visibility follows Flip and Mosaic (checked, per the task):
      move-and-reveal in one press, hidden by any pointer press.

## 3. Verify

- [x] 3.1 Tier 1: the same journey by keyboard and by drag, compared on move,
      board and move count. Asserted as the equality, not as the keyboard alone.
- [x] 3.2 Tier 1: a step leaving the reachable set is refused, grab retained.
- [x] 3.3 Tier 1: with a route installed the select key still walks it, and the
      keyboard gets it back once the route is gone.
- [x] 3.4 Tier 2.5: four render scenarios on a **warm** draw state + snapshot.
- [x] 3.5 Browser (Chrome, `playwright-cli`): cursor moves and renders, a block
      grabs and lights, an illegal step is refused, a commit registers
      (`Moves: 0` → `Moves: 1`), Escape releases, and a board was driven to
      completion with no pointer. Checked in **both** schemes, on the key block,
      the wall and the exit area — the three materials the colour had to survive.
- [x] 3.6 Touch and mouse unchanged: the existing drag and long-press tests pass
      untouched, and the pointer arms are the same code they were.
- [x] 3.7 **Every new guard was proved to fail**: reachable check removed, step
      widened to two cells, `FG_CURSOR` never set, `cancelGrab` clearing the
      cursor, pointer takeover removed, Escape re-swallowed. Each went red at
      exactly the intended test and green again on restore.

## 4. Docs and specs

- [x] 4.1 `slide` spec: MODIFIED "Slide game implements the Game interface" —
      the drag-only clause dropped, the `findMistakes` clause kept. (The
      proposal's warning was right: the sentence is **not** in the input
      requirement, and a delta aimed there would have published a spec
      announcing a removal it had not made.) Plus the ADDED keyboard
      requirement. The parameters prose does not repeat the claim.
- [x] 4.2 `help/games/slide.md` describes the keyboard controls, the one-move
      rule, and what Solve's route does to the select key.
- [x] 4.3 `docs/games/input.md` § "Giving a drag game a keyboard" (the pattern
      and the four wrong answers available) and § "The numeric keypad never
      arrives" (the cancel keys, below); `docs/games/rendering.md` § "A packed
      diff key runs out of bits…" and the colour-span paragraph under the
      escape hatch.
- [x] 4.4 `openspec validate add-slide-keyboard-control --strict`.
- [x] 4.5 Owner acceptance — given 2026-08-26.

## 5. Found while here

- [x] 5.1 **Escape was a dead key across the whole app.** `handleKeyEvent`
      swallowed it whether or not there was a gesture to cancel, so Pearl's and
      Rectangles' shipped `button === 27` cancel arms could never run — and
      their `button === 8` half could not either, because this frontend sends
      **127** for Backspace. Slide needed a live cancel key, so the frontend now
      forwards Escape as 27 when no pointer is down, and those two games accept
      127. New `app-shell` requirement + tier-3 tests, both arms proved to fail.
      Picked up here rather than left for `audit-input-mode-parity`, which is
      the *sweep*: this one was already in the blast radius.
- [x] 5.2 `drawRectCorners` gained an optional `thickness` (default 1, so no
      other game moves). Upstream's hairline is sized for ink on paper; Slide's
      board is four shades of one grey and a 1px stroke had nothing carrying it.
- [x] 5.3 Deleted a stray `</content>` tag left by an old authoring tool in two
      **live** specs (`slide` ×1, `dominosa` ×2). Not routed through a delta:
      it is corrupted markup inside requirements this change does not touch, and
      a MODIFIED block reproducing a whole requirement to drop a junk line is
      more risk than the fix. The same litter is in the `2026-07-10-add-dominosa-*`
      archives and was left there — the archive is the record, not a live input.
