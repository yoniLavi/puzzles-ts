## RENAMED Requirements

- FROM: `### Requirement: The engine provides a shared leading-integer param parser`
- TO: `### Requirement: The engine provides a shared leading-integer parser`

## MODIFIED Requirements

### Requirement: The engine provides a shared leading-integer parser

The engine SHALL provide `parseLeadingInt(s: string, start: number): { value: number; next: number }` in `src/engine/decimal.ts`, returning the integer formed by the maximal digit run starting at `start` (0 when the run is empty) and the index of the first non-digit character — unchanged from `start` when there was no digit, which is how a caller tells "no number here" from "zero". A game that reads a digit run from a param string **or a game description** SHALL call this instead of scanning the run itself, in any spelling: an accumulator (`n = n * 10 + …`), a collected substring passed to `Number.parseInt`, a `parseInt` of the tail followed by a skip, or a locally named helper. A loop that skips digits *and* another character (a `.` in a percentage) is not a digit run and MAY stay a loop written with the shared `isDigit`.

#### Scenario: A game decodes a WxH param string

- **WHEN** a game's `decodeParams` parses `"10x7"` using `parseLeadingInt`
- **THEN** the first call returns `{ value: 10, next: 2 }` and a second call starting after the `"x"` returns `{ value: 7, next: 4 }`
- **AND** no game file declares a copy under any name — the guard finds a copy by its shape (a relational comparison against a one-digit string), not by the name `parseLeadingInt`

#### Scenario: A desc codec reads a number the same way

- **WHEN** a game's desc carries a decimal number (a clue, a run length, a coordinate)
- **THEN** the codec reads it with `parseLeadingInt` and the desc bytes are unchanged from the hand-rolled scan it replaced

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
site by its **codes**, in any operand position in any game source — the
button, a desc character, a helper's parameter under any name — and SHALL
prove itself on planted copies of each shape before scanning. The guard's one
stated blind spot is a constant holding a digit code that is passed as an
argument rather than used as an operand.

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

- **WHEN** a game source compares or offsets any value against a digit code,
  labels a `case` with one, or compares a character against a one-digit string
  with a relational operator
- **THEN** the guard reports the game and line, whatever the game named the
  value and wherever in its sources the line sits

#### Scenario: The bound and the meaning of zero stay with the game

- **WHEN** two games read the same digit key
- **THEN** each applies its own bound and its own reading of `0` — Guess the
  tenth color, Bridges sixteen, Seismic a clear — with no such policy in the
  helper

## ADDED Requirements

### Requirement: The engine answers which character is a digit, once

The engine SHALL provide, in `src/engine/decimal.ts`, `isDigit(c: string): boolean` and `digitValue(c: string): number` — the value `0`–`9` a decimal digit character stands for, or `-1` for any other character. Both SHALL take a **character**, never `string | undefined`: indexing past the end of a string yields `undefined` while typed `string`, and a signature that absorbs that spreads a runtime fact through every helper built on it. The caller holding the index SHALL carry the bounds check (`i < s.length && isDigit(s[i])`), as `parseLeadingInt` does. A game SHALL read a digit character through these and SHALL write a single digit as `String(n)`; it SHALL NOT declare its own `isDigit`, compare a character against a one-digit string with a relational operator, subtract a digit code from a character code, or add one to build a character. The three spellings of the fact — `digitValue` on a character, `c2n` on a desc character, `digitOf` on a key — SHALL agree on every digit, and a test SHALL hold them equal.

What the value *means* SHALL stay with the game: the bound it accepts and what an out-of-range value does (an error message, a sentinel, a rejected desc) are written beside the call. A hex nibble read case-insensitively (a bitmap of mines or lit cells) is not a decimal digit and is read with `Number.parseInt(c, 16)`.

#### Scenario: A run-length game reads a bounded clue

- **WHEN** Slant's `validateDesc` meets a value token
- **THEN** it reads `digitValue(tok.value)` and applies its own bound of `4`, rejecting `5` with its own message and a letter with its own message

#### Scenario: A private copy fails the build

- **WHEN** a game source declares an `isDigit`, `digitValue`, `parseLeadingInt`, `n2c`, `c2n`, `n2cUpper`, `c2nUpper`, `scanRunLength` or `encodeRunLength` of its own
- **THEN** `emittable-keys.test.ts` reports it, the reserved names being read from the fact modules' own export lists

### Requirement: The engine provides the two desc value alphabets

The engine SHALL provide, in `src/engine/desc-alphabet.ts`, two frozen value alphabets: `n2c`/`c2n` over `0`–`9`, `a`–`z`, `A`–`Z` (62 values, for a desc in which every character is a value) and `n2cUpper`/`c2nUpper` over `0`–`9`, `A`–`Z` (36 values, for a run-length desc, which has spent the lowercase letters on blank runs). Each writer SHALL throw on a value it cannot write rather than walk into punctuation; each reader SHALL return `-1` for a character outside its alphabet, a lowercase letter included for the run-length alphabet. Neither order SHALL change, because both are baked into shipped game IDs. A game whose desc writes a value above nine SHALL use the alphabet its grammar implies and SHALL keep its own bound beside the call.

#### Scenario: A run-length desc writes and reads a value above nine

- **WHEN** Loopy encodes a clue of 12 and Bridges an island of 16
- **THEN** the desc carries `C` and `G` respectively, `c2nUpper` reads them back, and Bridges' own `validateDesc` still rejects `H`

#### Scenario: The two alphabets agree where they overlap and nowhere else

- **WHEN** a digit `0`–`9` is written through either alphabet
- **THEN** both write the same character
- **AND** `c2nUpper("a")` is `-1` while `c2n("a")` is `10`
