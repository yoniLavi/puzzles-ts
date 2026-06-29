# ts-engine Specification (delta)

## ADDED Requirements

### Requirement: A shared win-flash helper

The engine SHALL provide a shared `winFlash(from, to, flashTime)` helper returning
`flashTime` exactly when a move transitions the board from unsolved to solved without a
cheat (`!from.completed && to.completed && !from.cheated && !to.cheated`) and `0`
otherwise, reading the common `completed` / `cheated` state fields structurally. A game
whose `flashLength` is this canonical shape SHALL delegate to it; a game with bespoke flash
timing keeps its own. Delegation SHALL be behaviour-preserving.

#### Scenario: A fresh solve flashes; other transitions do not

- **WHEN** a move solves a previously-unsolved board with no cheat used
- **THEN** `winFlash` returns the flash duration; for an already-solved board, a non-solving
  move, or a cheated solve it returns `0`, matching the per-game `flashLength` it replaced
