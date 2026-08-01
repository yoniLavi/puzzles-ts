# build-pipeline — delta

## ADDED Requirements

### Requirement: A static-analysis finding is triaged against the type information behind it

Type-aware analysis that reports a condition as impossible SHALL have each such
finding triaged before any code is removed. A reported condition is exactly one
of three things, and **the third is the common case in this repository**:

1. a guard rendered redundant by a type that was tightened after it was written
   — delete it;
2. **a check that was intended to fire and cannot** — a defect; fix it and report
   the behaviour change; or
3. **a correct runtime guard that the type system misrepresents** — keep it, and
   record why so the next audit does not re-raise it.

The third category is not an edge case here. All 53 findings measured on
2026-08-01 were in it, by two structural mechanisms that will not go away:

- **Narrowing is not invalidated by a mutating call.** A solver that checks
  `state.impossible`, calls a technique that sets it, and checks again is
  reported as having a dead second check. Deleting it stops the solver detecting
  contradictions, and generation is gated on that verdict. This follows from the
  deliberate house style of a mutable solver state.
- **Index access is typed as total when `noUncheckedIndexedAccess` is off.**
  `const c = desc[pos]; if (c === undefined) …` is reported as having no
  overlap, while at runtime the read genuinely can be `undefined`. These sites
  are overwhelmingly **description parsers**, i.e. the code validating a game ID
  a player pasted from an untrusted source.

Consequently, an analysis whose soundness depends on a compiler flag the project
has declined SHALL NOT be adopted as a blocking gate. Declining to tighten types
does not merely weaken such an analysis — it makes it wrong in a specific and
confident direction, and a mechanical fix pass would delete exactly the
validation the declined flag existed to enforce.

#### Scenario: A bounds check in a description parser is reported as dead

- **WHEN** type-aware analysis reports `if (c === undefined)` after an indexed
  read as having no overlap
- **THEN** the guard is kept, because the read can return `undefined` at runtime
  regardless of its declared type
- **AND** the finding is recorded as an analysis artefact rather than re-triaged
  on every subsequent audit

#### Scenario: A solver's second contradiction check is reported as always falsy

- **WHEN** a solver checks a mutable flag, calls a technique that can set it, and
  checks it again
- **THEN** the second check is kept
- **BECAUSE** the narrowing that makes it look dead does not survive the call at
  runtime, and removing it would let an impossible board be reported as solved

#### Scenario: A never-firing check turns out to be load-bearing

- **WHEN** triage finds a reported condition was genuinely written to reject an
  invalid state and cannot do so
- **THEN** the condition is corrected so that it fires as intended, with a test
- **AND** any resulting change in generated boards is reported, not absorbed

### Requirement: Compiler strictness is adopted on measured evidence, not from a checklist

Additional TypeScript strictness flags SHALL be adopted on the evidence of what
they cost and what they buy **measured against this tree**, and the reasoning for
a declined flag SHALL be recorded in `tsconfig.json` beside the ones that are on,
so the next reader gets the number rather than re-deriving it.

`noUncheckedIndexedAccess` SHALL NOT be enabled tree-wide. It applies to typed
arrays as well as plain arrays and records, and this codebase uses typed arrays
as its deliberate house pattern for game state and render cache keys. In a solver
whose indices come from the loop bounds immediately above them, the flag reports
an impossibility whose only available fix is a non-null assertion at every
access — no runtime safety, and arithmetic that is harder to read. Measured cost:
9,028 errors, concentrated in solver code.

Where the guarantee is genuinely earned — decoding a save, parsing a game ID or a
user-supplied description — it SHALL be obtained with an explicit check at that
boundary. Such checks already exist throughout the description parsers and SHALL
NOT be removed on the strength of an analysis that cannot see them (see the
requirement above).

#### Scenario: A strictness flag is proposed from a checklist

- **WHEN** a change proposes enabling a compiler strictness flag
- **THEN** its error count against the current tree is measured first
- **AND** the flag is adopted only if the errors represent distinctions the code
  genuinely blurs, rather than assertions restating what the surrounding control
  flow already guarantees, or widenings that restore the semantics already in
  force

#### Scenario: A declined flag is proposed again later

- **WHEN** a contributor considers enabling a flag that was previously declined
- **THEN** `tsconfig.json` states the measured cost and the reason
- **AND** the decision is revisited only on new evidence, such as a format that
  begins to distinguish a missing key from an explicit null
