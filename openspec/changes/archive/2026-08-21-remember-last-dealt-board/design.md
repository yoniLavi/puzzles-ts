# Design — remember-last-dealt-board

## D1: A game ID is not a save, and putting it in the save table is what breaks the badge

The tempting fix is two lines — delete `puzzle.totalMoves > 0` and let the
autosave cover an untouched board. It works, and it costs the home screen.

`home-screen.ts` renders `?game-in-progress=${savedGames.autoSavedPuzzles.has(puzzleId)}`.
That set is derived from the autosave table, so the table is not merely storage:
it is the *definition* of "you have something going here". Writing a row for every
puzzle a player glances at makes the badge true everywhere, which is the same as
making it say nothing.

So the ID goes somewhere that already holds per-puzzle preferences and is not
consulted by any badge: the `PuzzleSettings` blob, one field along from the
`params` that already records "the type this puzzle should open as". The new field
records "the *board* this puzzle should open as", which is the same kind of fact
one level finer.

**No schema bump.** `PuzzleSettings` is a JSON blob stored under
`{ id: puzzleId, type: "puzzle" }`; an added optional key reads as `undefined` on
every record written before it, which is exactly the "no game remembered" case.
Same argument `SaveType.Quick` made for adding an enum value under the existing
compound indexes.

## D2: Re-deal from the ID; do not try to preserve anything else

The remembered board is re-dealt through `newGameFromId`, which is the same path
the URL-hash case uses. It restores **the board and nothing else** — no move log,
no timer, no undo history.

That is not a shortfall, because of *when* this path runs: only when there is no
autosave, and there is no autosave precisely when no move has been made. There is
nothing else to preserve. A game with moves in it takes the autosave branch above
and is unaffected by this change.

## D3: A remembered ID this build cannot deal is dropped, not surfaced

`newGameFromId` can fail — a params form that no longer validates (ABCD's board
sizes were bounded on 2026-08-21; Seismic's per-mode cell bound moved before
that), or a desc a changed generator no longer accepts.

The URL-hash case answers that with `showAlert("Ignoring invalid id in URL")`,
which is right: the player typed that, or followed someone's link, and is entitled
to know it did not work. **The remembered ID is the opposite case** — the player
never asked for it, and a modal about a board they did not choose is noise about a
decision they did not make. So it is dropped silently (with a `console.warn`), the
stale key is cleared so the next load does not retry it, and a fresh game is dealt.

This is the same judgement `restoreAutoSavedGame` already makes about an
unplayable autosave, in the same words: *one board the player did not ask to keep,
and refusing to open the game at all is far worse than losing it.*

## D4: Record on deal, not on move

The write happens where `puzzle-screen` already notices the game ID changed:

```ts
if (puzzle.currentGameId !== this.savedGameId) {
  this.savedFilename = undefined;
  this.savedGameId = puzzle.currentGameId;
  await settings.setLastGameId(puzzle.puzzleId, puzzle.currentGameId);
}
```

Inside the existing guard rather than beside it, deliberately:
`handlePuzzleGameStateChange` fires (debounced) on **every** state change, so an
unguarded write would put a DB round-trip behind every move to store a value that
did not change. Guarded, it is one write per board dealt.

The guard also gets the *superseding* case right for free. Mines rewrites its desc
after the first click (`supersededDesc`), which changes `currentGameId` — so the
remembered ID becomes the superseded one. That is the correct board to re-deal,
and it only ever matters if the autosave is missing, which after a click it is
not.
