# ts-engine Specification Delta — walk-tactic-hint-chains

## MODIFIED Requirements

### Requirement: A hint step always names a technique — no un-narrated fallback

A displayed hint step SHALL always explain *why* its move is forced by a named
technique; a game's hint SHALL NOT emit a generic, unexplained "fallback" step
(e.g. "only one arrangement fits") for a deduction its technique set does not
cover. A game SHALL satisfy this by one of two strategies: **narrating every
deduction** its generator accepts (promoting any catch-all into an honest, if
non-local or tedious, technique — as Filling narrates its global
candidate-elimination), or **rejecting at generation** the boards whose solution
needs a deduction it cannot narrate (see the `ts-migration` narratable-deduction
generation policy). This is the Hint-System companion to that generation policy.

A deduction reaching its conclusion through a hypothesis is classified by whether
its reasoning is a **bounded run of individually glanceable steps** — the
Check / Tactic / Search taxonomy of `audit-guessing-tier-names`. This requirement
fixes what a **Tactic** owes the player.

**A Tactic SHALL be walked.** Its hint SHALL emit a multi-leg journey — legs
after the first flagged `continuesPrevious`, so the whole chain reads and
auto-plays as one hint — in which:

- each leg is **one inferential step**, understandable without holding the rest
  of the chain in mind;
- the board **carries the accumulated state**: every cell the hypothesis forces
  is marked as its leg is reached, so the player reads the chain rather than
  reconstructing it;
- the marks a Tactic's legs leave are **visibly hypothetical**, distinct from the
  player's own entries and from a real deduction's marks, and are cleared with
  the hint;
- the final leg names the contradiction **specifically** (which rule, at which
  cell), never "it breaks" or "a contradiction further along";
- where the conclusion rests on a **case split** — as a two-candidate forcing
  chain does, concluding from both the hypothesis and its negation — the
  narration states both branches. A final leg that does not follow from its own
  stated premises is a defect regardless of the conclusion being correct.

A Tactic SHALL NOT be compressed into a single step asserting its conclusion,
even when that step is accurate: a claim the player can check only by redoing the
deduction is the failure this requirement exists to prevent.

#### Scenario: A logic game's hint never shows an unexplained step

- **WHEN** a hint plan is computed for any board of a deductive game
- **THEN** every step names the technique that forces it (its explanation is not a
  generic "only one arrangement fits" placeholder)

#### Scenario: A Tactic is delivered as a walk

- **WHEN** a hint's next deduction is a bounded chain of forced consequences
- **THEN** it is emitted as a multi-leg journey whose continuation legs are
  flagged `continuesPrevious`, each leg narrating one inferential step

#### Scenario: The board carries the chain, not the player

- **WHEN** a leg of a Tactic walk is displayed
- **THEN** the cells the hypothesis has forced so far are marked on the board, in
  a form distinct from the player's own entries, and those marks are cleared when
  the hint is dismissed

#### Scenario: The last leg names what broke, and covers every branch

- **WHEN** a Tactic walk reaches its contradiction
- **THEN** the narration names the specific rule and cell that break, and — where
  the conclusion needs both sides of a case split — states both, so the
  conclusion follows from the premises the walk actually laid out
