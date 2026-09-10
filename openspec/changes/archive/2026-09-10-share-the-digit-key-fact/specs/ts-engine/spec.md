## ADDED Requirements

### Requirement: The engine answers which key is a digit, once

The engine SHALL provide `digitOf(button: number): number | null` in
`src/engine/pointer.ts`: the digit `0`–`9` a button stands for, or `null` for
any other button. It SHALL look through the keyboard modifier bits, so a
numpad digit with Num Lock on (`MOD_NUM_KEYPAD | '7'`) reads as that digit —
the keypad is a convenience route to the same key, never a different one.

A game SHALL NOT spell the digit range itself — not as a comparison or
subtraction against the button (`48`, `0x39`, `button - 48`), not as a numeric
`case` in a `switch` on the button, and not as a local constant holding a digit
code that is then compared against the button. A guard SHALL find every such
site by its **codes**, under every name the collection gives the button — the
names derived from the `interpretMove` signatures rather than listed — and
SHALL prove itself on planted copies of each shape before scanning.

What a game does with the digit SHALL remain the game's: the bound it accepts
and the meaning it gives `0` (a clear, the value zero, ten, sixteen, one more
typed digit, a command) are answers about the puzzle, written beside the call.
A game that gives the **numpad's** digits another meaning (a direction pad)
SHALL resolve those before asking, as `MOD_NUM_KEYPAD | <digit>` bindings
already do.

#### Scenario: A numpad digit enters the same value as the bare key

- **WHEN** a game reads `digitOf(MOD_NUM_KEYPAD | '5')`
- **THEN** it receives `5`, exactly as for the bare `'5'`

#### Scenario: A hand-parsed digit fails the build

- **WHEN** a game source compares or offsets the button against a digit code,
  labels a `case` with one under a `switch` on the button, or declares a
  constant holding one and compares the button against it
- **THEN** the guard reports the file and line, whatever the game named the
  button

#### Scenario: The bound and the meaning of zero stay with the game

- **WHEN** two games read the same digit key
- **THEN** each applies its own bound and its own reading of `0` — Guess the
  tenth color, Bridges sixteen, Seismic a clear — with no such policy in the
  helper
