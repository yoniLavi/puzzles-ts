# build-pipeline — delta

## ADDED Requirements

### Requirement: Type-aware analysis is run deliberately, and its dead-branch findings are triaged as bugs

The repository SHALL periodically run type-aware lint analysis that the
per-commit linter cannot perform — specifically the detection of conditions the
type system proves can never hold — because Biome's inference is not type-aware
and `tsc` does not treat an always-false condition as an error. Neither gate
step can see this class of defect.

A reported condition that can never hold SHALL be triaged before it is removed.
It is exactly one of:

- a guard rendered redundant by a type that was tightened after it was written,
  which is deleted; or
- **a check that was intended to fire and cannot**, which is a defect and SHALL
  be fixed and reported as a behaviour change, not silently deleted as tidying.

Deleting the second kind as though it were the first destroys the evidence of a
bug while appearing to improve the code. The triage verdict for each finding
SHALL be recorded, because a diff can show that a branch was removed but not
that it was *checked*.

Where such a fix changes a game's generated boards or rendering, it SHALL be
stated as a deliberate behaviour change and its differential re-founded or
retired explicitly, per the released-oracle doctrine — never re-recorded to match
the new output without saying so.

#### Scenario: A never-firing check turns out to be load-bearing

- **WHEN** type-aware analysis reports a solver condition whose types have no
  overlap
- **AND** triage finds the condition was written to reject an invalid board
- **THEN** the condition is corrected so that it fires as intended, with a test
  covering the case
- **AND** the resulting change in generated boards is reported, not absorbed

#### Scenario: A redundant guard is deleted with its verdict recorded

- **WHEN** triage finds a reported condition is genuinely unreachable because a
  type was tightened after the guard was written
- **THEN** the guard is deleted
- **AND** the finding is recorded as verdict "redundant", so the absence of a bug
  is distinguishable from the absence of a check

### Requirement: Compiler strictness is adopted where index provenance is unknown, not where it is structural

Additional TypeScript strictness flags SHALL be adopted on the evidence of what
they cost and what they buy, measured against the tree, rather than from a
generic strictness checklist.

`noUncheckedIndexedAccess` SHALL NOT be enabled tree-wide. It applies to typed
arrays as well as plain arrays and records, and this codebase uses typed arrays
as its deliberate house pattern for game state and render cache keys. In a solver
whose indices are derived from the loop bounds immediately above them, the flag
reports an impossibility whose only available fix is a non-null assertion at
every access — adding no runtime safety while obscuring the arithmetic. The
measured cost is 9,028 errors, concentrated in solver code.

Where the guarantee is genuinely earned — decoding a save, parsing a game ID or
a user-supplied description, or any other boundary where index provenance is
*not* structurally known — it SHALL be obtained with a checked accessor at that
boundary rather than by a tree-wide compiler flag.

#### Scenario: A strictness flag is proposed from a checklist

- **WHEN** a change proposes enabling a compiler strictness flag
- **THEN** its error count against the current tree is measured first
- **AND** the flag is adopted only if the errors represent distinctions the code
  genuinely blurs, rather than assertions restating what the surrounding control
  flow already guarantees

#### Scenario: Untrusted input needs the guarantee the flag would have given

- **WHEN** code parses a user-supplied game ID, description, or saved game
- **THEN** it validates indices at that boundary with a checked accessor
- **AND** does not rely on the absence of `noUncheckedIndexedAccess` as licence
  to index unvalidated input directly
