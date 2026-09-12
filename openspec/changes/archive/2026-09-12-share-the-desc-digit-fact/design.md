# share-the-desc-digit-fact — design

## D1. The re-measure (task 1.1): the fact is spelled four ways, and the table saw one

The proposal's table was a grep for the literals `48`/`0x30`. Read by *shape*
across every non-test game source on 2026-09-12 — a digit test, a digit run
scanned into an integer, a digit character read as a value, a digit written —
the population is roughly **110 sites in some 40 files**, because most games
spell the fact without any digit code at all:

| Shape | Spellings found | Games |
| --- | --- | --- |
| **a digit test** | `c >= "0" && c <= "9"`, inline or as a local `isDigit` (twelve files declare one) | Ascent (twice), Boats, Bricks, Bridges, Crossing, Dominosa, Flood, Group, Keen, Mathrax, Mines, Pattern, Rect, Samegame, Seismic, Signpost, Slide, Solo, Spokes, Sticks, Subsets, Tents, Towers, Tracks, Undead, Unequal |
| **a digit run read as an integer** | `n = n * 10 + (c - 48)`; `num += s[i++]` then `parseInt`; `parseInt(s.slice(i))` then skip; `start = i; while digit i++; parseInt(slice)`; and four local helpers — Bridges' and Bricks' `eatNum`, Subsets' `eatNum`, Mines' `readInt` | ~25 games, in `decodeParams` *and* in desc codecs |
| **one digit character to its value** | `c.charCodeAt(0) - 48` after a range check, `code - 0x30`, `tok.value.charCodeAt(0) - 48` | Bridges, Dominosa, Filling, Keen (aux), Map, Mathrax, Mines, Palisade, Seismic, Signpost, Slant, Spokes, Tracks; Crossing eleven times on its number strings |
| **a digit written** | `String.fromCharCode(48 + n)` | Abcd, Bridges, Keen, Slant (three times), Loopy, Tracks, Unequal, Salad (as a mode-dependent `base`) |
| **a value above nine in a run-length desc** | `0`–`9` then `A`–`Z`, written and read by hand | Loopy, Bridges, Tracks, Flood, Pearl |

Three things the table could not have shown:

- **The decimal scanner the proposal wanted to add already exists.**
  `parseLeadingInt(s, pos): { value, next }` has been exported from
  `engine/params.ts` since the params work, sixteen games import it, and the
  `ts-engine` spec requires it for `decodeParams`. Its scenario — *"no game
  file contains a duplicate `parseLeadingInt` declaration"* — is keyed on the
  name, which is why four copies called `eatNum` and `readInt` and some forty
  inline loops passed it. Seismic and Crossing already use it inside a *desc*
  codec, so the module's name (`params.ts`) understates what it is for.
- **The single-digit reads are not `c2n` with a narrower alphabet.** `c2n`
  reads `a` as 10; in a run-length desc `a` is a blank run, and in Loopy's
  desc `A` is 10 where `c2n` says 36. The digit half of `c2n` is its own fact.
- **The digit writes are not a helper at all.** `String.fromCharCode(48 + n)`
  for a value known to be `0`–`9` is `String(n)`, the C transliteration of an
  idiom TS already has. What the writers actually need shared is the *wider*
  alphabet for a value above nine.

## D2. One leaf module, `engine/decimal.ts`, that `params.ts` and `desc-alphabet.ts` stand on

The fact — *which character is a decimal digit, what it stands for, and how a
run of them reads as an integer* — has two consumer families (param strings and
desc codecs), so it lives below both rather than in either:

- `isDigit(c)` — the twelve local copies, once.
- `digitValue(c)` — `0`–`9` or `-1`. `-1` rather than `null` follows `c2n` in
  the same layer, whose `-1` the desc codecs already test against; `digitOf`'s
  `null` follows `cursorDelta` in *its* layer, and the two are not made to agree
  because no call site sees both.
- **Both take a `string`, not `string | undefined`** (owner, 2026-09-12). The
  first cut accepted `undefined` because `s[i]` past the end is `undefined` at
  runtime while typed `string` (`noUncheckedIndexedAccess` is off), and nine of
  the local copies had done the same so a scan could walk off the end unchecked.
  That is a runtime fact leaking into a signature, and it would have spread to
  every helper built on these. The caller holding the index is the one place
  that knows the length, so the bounds check lives there — `i < s.length &&
  isDigit(s[i])` — and thirteen sites across the sweep gained one. A first cut
  also made `isDigit` a `c is string` predicate, which narrows a `string` to
  `never` in the `else` of every `if (isDigit(c))`; it is a plain boolean.
- `parseLeadingInt(s, start)` — **moved** here from `params.ts`, name and
  contract unchanged (`atoi` semantics: `0` with no advance on a non-digit).
  `params.ts` keeps `parseDimensions`, `parseConfigInt`, `atof`, `formatG` and
  the config builders, and imports the scanner like everyone else. Sixteen game
  imports and the barrel repoint; the spec requirement moves with it.

The digit half of `c2n` is not rewritten in terms of `digitValue` — a
three-branch codec reads better as three branches — but the two are held equal
by test, so the fact cannot fork.

## D3. The second alphabet: `n2cUpper` / `c2nUpper` in `desc-alphabet.ts`

A run-length desc has spent `a`–`z` on blank runs, so a value above nine has
nowhere to go but the capitals: `0`–`9` then `A`–`Z`, thirty-six values. Loopy
(`CLUE2CHAR`), Bridges (`1`–`9`, `A`–`G`), Tracks (a hex nibble, and its
row/column counts in the text format), Flood (`A`–`Z` read as 10–35 so a
letter is "out of range" rather than "unknown") and Pearl (aux) each wrote it.
Five copies of a frozen order is the same argument `desc-alphabet.ts` was built
on, and the two pairs sit together because the contrast *is* the documentation:
which alphabet a desc uses is decided by whether its grammar has run letters.

Each game keeps its **bound** beside the call, as with `digitOf`: Bridges
rejects above `G`, Tracks above `F`, Slant above `4`. The alphabet says what a
character is worth; the game says which values it takes.

## D4. What stays per game, and why

- **Hex that is hex.** Mines' layout bitmap, Cube's and Flip's grids are
  nibbles written in lowercase hex and read case-insensitively. Those read as
  `Number.parseInt(c, 16)` (Cube and Flip already did) and are not the digit
  fact; Mines joins them. Tracks' nibble is *not* hex: it is written uppercase
  and its text format uses the same function for counts up to `w`, which is
  the run-length alphabet, so Tracks takes `n2cUpper`.
- **A game's own symbol alphabet.** Salad's grid is digits in Number Ball mode
  and letters in ABC mode, and border clues are letters in both. Five copies
  of the `base = mode ? 64 : 48` derivation are folded into the `symbolChar`
  its hint text already had (kept as `(mode, n)`, since three callers used
  it), whose digit half is `String(v)`; the `64` that remains is `'A' - 1`, a
  letter and not this fact.
- **Digits are strings at the codec and nowhere else** (owner's question,
  2026-09-12: *do we have to have digits as strings anywhere?*). Two edges
  need text by contract — the game ID (desc, params, a Solve aux, arriving
  from URLs and save files) and a rendered glyph — and everything between
  them is numbers. Crossing was the one place a digit string had leaked past
  the codec: `CrossingPuzzle.numbers` held the clue numbers as strings and
  eleven sites in its solver, hint solver, renderer and move code read
  `digitValue(num[k])`. It now holds `CrossingNumber = readonly number[]`,
  built once in `readDesc`; the eleven sites index a digit, `compareNumbers`
  compares digit by digit (the same order as the lexicographic compare it
  replaces, since the lengths are equal by then), and the string is rebuilt
  at exactly the three places that need one — the desc, the number panel's
  text and the hint narration.
- **Unequal's display-and-input codec** keeps its shape and loses its names:
  `n2c`/`c2n` become `displayChar`/`charValue`, because D6 reserves the shared
  vocabulary and the "not to be confused with" paragraph in two docs was the
  cost of the collision. Magnets' sentinel-aware wrapper `n2c` becomes
  `clueChar` for the same reason.
- **Signed integers** (Slide's move list, `-3`) are not a leading digit run
  and keep their sign handling around a `parseLeadingInt` call.
- **The two hand-rolled `while` scans that skip digits *and* dots** — Mines'
  percentage mine count, Map's and Rect's param tails — are not a digit run
  and stay, written with the shared `isDigit`.

## D5. Behavior is unchanged, with three stated exceptions

Every frozen differential passes unedited, `params-stability.test.ts` moves no
line, and every hint suite's wording is untouched. Where a site was changed
rather than re-expressed, it is listed here:

1. **Filling's `validateDesc`** accepted a character past `9` on a grid wider
   than nine (upstream's `c > '0' + max` bound admits `:` as ten), producing a
   clue no key can enter; it now rejects it. No generated desc is affected —
   the generator caps regions at nine.
2. **Bridges' text format** wrote an island of ten or more bridges as the
   punctuation past `9` (`:`, `;`, …). It now writes the desc letter
   (`A`–`G`), which is what the same island is called in the game ID.
3. **Abcd's text format** wrote a clue of ten or more the same way; it now
   writes the number.
4. **Tracks' text format** wrote a row or column count past `Z` (a grid at
   least 36 wide — `validateParams` caps nothing) as the punctuation after
   `Z`; it now writes the number. Below that, the desc letter, as before.
5. **A signed count in a garbage params string.** Guess, Samegame and Solo
   read a count with `Number.parseInt(s.slice(i)) || 0`, which also accepted a
   sign: `c-3` read as `-3`. `parseLeadingInt` reads `0` there, which is
   `atoi`'s answer and what every other game already did. Both values are
   rejected by each game's `validateParams`, and `params-stability.test.ts`
   moves no line.

## D6. The guard keys on the codes, anywhere (task 1.4)

The sibling change's guard (`emittable-keys.test.ts` § 3) scanned for a digit
code *against the button*, under every name the collection gives the button,
and stated its blind spot: a helper receiving the button under yet another
name. With no desc site spelling a digit code either, the scan widens to **any
operand position in any game source** — a digit code compared, subtracted,
added or labeled a `case`, a relational comparison against a one-digit string
literal (`c >= "0"`), and a local `isDigit`/`parseLeadingInt`/`n2c` shadowing
the engine's — and the blind spot closes for the digits by construction,
because the name the value travels under no longer matters. It moves to
`decimal.test.ts`, beside the fact it guards; `emittable-keys.test.ts` keeps
the two input scans and points at it.

What the widened scan cannot see, stated: a constant holding a digit code and
passed as an *argument* (Salad's `BASE_DIGIT`, removed here) — the same shape
as before, one level up. Excused lines, should a game ever need `- 48` for a
pixel, go in a ledger the scan asserts equal to what it found, never in a
narrower regex.

The shadow scan in § 2 — "no game declares a name `pointer.ts` exports" —
generalizes to the modules holding facts no game may restate: `pointer.ts`,
`decimal.ts`, `desc-alphabet.ts`, `run-length.ts`. That list is an input the
guard consumes, not a manifest about a game: a module joins it by holding a
fact, and the exports are still read from the module.

## D7. What the spec now says

The delta's digit-character requirement was written before D2's narrowing and
first stated the `string | undefined` signature; it states the shipped one.
**A spec delta is a claim about code that is still moving**, so re-read it
against the code before archiving, not only against `openspec validate`, which
checks a delta's shape and never its truth.

`ts-engine`: the leading-integer requirement is renamed and re-homed
(`decimal.ts`, descs as well as params, guarded by shape); the digit-key
requirement is modified to describe the widened guard; a new requirement
states the decimal digit fact and the two desc alphabets. The scenario that
said a second `parseLeadingInt` call on `"10x7"` returns `next: 5` said `4`
in the test that checks it, and now says `4` in both.
