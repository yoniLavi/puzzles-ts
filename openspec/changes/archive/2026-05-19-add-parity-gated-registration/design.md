## Context

`add-flip-ts-port` registered Flip and deleted `flip.c` while the TS
midend never repainted after input (clicks invisible) and had no
animation/flash. The automated suite was fully green because it
asserted state transitions, not rendering. The defect was deferred as
"cosmetic / out of scope" without owner approval — exactly the framing
`AGENTS.md` forbids. Two follow-up commits fixed it
(`5c5eba4` repaint+animation, plus the flicker fix). This change makes
the rule that would have prevented it explicit and writes the missing
engine requirement.

## Goals / Non-Goals

- **Goals:** an enforceable parity-gated registration rule; a written
  engine requirement that the midend repaints on every transition and
  drives animation; an honest corrected record in `AGENTS.md`.
- **Non-Goals:** further engine code changes (the fix already shipped);
  reverting Flip (owner chose fix-forward and is acceptance-testing);
  defining an exhaustive automated "parity" oracle — parity is owner
  acceptance plus behavioural + differential tests, deliberately not a
  byte corpus (consistent with the existing doctrine).

## Decisions

- **The registry is the gate.** No new mechanism: a game is simply not
  passed to `registerGame(...)` (and its `puzzles/<game>.c` not
  deleted, its `TS_PORTED` marker not set) until the owner has
  acceptance-tested it at parity. Unregistered ⇒ C/WASM automatically.
  The cost of the rule is therefore ~zero; it is purely discipline.
- **Parity = behavioural + differential tests green AND owner
  acceptance.** "All tests green" is necessary, not sufficient — the
  Flip failure proves the suite can be green while the game is
  unplayable. Rendering/animation/input are part of parity.
- **Repaint/animation is a spec requirement, not an implementation
  detail.** Writing it into `ts-engine` means a future port that
  regresses it fails a requirement, not just "looks wrong".
- **Correct the record rather than quietly amend.** `AGENTS.md` keeps
  the Flip entry but states plainly it shipped broken and needed two
  fixes; the migration-order item notes parity is owner-gated. Hiding
  the miss would repeat the original error.

## Risks / Trade-offs

- "Owner acceptance" is a human gate ⇒ slower per game. Accepted: the
  alternative (trusting a green suite) already failed once.
  Mitigation: keep widening behavioural coverage (this session added
  input-mapping, `executeMove`-purity and redraw-ops tests) so the
  suite catches more before it reaches the owner.

## Open Questions

- Whether to add an automated smoke that drives a real game through a
  recording `GameDrawing` and asserts non-trivial draw output per
  transition (a cheap guard against "renders nothing"). Leaning yes as
  a future cross-game test; out of scope here. Flip already has a
  redraw-ops test as the pattern.
