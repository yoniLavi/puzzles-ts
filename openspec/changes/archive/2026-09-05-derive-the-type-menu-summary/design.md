# derive-the-type-menu-summary — design

## The decision task 0 asked for: how the tier list reaches the formatter

**It already crosses the boundary. Use that.**

The exploration went looking for a way to send the tier names from the worker to
the main thread, and found one already in flight: `getCustomParamsConfig()`
returns a `ConfigDescription` whose every `choices` item carries
`choicenames: string[]` — built by the midend from the game's `paramConfig`, and
the *same array* `difficultyTiers(game)` reads. The "Custom type…" dialog
already asks for it, which is why that dialog has always shown the right words
while the header beside it did not.

```
  worker                                     main thread
  ──────                                     ───────────
  getCustomParamsConfig()  ──choicenames──▶  the Custom dialog     ✅ right words
  decodeCustomParams()     ──values (idx)─▶  describeConfig        ❌ spelled list
                                                    ▲
                                             25 hand-typed copies
```

So no new message, no new field on `ConfigValues`, and nothing about the codec
changes. `getParamsDescription` asks for the config it could always have asked
for, and hands the names to the formatter.

### Rejected: send the resolved name instead of the index

`ConfigValues` is bidirectional — the same shape that renders the header is the
one `encodeCustomParams` reads back to *set* params, and `Game.describeParams`'
contract says choice values are numeric indices *"never their string
renderings"* because the formatter coerces with `Number(value)`. Putting a name
in the value would fix the reader by breaking the writer.

## Which tokens get derived, and which stay spelled

Not every spelled list is a second copy of something. `configFormatter` has two
kinds of option list and only one of them has another source:

| Token | Example | Second source? |
| --- | --- | --- |
| a tier list | `{difficulty:Easy\|Tricky}` | **yes** — the game's `paramConfig` |
| presentation shaping | `{strip-clues:\|, strip clues}`, `{grid-type: (no diagonals)\|\| Hexagon}` | no |

The second kind encodes punctuation, leading spaces and empty strings — it is
prose about how the summary reads, not a name the game declares anywhere. It
stays.

**The mechanism that distinguishes them is the absence of a list.** A bare
`{difficulty}` means *render this choices field by its declared name*, resolved
from `choicenames`; a token that spells its options keeps spelling them. That
also fixes bare choice tokens, which currently fall through to `String(value)`
and would print the raw index — which is why Ascent reached for a
`customFormats` object instead, and why those objects carry tier lists too.

## The guard, and why the existing one could not catch this

`augmentation.test.ts` already sweeps every game and asserts no `{field}` token
survives unsubstituted. It passed throughout, because **substituting the wrong
word is still substituting** — the check measured a neighbor of the property it
was supposed to protect, which is AGENTS.md § "Method"'s most-repeated defect.

The new assertion compares the rendered difficulty word against
`difficultyTiers(game)` at the index the params actually carry, for every tiered
game and every one of its tiers. It fails on a wrong word, a wrong order, and a
wrong *count* — Bricks renders three words for two tiers today, so the count is
not hypothetical.

## Why this was not folded into `declare-params-and-presets`

Same file family, different concern, and this one is player-visible: 19 games'
headers change text, which is the owner's to accept. Bundling it would also have
buried a 25-copy deletion inside a 19-game codec conversion, where the bulk-edit
rule ("assert every changed line is the one intended kind") could not have been
applied to either half cleanly.
