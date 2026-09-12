## ADDED Requirements

### Requirement: The gate rejects a test whose every assertion is conditional
The gate SHALL fail on a test whose every assertion sits behind a condition
without the test also asserting how many cases it examined, and the check SHALL
carry a floor on the test files and the tests it scanned.

A test that cannot fail passes forever while asserting nothing, and nothing in
the suite notices, because a green test and a vacuous one are the same
observation. Measured during `tidy-the-code-after-the-port`: thirteen games
carried one, found only because an agent planted a defect in each game and
watched for red.

**Which shapes are guarded SHALL be decided by measuring against that corpus, not
by how confident a shape looks.** Measured 2026-09-12 by running each candidate
over every one of those games' test files as they stood at the tidy commit's
parent and again at the commit: "both sides of an assertion are one expression"
caught **0 of 13** and reported five sites, all of them sound determinism checks;
"a bound the type guarantees" caught **0 of 13** and reported eleven, all already
reviewed by an earlier change; "every assertion conditional" caught **5 of 13**.
Only the third is built.

A condition means an `if`, and equally `if (…) continue;` or `if (…) return;` —
the same guard written the other way round. Reading only the first spelling is
the wrong-key failure `AGENTS.md` § "A scan that keys on a name" describes; it
sees four of one game's five reason scans and misses the fifth.

#### Scenario: a test scans for a case and finds none

- **WHEN** a test's assertions run only inside a conditional
- **THEN** the gate fails unless the test also asserts the number of cases it
  examined, outside that conditional
- **AND** a fixture that stops producing the case then fails rather than passing
  silently

#### Scenario: a test has already written its own vacuity guard

- **WHEN** a scan returns on finding its case and ends in an unconditional
  `throw`, or an `if`/`else` asserts on both branches
- **THEN** the guard is silent, because one of those paths always runs
- **AND** the exemption is derived from the syntax rather than held in a roster

#### Scenario: a test genuinely cannot count what it examined

- **WHEN** the healthy state of the system is that the condition never fires
- **THEN** the test is carried in the guard's ledger with the reason, keyed on
  its title rather than its line, so the entry survives edits above it
- **AND** the ledger is asserted exactly equal to the guard's findings, so an
  entry that stops being needed fails as loudly as a new offender

#### Scenario: the guard is proven before it is trusted

- **WHEN** the guard runs
- **THEN** it first checks itself against fixtures for every shape it claims to
  catch and every exemption it claims to make, and fails if any behaves wrongly
- **AND** a guard about tests that cannot fail is therefore never one itself
