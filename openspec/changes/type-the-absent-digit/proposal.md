# type-the-absent-digit

**Readiness: scaffolded, not started.** Supersedes a scaffold committed and
withdrawn the same day (`guard-the-digit-sentinel`, 2026-09-12), which proposed
documenting and guarding the `-1` sentinel instead of removing it. `design.md`
D1 records why that was the wrong call, because the reasoning is the useful part.

## Why

`decimal.ts`'s `digitValue` and `desc-alphabet.ts`'s `c2n`/`c2nUpper` report
"not one of mine" as `-1`: a value **inside the return type**, which the
compiler will never make anyone check. They should report it as a value
**outside** the return type, `number | undefined`, which it will.

The first cut of this analysis defended the sentinel on the grounds that it sits
*below the domain*, so any natural lower-bound test doubles as an absence test,
and 25 of 30 call sites are exactly such a test. That is true, and it is why
nothing is broken today. It is not a reason to keep it:

- **The property is a coincidence of ordering, not a contract.** It holds for
  `>= 0` and `>= 1`; it does not hold for `!== 0`, and nothing says so. Zero
  sites write that today, which is why the day one does, nothing will notice.
- **It is already load-bearing across a function boundary** in the one place
  the guides warn about. Filling's `newState` writes `clues[i++] =
  digitValue(tok.value)` into a **`Uint8Array` whose absent value is `0`**. A
  non-digit there stores **255**, not `-1` and not empty. It is safe only
  because `validateDesc` rejected that character in a *different function* —
  exactly the two-scans-must-agree hazard `docs/games/mechanics.md` says no
  test tier catches, and that Bricks actually shipped.
- **It costs every future game author a fact.** At this project's stated scale,
  dozens to hundreds of games, a convention that needs explaining loses to one
  the compiler enforces. `AGENTS.md` § "Convention over configuration": the
  porter should make no decision that is not about the puzzle, and "does this
  bound also catch a non-digit" is not about the puzzle.

**On the original question.** The owner asked for a distinct standalone sentinel
type with the optionality explicit in the signature, as one would reach for in a
functional language, `object()` in Python or a symbol in Ruby. In TypeScript
that is spelled `number | undefined`: `undefined` is a distinct type with one
inhabitant, the union states the optionality, and strict-mode narrowing refuses
every use until it is discriminated. A `unique symbol` sentinel would give the
same guarantee with worse ergonomics, no `??`, and no precedent in the tree. So
the ask has a direct idiomatic expression here and needs no library.

## What changes

- `digitValue`, `c2n` and `c2nUpper` return `number | undefined`.
- Every call site is re-read, not swept. The compiler enumerates all 42, which
  is what makes this mechanical and verifiable rather than a sweep.
  - A lower-bound test binds the value and tests `undefined` explicitly.
  - A typed-array write states the array's **own** absent constant
    (`?? EMPTY`, `?? -1`), which is a gain: Palisade and Filling name theirs,
    and Filling's is not `-1`.
- `docs/games/mechanics.md` § "Digits and numbers in a desc are one fact, and it
  is not yours" gains the rule.

## What this does not do

- **It does not touch a storage sentinel.** `Int8Array(...).fill(-1)` for "no
  clue" is 133 sites in `src/games/`. A typed array cannot hold `undefined`;
  that is a storage encoding and stays.
- **It does not settle `null` versus `undefined` tree-wide.** The engine returns
  `| null` at 42 sites and `| undefined` at 26, and `digitOf` returns `null`.
  That is a real inconsistency and a much larger question; this change picks
  `undefined` for these three codecs because they are value lookups rather than
  "no such thing" lookups, and flags the general question rather than answering
  it (`design.md` D3).

## Constraints

- **No behavior change.** Every frozen differential passes unedited, no
  narration moves, no snapshot is re-baselined. A fixture that moves means a
  bound changed, which is a finding.
- **Read each site; do not sweep.** The point of the change is that four sites
  currently depend on a validator in another function. Those are the ones to
  look at hardest, and Filling's is the exemplar.
