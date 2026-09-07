# app-shell

## ADDED Requirements

### Requirement: Every bare shortcut letter is swept against every game

The suite SHALL sweep each bare letter in the shortcut table against every
registered game and SHALL fail on a game that consumes one, unless that game is
on an explicit ledger whose entry states the reason a player would accept.

Deriving the collision from the game's own behavior — offering the key first and
acting only if the game declines — needs no declaration from any game, which is
its whole advantage. What it does not do is *notice*: a game that consumes a
letter simply makes that shortcut do nothing, silently, in that game alone.
Nothing about the table, the matchers or the labels is wrong when that happens,
so every test of them stays green. Ascent consumed `u`, `r`, `n` and `h`, leaving
undo, redo, New game and Hint unreachable from its keyboard, while the shortcut
suite passed in full.

The sweep SHALL ask on a fresh board **and** with the keyboard cursor revealed,
because several games accept letters only once the cursor is visible; asking in
one state alone misses them. The ledger SHALL be asserted exactly equal to the
set found, so a game that stops claiming a letter forces its entry to be deleted.

A ledger entry records a **collision, not a defect**: a game keeping its own
meaning for a letter is the derivation working. Tents binds `n` to "not a tent"
whenever its cursor is visible, which is exactly when a player means the cell;
Guess and Pearl bind `h` to their own hint, which is the command the bare letter
would have run anyway.

#### Scenario: A game that swallows a shortcut letter is caught

- **WHEN** a registered game consumes a bare shortcut letter on a fresh board or
  with its cursor revealed
- **THEN** the sweep fails and names the letter and the command it cost, unless
  that game is on the ledger

#### Scenario: A recorded collision keeps the game's meaning

- **WHEN** a game on the ledger consumes its letter
- **THEN** the sweep passes, and the entry states why a player is not worse off
