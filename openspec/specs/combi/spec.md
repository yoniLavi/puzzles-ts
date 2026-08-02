# combi Specification

## Purpose
TBD - created by archiving change port-combi-to-typescript. Update Purpose after archive.
## Requirements
### Requirement: Upstream combi-test.c is ported to Vitest

The repository SHALL contain a TypeScript translation of `puzzles/auxiliary/combi-test.c` that drives the TS impl over a handful of `(r, n)` cases and asserts the iteration matches an expected hand-spelled output. The C test's output format (`"combi R of N, T elements."` followed by one space-separated line per tuple) SHALL be reproduced so the test reads as a direct translation.

This is the layer that keeps a *reader-checkable* enumeration in the file. The closed-form properties say the count and the ordering are right for every `(r, n)`; a hand-spelled `(3, 5)` says what the answer actually looks like, which is what a first-time reader needs.

#### Scenario: Ported test covers a hand-spelled (3, 5) case

- **WHEN** the ported test runs `(r, n) = (3, 5)`
- **THEN** the produced output matches the hand-spelled expected output for that case
- **AND** Vitest reports the test passing under `npm run test:run`

### Requirement: TypeScript combi module enumerates subsets in lexicographic order

The implementation in `src/engine/combi/index.ts` SHALL enumerate, for a given `(r, n)`, every `r`-element subset of `{0, 1, …, n-1}` exactly once, in lexicographic order.

The implementation SHALL expose, at minimum, the public surface used by the sole consumer (Light Up's solver): construction from `(r, n)`, advance-to-next, and read access to the current `r`-tuple. The C surface (`new_combi`, `reset_combi`, `next_combi`, `free_combi`) MAY be exposed under idiomatic TS names.

The TS implementation SHALL preserve the C contract that advancing past exhaustion returns the falsy sentinel (NULL in C; `null` or `false` in TS, whichever the API documents) and SHALL NOT throw.

The TS implementation SHALL enforce the C preconditions `r <= n` and `n >= 1` by throwing on construction.

The requirement is stated as the mathematics rather than as agreement with a recording — it was "reproduces C output byte-for-byte", asserted by replaying a frozen corpus. See the removal below.

The module lives under `src/engine/` because it is an engine library. It was a top-level `src/native/combi/` only because the retired bottom-up migration gave every ported seam its own folder next to the engine — a whole top-level directory, with its own openspec capability, for an 81-line class with one call site.

#### Scenario: A hand-spelled enumeration matches

- **WHEN** the iterator is walked for a small case a reader can check by eye (`(3, 5)`, `(2, 5)`)
- **THEN** the sequence of `r`-tuples equals the enumeration spelled out in the test
- **AND** the call that follows the final tuple returns the documented falsy sentinel

#### Scenario: reset rewinds the iterator

- **WHEN** a `Combi(r, n)` is enumerated to exhaustion, then reset, then enumerated again
- **THEN** the second enumeration produces the same sequence of `r`-tuples as the first
- **AND** this is asserted by a test driving `reset()` directly, not as a side effect of replaying a recording

#### Scenario: degenerate r == 0 yields a single empty tuple

- **WHEN** the TS impl is constructed with `r = 0` and any `n >= 1`
- **THEN** the iterator produces exactly one `r`-tuple of length zero, then exhausts

#### Scenario: degenerate r == n yields a single full tuple

- **WHEN** the TS impl is constructed with `r == n`
- **THEN** the iterator produces exactly one `r`-tuple equal to `[0, 1, …, n-1]`, then exhausts

#### Scenario: precondition violations throw

- **WHEN** the TS impl is constructed with `r > n` or `n < 1`
- **THEN** construction throws

### Requirement: Enumeration correctness is asserted in closed form, not by replay

`Combi`'s guarantee SHALL be asserted by properties that state the mathematics
directly: that it emits exactly `C(n, r)` tuples, in lexicographic order, each a
distinct `r`-element subset of `{0, …, n-1}`, plus the hand-spelled enumerations
and degenerate cases its test file already carries. The properties SHALL be
exhaustive over a small grid of `(r, n)` rather than sampled, since that grid is
tiny and enumerating it is free.

**This is the one frozen C corpus a closed-form property states better**, and the
distinction matters because it does not generalise. A per-game differential and
`random`'s corpus assert facts that *cannot* be derived — which boards a
solver-gated generator produces, what bit sequence a seed yields — so the
recorded fixture is the only statement of them, and they are kept. `combi`
enumerates the subsets of a set. There is no upstream quirk in it: the recorded
enumeration is what the definition requires, so replaying it demonstrated only
that C and TypeScript both implement combinations. `AGENTS.md` uses this exact
function as its example of a property test worth having — *"combi emits exactly
C(n,r) lex-ordered tuples"* — and the corpus is what stood in for it.

The replaced ceremony is not the 4 KB of JSON: it is a `__fixtures__` directory,
a capability in the spec index, and a "frozen oracle, never re-baseline" rule
attached to a fact that a first-year combinatorics identity settles.

Retiring a fixture SHALL be scoped by the question *"is **every** fact this
fixture asserted derivable?"*, not *"is the fixture's subject derivable?"*. Here
the properties dominated the recorded enumerations — but the corpus block was
also the only place `reset()` was ever driven, an assurance that would otherwise
have been lost in silence, on a scenario this same capability requires.

#### Scenario: The count and the order are asserted directly

- **WHEN** the module is enumerated for a range of `(r, n)`
- **THEN** the number of tuples equals `C(n, r)`
- **AND** each tuple is strictly increasing, and each is lexicographically after
  its predecessor
- **AND** no two tuples are equal

#### Scenario: A derived fact is not preserved by replay

- **WHEN** deciding whether a frozen C fixture may be retired
- **THEN** it is retired only where the property it records follows from a
  definition the test can state directly
- **AND** fixtures recording facts that cannot be derived — a generator's boards,
  an RNG's bit sequence — are kept, whatever the state of upstream compatibility

#### Scenario: Retiring a fixture accounts for everything it covered

- **WHEN** a frozen fixture is retired in favour of properties
- **THEN** every behaviour that only the fixture's replay exercised is given a
  direct test in the same change
- **AND** the replacement is named in the change, so the assurance is not dropped
  silently

