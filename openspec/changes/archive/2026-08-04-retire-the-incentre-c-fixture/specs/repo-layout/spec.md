## ADDED Requirements

### Requirement: A C-recorded fixture is kept for what cannot be derived, not as a quality bar

The frozen C captures under `__fixtures__/` SHALL be retained where they record a
fact that has **no independent derivation** — which board a solver-gated
generator produces for a seed, the RNG stream, a tiling's incidence in emission
order — because there the recording *is* the specification and no closed form can
replace it. This covers the per-game desc differentials, the grid incidence
differentials and `random/__fixtures__/corpus.json`, all of which remain the
regression net for refactoring after `retire-c-engine`.

A C capture used instead as a **relative quality bar** — asserting that this
implementation's answer is as good as the other implementation's, for a quantity
that *is* independently computable — SHALL be replaced by the independent
computation rather than kept. Such a bar is green whenever both implementations
are wrong in the same way, which is precisely the failure a peer comparison
cannot see, and it is not tightenable: the tolerance exists to absorb the peer's
error, not this implementation's.

Deciding between the two SHALL ask the question of **every fact the fixture
asserts**, not only its headline one — a fixture's case list, face counts and
setup scaffolding are assertions too, and a replacement that drops them silently
narrows the guarantee while appearing to widen it.

#### Scenario: A generator differential is kept

- **WHEN** a fixture records the description a solver-gated generator produced for
  a given seed
- **THEN** it is retained, because no independent computation yields that board
- **AND** a change that deliberately diverges retires or re-founds it, rather than
  re-recording it against a C build that no longer exists

#### Scenario: A peer-comparison bar is replaced by the real yardstick

- **WHEN** a test asserts only that this implementation's answer is within a
  tolerance of the C implementation's, for a quantity with a definition that can
  be computed directly
- **THEN** the fixture is deleted and the quantity is computed independently in the
  test, from a derivation sharing no code with the implementation under test
- **AND** the replacement covers at least the cases the fixture covered, enumerated
  from the source of truth rather than from the fixture's own list

#### Scenario: Retiring a fixture accounts for its incidental assertions

- **WHEN** a fixture is deleted
- **THEN** every check that rode along with it — case enumeration, element counts,
  skip reporting — is either re-founded on the code or explicitly recorded as
  dropped with its reason
