# share-the-digit-key-fact

**Implemented 2026-09-10** — see `design.md` for what the re-measure below
found (five games missing, one named in error) and `tasks.md` for the result.
Carried out of the framework vision's input survey when
`retire-the-framework-vision` deleted it: the one surveyed item that never
shipped and had no other home. The table below is the proposal's original grep,
kept as the record of what a name-keyed scan missed.

## Why

*Which button codes are digit keys, and which digit?* is one frontend fact. Keyed
on shape — a range check against `48`/`57` or `0x30`/`0x39`, a `KEY_<n>` constant,
or a game's own character codec applied to a button — rather than on a helper
name, it is answered by hand in these games:

| How the digit is used | Games |
| --- | --- |
| a number the player enters | Abcd, Ascent (accumulated into a multi-digit number), Bridges (`0` means sixteen), Crossing, Guess (`0` means ten), Keen, Mathrax, Salad, Seismic (`0` clears), Solo, Towers |
| a number, through the game's own symbol codec | Group (`fromChar`), Unequal (`c2n(button, order)`) |
| a command bound to a digit key | Bricks, Undead |

The first row alone spells the range two ways (`48..57` and `0x30..0x39`) and
disagrees over whether it starts at `0` or `1`. It is the class
`docs/games/engine-catalog.md` § "Reach for these, don't re-roll" names as a
fact: a change to which codes mean a digit would have to happen in every copy at
once.

## What changes

A `pointer.ts` helper answers the fact once. Each game keeps its **bound**
(`<= w`, `< n`, `<= ncolors`) and its meaning for `0` (clear, ten, sixteen),
because those are real per-game answers. Rows 2 and 3 are candidates rather than
commitments: a symbol codec answers more than digits, and a command key is a
keymap, so each is classified in task 1.1 before anything moves.

## Measured beside it, and not the same fact

- **The numeric keypad as a direction pad** (`MOD_NUM_KEYPAD | 0x3n`): Ascent,
  Cube, Twiddle.
- **Desc characters** (`c.charCodeAt(0) - 48` on a desc token): Bridges, Cube,
  Filling, Flip, Lightup, Map, Mathrax, Mosaic, Palisade, Seismic, Signpost, Slant,
  Tracks. `engine/desc-alphabet.ts`'s `c2n` already reads a digit character, but
  it also accepts letters, which some of these descs give another meaning — so
  adopting it is a per-site reading, not a sweep. Task 1.5 decides whether it
  belongs in this change or its own.

## Constraints

- Behavior unchanged: every input test passes unedited, and each game's own bound
  still refuses the digits it refused.
- Re-measure by shape before adopting (`AGENTS.md` § "A scan that keys on a
  name"): the table above was taken by grep, not by reading every `interpretMove`.
