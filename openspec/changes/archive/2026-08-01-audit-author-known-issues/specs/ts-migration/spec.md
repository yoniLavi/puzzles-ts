# ts-migration Specification Delta — audit-author-known-issues

## ADDED Requirements

### Requirement: Author-stated known issues are reconciled before the C is retired

Each ported game's **author-written known-issue list** SHALL be reconciled
against the behaviour the port shipped, and the outcome recorded, before the
`puzzles/` reference tree is removed. The lists are the `## Status` section of
`puzzles/unreleased/docs/<game>.md` for the third-party games, the `TODO` /
`FIXME` block at the head of each game's C source, and upstream's own notes for
the games this project finished rather than ported.

Every stated point SHALL be classified as **fixed** (citing the shipped
behaviour or a test, not a design note), **deliberately declined** (citing the
reason), **pending an owner decision**, or **outstanding** (with a follow-up
change filed). A point an author identified as a defect SHALL NOT be reproduced
without a recorded reason.

Where a verdict is a behavioural divergence from the author's intent, it SHALL
be recorded in that game's capability specification, so that the reasoning
survives the deletion of the reference tree.

#### Scenario: A ported game's author notes are reconciled

- **WHEN** the known-issue list for a ported game is reviewed
- **THEN** every point in it carries one of the four verdicts, and each "fixed"
  verdict names the behaviour or test that demonstrates it

#### Scenario: A silently reproduced defect is caught

- **WHEN** an author-identified defect was reproduced by a port with no recorded
  reason
- **THEN** it is reported as outstanding and a follow-up change is filed

#### Scenario: The reference tree is not removed before the sweep

- **WHEN** removal of the `puzzles/` reference tree is proposed
- **THEN** the reconciliation is complete, since the author's notes live inside
  that tree and are otherwise lost
