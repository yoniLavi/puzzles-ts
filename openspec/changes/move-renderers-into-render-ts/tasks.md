# move-renderers-into-render-ts — tasks

`re-express-the-collection` B5, second half. Implemented 2026-09-06.

## 1. One place for a renderer

- [x] 1.1 fifteen — 600-line `index.ts` → 366 + a 261-line `render.ts`.
- [x] 1.2 sixteen — 1,438 → 803 + 664. The collection's largest `index.ts`.
- [x] 1.3 flip — 944 → 742 + 250. Object-literal methods became standalone
      functions, referenced by shorthand.
- [x] 1.4 pegs — 1,114 → 796 + 352.

## 2. Each render.ts owns its board origin

- [x] 2.1 The pixel origin lives in `render.ts` and `interpretMove` imports it,
      per `unify-the-board-origin`. True in all 57 games now.
- [x] 2.2 **Flip's four copies collapsed to one.** `tileSize >> 1` was written
      in `interpretMove`, `computeSize`, `redraw` and `drawTile`. The earlier
      sweep missed it because its key was "defined in more than one file" and
      all four shared `index.ts`.

## 3. Prove the move moved nothing

- [x] 3.1 **Line-by-line pure-move check** on all four: every line removed from
      `index.ts` found verbatim in `render.ts`. Unmatched lines enumerated and
      each explained — a declaration that gained `export`, an import that
      changed, or (flip only) a method signature that became a function.
- [x] 3.2 `tsc -b --noEmit` clean; the four games plus
      `capability-surface.test.ts` pass — 221 tests, snapshot unmoved.
- [x] 3.3 **Ran the app**, because this is render code and a green suite is not
      a rendered frame. All four correct in Chrome: Sixteen's gutter arrows and
      bevels, Fifteen's recessed border and tiles, Pegs' cross board, and Flip's
      click flipping the right neighborhood — which is where a wrong border
      would have shown.

## 4. Record what is still divergent

- [x] 4.1 Flip and pegs remain single-file for state, moves and generation.
      Filed as B7 in `survey.md` rather than folded in here — it is a different
      divergence with a different argument, and B5 was scoped to the renderer.

## Findings

- **A scan keyed on "defined in more than one file" misses the copies that share
  a file.** Flip carried the exact defect `unify-the-board-origin` swept for, in
  four copies, and was reported clean. Same shape as the name-keyed misses this
  repo catalogs; added to `docs/games/mechanics.md` beside the coordinate rule.
- **The four games' `index.ts` shrank by 1,389 lines in total** and none of it
  was deleted — it moved.
- **The gate caught two things the targeted runs did not**, which is the reason
  the gate runs the whole suite:
  - **A runtime import cycle**, `pegs/index.ts → pegs/render.ts →
    pegs/index.ts`. `render.ts` needs Pegs' grid-cell values and index needs the
    renderer, and with no `state.ts` to hold the vocabulary the cycle is
    structural. Fixed by putting the grid values in `render.ts` beside the two
    draw-state overlay values already there, so **`render.ts` imports no value
    from `index.ts`** — only types, which erase. Flip escaped the same trap only
    because everything it takes from `index.ts` is a type.
  - **A stale ledger** in `hint-mark.test.ts`, which named fifteen and sixteen
    as the games whose renderer the sweep could not find *because it was in
    `index.ts`*. That is now false, and the list is empty — still asserting
    something, because a game that hides its renderer again reappears in it.
- **Two of Flip's four `>> 1` copies were still shadowing the exported
  `border()`** when the batch was first written, so the claim "collapsed to one"
  was not yet true. Caught by reading the file after writing the claim; the code
  now matches, and one expression for the origin remains.
