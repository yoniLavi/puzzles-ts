## ADDED Requirements

### Requirement: A hot constant's placement is decided by the build, not by the suite
A constant that a hot loop reads MAY be hoisted into a shared module, and a
slowdown observed under vitest SHALL NOT by itself forbid the hoist. Where such a
constant is kept module-local for speed, the comment saying so SHALL record the
measured ratio, its control, and that the cost does not reach a player.

Measured 2026-09-12 on Range's generator, three arms in one process, rotated and
interleaved, 21 reps, four runs: an imported table costs **1.62–1.73×** against
an A/A control of **0.98–1.01**. The mechanism is not in doubt — vite's
module-runner transform rewrites `DR[i]` to `__vite_ssr_import_0__.DR[i]` and
defines every export as a getter, so the loop pays an accessor call per access.

**It does not survive bundling.** `vite build` flattens the two modules into one
scope and the read compiles to a direct `var` access, byte-identical to the
module-local form. The cost is a fact about the suite; a refactor that removes
six copies of a table makes the tests slower and the game exactly as fast.

#### Scenario: a shared table is proposed for a hot loop

- **WHEN** a constant read inside a solver or generator loop is proposed for a
  shared module
- **THEN** the decision is made on what the production build emits, and the
  suite's slowdown is weighed only as suite cost
- **AND** if the constant stays local, the comment says so with its measurement
  rather than asserting a bare multiplier

#### Scenario: an arm is timed against another

- **WHEN** two implementations are compared by timing
- **THEN** every arm is exercised once before the clock starts, the arms are
  interleaved with rotating order, and the minimum is reported beside the median
- **AND** an A/A control arm is timed alongside them, so a ratio that is really
  an artifact of module load order or of warm-up has somewhere to show up

#### Scenario: a control looks suspiciously tight

- **WHEN** a paired-timing control is suspected of flattering itself
- **THEN** the suspicion is checked by warming the arms rather than by loading
  a second module instance
- **AND** measured here, one instance timed twice (0.98–1.02) and two separately
  loaded instances (0.98–1.01) are indistinguishable once every arm is warmed
