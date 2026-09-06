# share-the-desc-digit-alphabet

**Readiness: verified by reading both functions, not by a scan.** Filed by
`share-the-run-length-desc-scanner`, whose task 1.3 says to file this rather
than fold it in — it is a *value* codec and that change was about run lengths.

## The finding

Singles and Magnets each carry a number↔character codec for their descs, named
`n2c`/`c2n` after upstream. They are not merely similar:

- **`c2n` is behaviorally identical.** Digits `0`–`9` are 0–9, `a`–`z` are
  10–35, `A`–`Z` are 36–61, anything else is `-1`. Singles writes the bounds as
  character codes and Magnets as string comparisons; they compute the same
  function.
- **`n2c` differs by one line.** Magnets maps `-1` to `"."`; the other three
  branches are the same expression written with the constants folded
  differently (`65 + num - 10 - 26` against `65 + num - 36`).

Magnets' own section header says it: `// --- char codec (cloned from
singles.c n2c/c2n) ---`. **A clone that declares itself a clone is the easiest
case this sweep has produced**, and it is the one the run-length scan nearly
swallowed by keying on character arithmetic.

## Why it is a convention and not a decision

The bar from `AGENTS.md`: *can we say what a game would legitimately want to do
differently?* No. The alphabet is frozen into every shared game ID both games
have ever emitted, so neither can change it, and neither has a reason to want a
different one. Two games re-answering a question with exactly one legal answer
is the shape to hunt.

## Unequal is not a third member

`src/games/unequal/state.ts` exports the same two **names** and shares nothing
else: its pair takes an `order`, shifts the alphabet when `order >= 10`, maps
`0` to a space, and reads space/backspace **keypresses** for `interpretMove`. It
is a display-and-input codec that happens to inherit upstream's naming. Leaving
it out is the point of checking rather than grepping for the name — this
collection has produced four instruments that convicted a game on its name.

## The shape

`src/engine/desc-alphabet.ts`, exporting the two names the call sites already
use so no call site changes:

```ts
export function n2c(num: number): string;  // 0-9 a-z A-Z
export function c2n(c: string): number;    // the inverse, -1 for anything else
```

**Magnets' `"."` stays in Magnets.** `"."` means *no clue* there and means
nothing in Singles; a shared codec that knows one game's sentinel has imported
that game's meaning, which is the line `run-length.ts` draws in its own doc
comment ("what does not live here is any game's meaning"). Magnets keeps a
two-line `n2c` that handles `-1` and delegates the rest.

## What must not move

Both games' descs are frozen. Singles and Magnets each carry a frozen
differential, and both must stay byte-clean — that is the whole acceptance test,
as it was for the eight games of the run-length batch.

## Impact

- Affected specs: none (see `.openspec.yaml`).
- Affected code: a new `src/engine/desc-alphabet.ts`, plus `singles/state.ts`
  and `magnets/state.ts`.
- **No player-visible change of any kind.**
