# unify-cross-game-vocabulary

## Why

**The 57 games are about to become the examples that many more games are copied
from** (owner, 2026-08-26; `docs/framework-rdd/README.md`, "The order of work").
That inverts the standing to leave accidental differences alone: every place two
games spell one concept differently is a fork in the road for whoever reads them
next, and a wrong turn that then gets copied into the next fifty games.

Three measured instances of the same defect, none of them a design choice:

- **The keyboard cursor's `Ui` contract** — one concept, **42 of 57 games, six
  names**: `hshow`, `cshow`, `curVisible`, `cursorVisible`, `cursor`,
  `displayCur`. The position field varies alongside it (`cx/cy`, `hx/hy`,
  `curX/curY`, `cursorX/cursorY`). The *core* is already identical in every one
  of them — `gridCursorMove` → assign → reveal → `UI_UPDATE`.
- **The completion vocabulary on `State`** — `cheated`, `usedSolve`,
  `hasCheated`, and `completed` vs `wasSolved` vs `solved` vs `complete`, for
  two concepts every game has. `winFlash` encodes the whole win-flash
  convention and **45 games hand-write `flashLength` anyway**; eight of those
  reproduce its condition verbatim and about six more differ only in the
  spelling of a flag.
- **The first-arrow-press question** — reveal-only, or reveal-and-move? Games
  answer both ways, with no per-game reason, so the collection behaves
  inconsistently for a keyboard player moving between puzzles.

**The guides actively told sessions to leave all three alone.** `input.md` said
"per-game policy stays per-game, deliberately: which `Ui` field holds the
cursor…"; `rendering.md` and `engine-catalog.md` said "a game with different
flag names … keeps its own `flashLength`". Those sentences were written while
the collection was a port being held still against an oracle, where not moving
was correct. That phase is over, and they have been corrected as part of this
proposal so no session acts on them in the meantime.

**This is not the framework.** It is the vocabulary cleanup that has to happen
before the framework can derive anything, and it is worth doing on its own
terms: a framework cannot derive Check & Save, the status bar, the win flash and
the difficulty contract from a concept each game names differently.

## What Changes

- **One cursor contract.** A shared `GridCursor` (`x`, `y`, `visible`) with
  `moveCursor` / `hideCursor` helpers in `engine/pointer.ts`, held by every game
  under one canonical `Ui` field. Games that do more while the cursor moves
  (Tents paints, Boats fills a line) read the position before and after exactly
  as they do now — the extra behaviour is untouched.
- **One completion vocabulary.** `completed` and `cheated` on `State`,
  everywhere, and `winFlash` adopted by every game whose celebration is the
  convention. A genuinely bespoke celebration keeps its own `flashLength`, and
  the proposal names which those are rather than leaving it to judgement.
- **One answer to the first-arrow-press question**, applied everywhere:
  **reveal *and* move**, which is what Flip and Mosaic already do and what
  `add-slide-keyboard-control` adopted after checking them. It is also the only
  answer that never costs a keyboard player a keypress.
- **Guards, so it cannot drift back.** `emittable-keys.test.ts` already fails on
  a game-local declaration shadowing a `pointer.ts` export, derived from the
  export list. Extend the same idea: a game declaring its own cursor-visibility
  field, or its own spelling of `cheated`, fails.

## Impact

- **Affected specs**: `ts-engine` — added requirements for the cursor `Ui`
  contract and the completion vocabulary. Per-game specs only where one states
  a flag name normatively.
- **Affected code**: wide and shallow — ~42 games for the cursor, ~14 for the
  flash, plus their renderers and tests. No solver, generator or hint logic.
- **Player-visible**: **only** the first-arrow-press unification, which makes a
  handful of games reveal-and-move where they revealed-only. That is the one
  part needing acceptance; everything else is a rename behind identical
  behaviour.
- **Save compatibility**: **not affected, checked.** Three games serialise a
  `Ui` (Ascent, Mines, Net) and Net's carries the cursor — but through an
  `encodeUi` *function* emitting `C<x>,<y>`, so the wire format does not know
  the field's name. State flag renames are internal for the same reason: saves
  replay a move log.
- **Not in this change**: the gesture table, and the Latin-family
  highlight-then-type flow. The latter is genuinely divergent where it counts —
  sticky pencil, mark-all semantics, what a re-press of the held digit does are
  player-visible and deliberately differ — so it follows `border-grid.ts`'s
  precedent when it is done, not this one's.
