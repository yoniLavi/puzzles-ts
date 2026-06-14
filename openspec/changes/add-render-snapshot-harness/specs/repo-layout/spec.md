## ADDED Requirements

### Requirement: Rendering is verifiable in-process, agent-checkable

The project SHALL provide an in-process way to capture a game's `redraw` output
as a **deterministic draw record**, driven through the real `Midend`, so
per-frame visual correctness can be asserted and snapshot-tested without a
browser and **without a human in the loop**. This complements the ad-hoc
recording-`GameDrawing` doubles by sharing one complete, normalised recorder and
adding a scenario driver that reaches a specific production frame.

The harness SHALL include a recording `GameDrawing` that captures every draw
call with all arguments (colours resolved through the game's palette to stable
labels), and a scenario driver that — given a game, params, a description, an
optional move list, and flags to show the active hint or mistakes — drives a
real `Midend` to the target frame (replaying moves as `Move`s, not pointer
events) and returns the captured record. Output SHALL be deterministic (fixed
tile size, rounded coordinates, stable ordering, no `Date`/`Math.random`).
Verification SHALL use `toMatchSnapshot` on the record plus targeted assertions
on specific ops; the harness SHALL be dev/test-only with no runtime or bundle
impact. New rendering behaviour SHOULD ship such a test, reserving Playwright
for genuine full-integration and real-canvas smoke checks.

#### Scenario: A hint frame is asserted without a browser or a human

- **WHEN** the scenario driver replays a game's prefix moves, requests a hint,
  and captures the resulting frame
- **THEN** targeted assertions confirm the hint's highlight ops in the expected
  colours (e.g. the action edge `COL_HINT`, a sibling edge `COL_HINT_SIBLING`,
  referenced cells `COL_HINT_CELL`)
- **AND** no browser, worker, OffscreenCanvas, or human eyeball is involved

#### Scenario: A render regression is a reviewable snapshot diff

- **WHEN** the captured record is compared against its `toMatchSnapshot`
  baseline after a rendering change
- **THEN** an unintended visual change surfaces as a text diff an agent reviews,
  and an intended one is re-baselined with `vitest -u`
