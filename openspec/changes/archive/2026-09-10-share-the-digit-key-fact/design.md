# share-the-digit-key-fact — design

## D1. The re-measure (task 1.1), and what the proposal's grep missed

Read by shape across every non-test game source on 2026-09-10: a digit
char-code literal (`48`–`57`, `0x30`–`0x39`) compared with or subtracted from
the button, a numeric `case` in a `switch` on the button, and a local
`const KEY_n = <code>` compared against it — then every `interpretMove` that
matched was read, not just counted.

| How the digit is used | Games |
| --- | --- |
| a number the player enters | Abcd, Ascent, Bridges, Crossing, **Dominosa**, **Filling**, Guess, Keen, Mathrax, Salad, Seismic, Solo, Towers |
| a number, through the game's own codec | Unequal (`c2n(button, order)`) |
| a command bound to a digit key | Bricks, **Clusters**, **Sticks**, Undead, **Unruly** |
| a compass | Inertia (`DIGIT_DIRECTIONS`, keyed by the character) |

Five games in bold were absent from the proposal's table, and one it named was
never a member: **Group's `fromChar` reads letters only** (`isChar` admits
`A`–`Z` and `a`–`z`; the digits never reach it), so the proposal's row 2 had
one real member, not two. Twenty games in all.

The proposal's grep also filtered on file names (`index.ts`, `input.ts`,
`ui.ts`) and excluded anything mentioning "hint", "solver" or "generator" —
which is how a scan keyed on names silently drops Dominosa and Filling, whose
sites sit in files the filter did not expect. The re-measure keyed on the
literal and read the superset.

## D2. `digitOf(button): number | null`, looking through the modifier bits

The fact is *which key is a digit, and which digit*; a numpad `7` with Num Lock
on arrives as `MOD_NUM_KEYPAD | '7'` and **is** a press of 7, so the helper
strips the modifiers itself rather than requiring the caller to. Two things
decided it that way rather than "the caller strips first":

- **The frontend's numpad route becomes a free consequence.** Guess never
  called `stripModifiers` at all, so a numpad digit was dead there; Ascent
  refused numpad `5` and `0` while typing. Both now work, for nothing. The
  guide's rule — "a keypad binding must never be the only route, bind the bare
  digits too" — is satisfied by construction in every adopter, which is why the
  `MOD_NUM_KEYPAD`-pairing guard accepts `digitOf` as a bare-key route.
- **The games that give the numpad another meaning already resolve it first.**
  Ascent, Bricks, Cube and Twiddle use `MOD_NUM_KEYPAD | '7'` etc. as a
  direction pad, and each consumes those before any digit is read (Bricks and
  Ascent return from the movement branch; Cube and Twiddle read no digit). So
  the helper's stripping cannot reach a numpad key that means a direction.

`null` rather than `-1` follows `cursorDelta`; the game's own `-1` conventions
(Unequal's `c2n`, Solo's `n`) are kept where they were.

## D3. What stayed in the games, deliberately

Every adopter keeps its **bound** and its **meaning of `0`**, written beside
the call, because those are answers about the puzzle and two games legitimately
give different ones:

| Meaning of `0` | Games |
| --- | --- |
| clear, like the erase keys | Abcd, Crossing, Mathrax, Salad, Seismic, Undead |
| the value 0 (which is a clear) | Dominosa, Filling, Keen, Solo, Towers |
| ten | Guess (only when there are ten colors) |
| sixteen | Bridges |
| one more typed digit | Ascent |
| a command (`unshade`, `ZERO`, red, horizontal) | Bricks, Unruly, Clusters, Sticks |
| unbound | Inertia (the compass has no center) |

Unequal's codec kept its shape — `c2n(c, order)` is applied to aux characters
as well as buttons — and only its digit range moved: above order 9 the digits
shift up by one, and that line now says so.

## D4. The guard keys on the codes, not on a name (task 1.4)

`emittable-keys.test.ts` § 3 scans for the literal shapes that shipped —
`button >= 48`, `btn - 0x30`, `key === 49`, `button <= 0x30 + n`, a numeric
`case` under `switch (button)`, and `const KEY_ZERO = 48` compared against the
button — under every name the collection gives the button. The names are
**derived** from the fifth parameter of each `function interpretMove(` plus the
spellings the sibling scans have always used, so a game that names it something
new is covered the day it registers.

The scanner is proved on planted snippets of all five shapes, and asserted
quiet on the three that legitimately remain (`MOD_NUM_KEYPAD | 0x37`, a
`digitOf` call, a letter range). It was also planted live once — Salad's
`if (button === 48)` restored for one run — and went red naming the file and
line.

**The blind spot, stated:** a local helper that receives the button under a
name no `interpretMove` uses. Unequal's `c2n(c, order)` sat in exactly that
spot. Following the button into every function it is passed to is parsing, not
scanning; the guard refuses the shape where all twenty copies actually were.

Two sibling assertions were re-founded rather than loosened. The `switchCases`
vacuity floor (`>= 3` numeric labels) was the last three digit labels in the
tree — Unruly's — so the floor would now fail *because the collection is
clean*; it is a planted-switch probe of the scanner instead, which is the
honest form. And the `MOD_NUM_KEYPAD` pairing test's "bare-key route" regex
matched `button === 4[89]` — the very literals this change removes — so it now
accepts `digitOf` and a named cursor key.

## D5. Inertia's comment was false, and is fixed here

`DIGIT_DIRECTIONS` carried "this web frontend never sets `MOD_NUM_KEYPAD`",
the sentence `docs/games/input.md` § "The numeric keypad never arrives" had
already retracted (the bit is set from `event.location === 3`). Adopting
`digitOf` there — keyed by digit rather than by character — replaced the
comment with the true reason the bare digits are accepted.

## D6. The desc-side half is its own change (task 1.5)

`c.charCodeAt(0) - 48` on a desc token is a different fact — *which character
writes which small number in a game ID* — with different consumers (the
frozen differentials, not the input tests) and its own shapes: a multi-digit
decimal accumulator (`n = n * 10 + (s.charCodeAt(i) - 48)`, Mines seven times),
a single digit after a range check, `String.fromCharCode(48 + n)` writing one,
and two hex-like alphabets. Measured 2026-09-10 at roughly sixty sites in
twenty-five files; scaffolded as `share-the-desc-digit-fact` with the
measurement, rather than folded in here where it would double the change and
put input tests and desc differentials in one diff.
