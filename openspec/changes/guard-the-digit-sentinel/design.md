# guard-the-digit-sentinel — design

## D1. Why `number | undefined` was declined, with the measurement

This change began as a proposal to convert `digitValue` and `c2n`/`c2nUpper`
from a `-1` sentinel to `number | undefined`, on the sound general principle
that TypeScript's narrowing enforces the second and nothing enforces the first.
**Reading all 42 call sites reversed it.** Recording the measurement here
because the general principle is right, and a future reader who applies it
without the measurement will propose this again.

### What the call sites actually do

| What the site does with the result | `digitValue` sites |
| --- | --- |
| a lower-bound test (`>= 0`, `>= 1`), used as both the range check and the absence check | 14 |
| binds it, then tests the bound on the next line | 11 |
| writes it straight into a typed array | 4 |
| an explicit `-1` fallback in a ternary | 1 |
| an equality test | **0** |

The first two rows are the case against the conversion. `if (digitValue(ch) >= 1)`
is already correct and already reads as the game's own sentence; under
`undefined` it becomes a type error whose only fix is to bind the value and
test `undefined` separately, which is **more** ceremony at 25 of 30 sites to
buy a check those sites already perform.

### The property that makes them correct

**The sentinel is below the domain.** These codecs return `>= 0` for every
character they accept, and a game's bound is always "at least zero" or "at
least one". `-1` is below both, so one comparison does two jobs. That is not
luck; it is why upstream chose `-1` and why `c2n` kept it.

It is also exactly what an `undefined` conversion would *discard*: the
conversion forces a second test at every site precisely because `undefined` is
not ordered with respect to the domain.

### Where the property stops

**An equality test does not inherit it.** `digitValue(c) !== 0` reads a letter
as "not zero", and a typed array swallows the write. Zero sites do this today.
That is the whole residual risk, it is one shape, and a shape is guardable —
which is what this change ships instead of the conversion.

### The other half: typed-array storage

`digitValue`'s consumers are frequently a typed array whose own absent encoding
is `-1` (`Int8Array(wh).fill(-1)` and friends, 133 sites across `src/games/`).
A typed array cannot hold `undefined`, so the conversion would add `?? -1` at
those sites: a second spelling of the same sentinel, immediately beside the
first. That is the "two ways plus a seam" shape the repo refuses.

### What would change this verdict

If a game ever needs an **equality** test on a raw codec result, or if the
domain ever includes a negative value, the below-domain property fails and the
conversion becomes the right answer. The guard in task 2 is what would surface
the first case; it fails the build rather than letting the property lapse
quietly.

## D2. Why a guard rather than a paragraph

`AGENTS.md` § "Method": *a trap that has bitten deserves a mechanical check, not
a paragraph.* This one has not bitten yet, which is the argument for guarding it
now rather than after it has — the population is currently clean, so the guard
can be adopted at zero cost and proved on a planted site instead of on a
backlog.

Key on the **shape**, never on the name: a comparison operator `===`, `!==`,
`==` or `!=` with a call to any of the three codecs on either side. Accept the
superset and classify, rather than narrowing to "inside an `if`".

The scan belongs beside the fact it guards, in `src/engine/decimal.test.ts`,
which already carries the collection-wide digit scan and its vacuity count.

## D3. Open question for the implementer

Whether `desc-alphabet.ts`'s two codecs should state the invariant in their own
header or link to `decimal.ts`'s. They are a different module with a different
alphabet but the identical sentinel contract. Prefer one statement and a link;
`AGENTS.md` § "Comments" is against a paraphrase that can drift, and the
engine-catalog entry already links the two modules.
