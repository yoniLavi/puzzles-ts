## ADDED Requirements

### Requirement: The gate rejects an assertion that cannot fail
The gate SHALL fail on a test assertion whose two sides are the same expression,
and on a bound the operand's type makes unconditional, and the check SHALL carry
a floor on the test files it scanned.

A test that cannot fail passes forever while asserting nothing, and nothing in
the suite notices, because a green test and a vacuous one are the same
observation. Measured during `tidy-the-code-after-the-port`: roughly thirteen
games carried one, found only because an agent planted a defect in each game and
watched for red.

A test whose assertions all sit inside a conditional SHALL assert how many cases
it reached, which is the vacuity rule this repository already applies to its
cross-game guards.

#### Scenario: both sides of an assertion derive from one expression

- **WHEN** a test asserts that a value equals itself, or compares two calls with
  identical arguments
- **THEN** the gate fails, naming the file and line

#### Scenario: a bound the type guarantees

- **WHEN** a test asserts that a length or a count is at least zero
- **THEN** the gate fails, unless the quantity is signed and the assertion is
  carried in the ledger with its reason

#### Scenario: a test that scans for a case finds none

- **WHEN** a test's assertions run only inside a conditional or a loop body
- **THEN** it also asserts the number of cases it examined, so a fixture that
  stops producing the case fails rather than passing silently

#### Scenario: the guard is proven before it is trusted

- **WHEN** the guard is added
- **THEN** each shape it claims to catch is demonstrated red against a
  deliberately vacuous test, which is then removed
