# Tasks: Hint System

## Phase 1: Engine types + interface
- [x] Add `HintResult<Move>` and `ActiveHint<Move>` types to `game.ts`
- [x] Add optional `hint()` method to `Game` interface
- [x] Update `redraw` signature with optional `hint` parameter

## Phase 2: Midend integration
- [x] Add `activeHint` state to midend
- [x] Implement `hint()` public method
- [x] Clear `activeHint` on move, undo, redo, newGame, restartGame
- [x] Pass `activeHint` to `redraw` calls
- [x] Append hint explanation to status bar text
- [x] Expose `canHint` property

## Phase 3: Sixteen hint implementation
- [x] Implement `hint()` on sixteenGame (heuristic)
- [x] Update sixteen `redraw` to render hint (highlight arrow)
- [x] Add hint explanation to status bar (via midend)
- [x] Add COL_HINT colour to sixteen palette

## Phase 4: UI
- [x] Add "Hint" button to puzzle page (shown when `canHint`)
- [x] Wire button to `midend.hint()`

## Phase 5: Testing
- [x] Midend integration tests for hint lifecycle
- [x] Sixteen hint unit tests (heuristic returns valid moves)
- [x] Sixteen rendering tests (hint arrow highlighted)
- [x] Full pre-commit gate
