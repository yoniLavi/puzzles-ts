# Tasks: Hint System

## Phase 1: Engine types + interface
- [ ] Add `HintResult<Move>` and `ActiveHint<Move>` types to `game.ts`
- [ ] Add optional `hint()` method to `Game` interface
- [ ] Update `redraw` signature with optional `hint` parameter

## Phase 2: Midend integration
- [ ] Add `activeHint` state to midend
- [ ] Implement `hint()` public method
- [ ] Clear `activeHint` on move, undo, redo, newGame, restartGame
- [ ] Pass `activeHint` to `redraw` calls
- [ ] Append hint explanation to status bar text
- [ ] Expose `canHint` property

## Phase 3: Sixteen hint implementation
- [ ] Implement `hint()` on sixteenGame (heuristic)
- [ ] Update sixteen `redraw` to render hint (highlight arrow)
- [ ] Add hint explanation to status bar (via midend)
- [ ] Add COL_HINT colour to sixteen palette

## Phase 4: UI
- [ ] Add "Hint" button to puzzle page (shown when `canHint`)
- [ ] Wire button to `midend.hint()`

## Phase 5: Testing
- [ ] Midend integration tests for hint lifecycle
- [ ] Sixteen hint unit tests (heuristic returns valid moves)
- [ ] Sixteen rendering tests (hint arrow highlighted)
- [ ] Full pre-commit gate
