# type-the-absent-digit — design

## D1. The withdrawn scaffold, and the reasoning error in it

`guard-the-digit-sentinel` was scaffolded and committed on 2026-09-12 proposing
the opposite of this change: keep `-1`, document why it is safe, and add a guard
for the one shape that breaks it. It was withdrawn the same day. The error is
worth recording because it is a general one.

**What the measurement found, and it stands:** the sentinel sits below the
domain, so a lower-bound test is also an absence test, and 25 of 30
`digitValue` sites are such a test.

| What the call site does with the result | sites |
| --- | --- |
| lower-bound test serving as both range and absence check | 14 |
| binds, then tests the bound on the next line | 11 |
| writes straight into a typed array | 4 |
| explicit `-1` fallback in a ternary | 1 |
| equality test | 0 |

**The error was treating that as a verdict rather than as an explanation.** The
property explains why the code is not broken today. It says nothing about which
design is better to maintain, which was the question actually asked. Dressing an
"it currently works" finding as an "and therefore keep it" conclusion is the
shape to watch for: the evidence answered a different question than the one on
the table.

Two things then flipped it:

1. **A site was found where the property does not hold locally.** Filling writes
   `digitValue`'s result into a `Uint8Array` whose absent value is `0`. A
   non-digit stores `255`. It is correct only because `validateDesc` screened
   the character in another function, which `docs/games/mechanics.md`
   § "The two scans have to agree, and nothing makes them" names as a hazard no
   test tier catches.
2. **The scale lens was not applied.** `AGENTS.md` weighs shared-layer decisions
   at dozens to hundreds of games. A property each new author must be told costs
   more at that N than a mechanical refactor costs once.

## D2. Why `number | undefined` and not a branded sentinel

The ask was for a distinct standalone sentinel with explicit optionality, as in
a functional language. TypeScript has three ways to spell that:

| Form | Verdict |
| --- | --- |
| `number \| undefined` | **Chosen.** A distinct type with one inhabitant; strict-mode narrowing refuses every use until discriminated; composes with `??`, `?.` and optional params. |
| `number \| typeof NOT_A_DIGIT` with a `unique symbol` | Same guarantee, no `??`, no precedent in the tree, and a symbol cannot enter a typed array either. Nothing gained. |
| `{ ok: true; value } \| { ok: false }` | The tree's shape for a fallible *operation* (`SolveResult`, 73 files). Overweight for an absent *value*: there is no reason to carry. |

The line the tree already draws is worth keeping: a discriminated union for an
operation that fails with a reason, a bare union for a value that may be absent.
This change puts these three codecs on the correct side of it.

## D3. What this deliberately leaves open

**`null` versus `undefined` across the engine.** 42 returns say `| null`, 26 say
`| undefined`, and `digitOf` — the key-side twin of `digitValue` — says `null`.
After this change the two twins disagree in spelling while agreeing in kind,
which is worse-looking than it is dangerous, since no call site sees both
(`share-the-desc-digit-fact` D2).

Settling it is a tree-wide convention question, not a digit question, and it
wants its own measurement: which of the 68 are "no such thing" lookups and which
are "absent value" lookups, and whether the distinction survives contact with
the population. **Do not fold it in here.** If it is worth doing, it is worth
its own change, and this one should not grow a second subject.

## D4. Per-site guidance for the implementer

- **Lower-bound sites** (the majority): bind, then test. `const d =
  digitValue(ch); if (d !== undefined && d >= 1)`. Keep the game's own bound and
  its own words; the extra clause is the check that was previously implicit.
- **Typed-array writes**: state the array's own absent constant, and check that
  it *is* the array's constant. Filling's is `0` and Palisade's is `EMPTY`;
  neither is the codec's `-1`. This is the part of the change that is not
  mechanical.
- **`validateDesc` / `newState` pairs**: where the write is safe because the
  validator screened it, say so at the write in one clause rather than trusting
  the other function silently. That is the defect class the change exists for.
- **Keen's aux read** is unchecked and safe by provenance: `aux` never crosses
  the save boundary, coming only from `newDesc` in the same process. Verified
  2026-09-12. Give it the explicit form anyway; the next reader should not have
  to re-derive the provenance.
