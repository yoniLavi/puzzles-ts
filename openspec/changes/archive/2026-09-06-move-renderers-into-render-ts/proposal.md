# move-renderers-into-render-ts

**Readiness: ready.** `re-express-the-collection`'s batch B5, second half. The
first half (four aliased capability names) shipped as
`converge-capability-names-and-the-additive-rule`.

## The finding

**Four games kept their renderer in `index.ts` where 53 keep it in
`render.ts`**: flip (944 lines), pegs (1,114), fifteen (600), sixteen (1,438).
Three of those were among the largest `index.ts` files in the collection.

No reason for the difference belongs to any of the four puzzles. A reader
learning the collection from its corpus — which is how a new game gets written
here — met two answers to "where does a game's renderer live", with the majority
answer silent and the minority answer in the three biggest files.

## What came out of it beyond consistency

**Flip had the duplicated board origin, four times, inside one file.**
`unify-the-board-origin` swept eight games for exactly this defect and did not
see Flip, because that scan's key was *"defined in more than one file"* and
Flip's four copies of `tileSize >> 1` were all in `index.ts` — one for
`interpretMove`, one for `computeSize`, one for `redraw`, one for `drawTile`.
The split collapses them to one exported `border()`, which is what the earlier
change would have done had its key been the right one.

**That is the same instrument lesson this sweep keeps producing**, and it is now
recorded in `docs/games/mechanics.md`: a scan keyed on where a thing is defined
misses the copies that share a file, exactly as a scan keyed on a name misses
the games that named it differently.

## What changed, and what did not

Three of the four are **pure moves** — every line removed from `index.ts`
appears verbatim in the new `render.ts`, except the declarations that gained an
`export` and the import lines that had to change. Verified line by line.

**Flip is not a pure move and could not be**: its renderer was a set of methods
inside the `Game` object literal, so each became a standalone exported function
and is referenced by shorthand. Every changed line is still explainable by that
declared intent, plus the border collapse above.

Each game's `render.ts` now owns the board's pixel origin and `interpretMove`
imports it — the rule `unify-the-board-origin` established, now true in all 57.

## Impact

- Affected specs: none. No behavior, format or contract changes.
- Affected code: `src/games/{fifteen,sixteen,flip,pegs}/`.
- **Player-invisible.** The capability surface is unmoved, the frozen
  differentials pass, and all four were run in Chrome — Sixteen's gutter arrows
  and bevels, Fifteen's recessed border, Pegs' board, and Flip's click flipping
  the right neighborhood, which is the four-copy border collapse checked where
  it would actually show.
- **Still monolithic in their other concerns**: flip and pegs remain single-file
  for state, moves and generation, where most games split those out. That is a
  separate divergence and is recorded in `survey.md` as B7 rather than folded in
  here.
