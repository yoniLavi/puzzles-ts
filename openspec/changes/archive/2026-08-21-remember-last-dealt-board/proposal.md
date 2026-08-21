# remember-last-dealt-board

## Why

**Reloading a puzzle page deals a different board, unless you had already made a
move on it.** Owner-reported 2026-08-21 against `/abcd` on the dev server, and
reproduced: three loads of `/abcd` with no move made gave three different boards.

The cause is one condition in `puzzle-screen.ts`:

```ts
if (puzzle.totalMoves > 0 && !puzzle.isSolved) {
  // Wait to autosave until the user has made at least one actual move,
  // to avoid autosaving from just browsing through puzzles.
```

It is **not a regression** — `git log -L` puts that line in "Initial webapp
version", inherited from `puzzles-web` and untouched since. What changed is how
often it is hit: reloading before touching the board is the normal rhythm of a dev
server, and of a player who opens a puzzle, looks at it, and refreshes.

Nor is the condition wrong about the thing it protects. The home screen badges a
puzzle as having a game in progress by asking
`savedGames.autoSavedPuzzles.has(puzzleId)`, so autosaving on sight would light
that badge on all 57 puzzles the moment you scrolled past them. **The gate is
protecting the badge's honesty; it just also throws away the board.**

Those are two different facts, and only one of them belongs in the autosave table:

| fact | means | lives in |
|---|---|---|
| "you have a game in progress here" | a move log worth restoring | `savedGames`, `SaveType.Auto` |
| "this is the board this puzzle is showing" | a game ID, nothing more | *nowhere today* |

## What Changes

- **A puzzle remembers the ID of the board it last dealt**, per puzzle, in the
  existing `PuzzleSettings` blob next to the `params` it already keeps there.
- **A page load with no autosave re-deals that board** instead of generating a
  fresh one. The order of preference becomes: game ID from the URL → autosave →
  **last dealt board** → a new game.
- **No autosave record is created**, so the "game in progress" badge keeps meaning
  what it says. That is the whole reason this is not simply the two-line fix of
  deleting the `totalMoves > 0` gate (owner's call, 2026-08-21, from three options
  including that one).
- A remembered ID that this build can no longer deal is **dropped and replaced by
  a fresh game**, the same way an unplayable autosave is — one board is not worth
  refusing to open the puzzle over.

## Impact

- Affected specs: `app-shell` (a new requirement on which board a puzzle page
  opens with).
- Affected code: `src/store/db.ts` (one optional field on `PuzzleSettings`),
  `src/store/settings.ts` (its accessor pair), `src/screens/puzzle-screen.ts`
  (record it on deal, consult it on load).
- **Stored user data**: one new optional key inside an existing settings record.
  No schema bump — `PuzzleSettings` is a JSON blob under `type: "puzzle"`, the
  same argument `SaveType.Quick` made for adding an enum value.
- **A behaviour change players can see, and it is the point**: opening a puzzle
  you looked at yesterday shows you the board you were looking at, rather than a
  new one. Deliberately *not* extended to "New game", which still deals a new
  board and then remembers that one instead.
