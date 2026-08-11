# Design

> **Re-founded 2026-08-08.** The original scaffold's D2/D4/D6 leaned on
> `add-galaxies-association-marks` (withdrawn — see
> `fix-galaxies-drag-preview`'s proposal for the rationale). The hint's
> action vocabulary is now the committed association itself.

## Context

The Galaxies solver already grades four deduction rules plus bounded
recursion (Unreasonable). The committed association is the game's
cell↔dot notation: consequence-free (it never enters `checkComplete`,
never colours a tile), undoable, freely reversible, mistake-checked on
demand — i.e. already pencil-grade in every way that matters to a hint.
This change wires the standing hint machinery (plans, `hintKeepTrack`,
`refreshHintStep`, refusal, auto-hint pacing) to a recorded run of the
solver. The relevant guides: `docs/games/hints.md` throughout;
`docs/games/solver-and-generator.md` § "Guess-free generation" (the
hint-side no-fallback bar).

## Goals / Non-Goals

- Goals: a full explained hint meeting the quality bar; honest handling
  of the Unreasonable rung; enrolment in every cross-game guard.
- Non-Goals: solver strengthening (the tiers are upstream's and
  honest); any new notation (withdrawn — rule-outs are narrated as
  evidence, never demanded of the player's hand); any shared-machinery
  extraction (record what would generalise for the framework substrate
  instead); changing generation (no differential impact — the gated
  fixture check must stay green untouched).

## Decisions

- **D1 — The solver is the engine; the hint is its recording.** Thread a
  recorder through the existing deduction rules rather than writing a
  parallel hint solver (the one-engine-two-projections doctrine; Solo's
  threaded-recorder shape, `docs/games/hints.md § "Thread the recorder
  (Solo)"`). The generator/solve path runs recorder-off and must be
  byte-unchanged — the frozen differential is the guard. The recording
  path takes a step budget (`docs/games/hints.md § "The step budget"`).
- **D2 — One firing, one journey, in committed moves.** A firing that
  establishes "T must belong to D" becomes one journey whose action is
  the association move — the tile, with its 180° partner as a
  `continuesPrevious` leg (the game commits them atomically, and the
  hint narrates the symmetry as the *reason* they travel together);
  edges the firing forces outright follow as further legs. The
  implementing session calibrates journey granularity against cognitive
  load (`docs/games/hints.md § "Cognitive load: one step per hint"`) by
  reading real plans aloud (`docs/games/hints.md § "Read one plan out
  loud"`).
- **D3 — Narration names what the player can see.** Dots have no
  labels, so steps refer to dots by what is visible/countable ("the dot
  two tiles left", "the white dot in the corner") — never internal
  coordinates (`docs/games/hints.md § "Name elements by what the player
  can see"`). Evidence (the blocked symmetric partner, the
  only-reachable region) is shown as an area in the legend colours.
  Each of the four rules gets its own narration in its own vocabulary;
  wording is asserted byte-exactly in tests. Rule-outs ("no other dot's
  symmetry can reach this tile") are evidence highlights the hint
  draws, not marks the player makes — the Dominosa pattern
  (`docs/games/hints.md § "Rule-outs as board marks"`) inverted onto
  the renderer.
- **D4 — `hintKeepTrack`/`refreshHintStep` respect working ahead.** A
  player who commits the association the plan was leading to has
  completed that step; a stored step whose tile got associated
  meanwhile refreshes to `null` and the plan advances
  (`docs/games/hints.md § "Stale plans and refreshHintStep"`). The
  resume guard covers mid-game positions automatically once enrolled.
- **D5 — The Unreasonable rung is narrated honestly or not at all.**
  When no non-recursive rule fires, the hint does not fabricate a local
  reason. Options, in preference order per the existing patterns: a
  static what-if walk of the recursion's decisive branch
  (`docs/games/hints.md § "Show the what-if walk statically"`), or the
  honest non-local tier ("no single-step deduction exists here; the
  proof tries an association and finds the contradiction" with the
  tried cell highlighted — `docs/games/hints.md § "The honest chain
  tier"`). The implementing session picks after inspecting what the
  recursion actually records; refusing to hint is not an option, and
  inventing a reason is forbidden (no un-narrated fallback).
- **D6 — Refusal couples to `findMistakes`.** A hint request on a board
  with any mistake — wrong tile or wall — refuses, banners, and lights
  the mistakes (`docs/games/hints.md § "Refusal couples to the mistake
  overlay"`).

## Risks / Trade-offs

- Recorder threading perturbing the solve path → recorder-off path
  byte-identical by construction (no-op callback), frozen differential
  green as the proof.
- Dot-naming ambiguity on dense boards → D3's visible-property naming,
  with the evidence highlight carrying the identification when words
  get long.
- Unreasonable narration cost unknown until the recursion is
  inspected → D5 bounds the choices; tier-2.5 scans find real
  Unreasonable firings deterministically (fixed-seed scan idiom,
  `docs/games/testing.md § "Render scenarios"`).
- The hint display vs the drag preview → `uiUpdateClearsHint` reviewed
  against the discrete drag preview (`fix-galaxies-drag-preview`); a
  drag in progress must not fight the hint overlay.

## Migration Plan

No format or generation changes; enrolment additions only.

## What implementation decided (2026-08-11)

- **F1 — D2's `continuesPrevious` legs are not merely unnecessary, they
  are forbidden.** The game commits a tile and its 180° partner
  *atomically* (`addAssocWithOpposite`), so a second leg for the partner
  is a **no-op move**, which `hint-resume.test.ts` rejects outright. One
  firing is therefore one step with both cells as targets, and the
  narration carries the symmetry as the reason they travel together.
  Galaxies emits no `continuesPrevious` legs at all.
- **F2 — the plan must teach *two* vocabularies, because the win
  condition is written in the other one.** `checkComplete` reads walls
  only; associations never enter it. A plan of associations alone would
  be sound and would never solve the board. So the wall rung ("these two
  cells are settled on different dots") is in the plan and is 62% of its
  steps. Recorded as a cross-game lesson in `docs/games/hints.md`
  § "Notation and goal are different move sets (Galaxies)".
- **F3 — rung order was chosen by measurement, and it is a split of one
  upstream function.** `solver_lines_opposite` does two jobs; in solver
  order the *mirror-the-wall* half won every race and became **58%** of a
  7x7 plan — the longest sentence and the hardest technique, as the
  routine way walls appear. Split into two rungs (a `LineRules`
  parameter defaulted to "both", so the generator's path is byte
  identical) with the mirror demoted last, it fires **7%** and only where
  it unsticks the board. Frequencies over 24 boards (7x7 + 10x10, both
  tiers, 2315 steps): separate 61.7%, onlyReach 18.8%, dotTile 10.3%,
  mirrorWall 7.0%, elimination 1.0%, enclosed 3.5%, exclave 0.6%. No
  board gave up; longest narration 243 chars.
- **F4 — D5 resolved: refutation, not a what-if walk.** Upstream's
  recursion decides *the whole board* from one branch, which is a verdict
  about the board and not a sentence about a cell. The hint instead
  refutes each candidate dot for one cell with the ordinary (non
  recursive) chain and concludes from the survivor — sound, one cell at a
  time, and it names the contradiction it reached (a fresh
  `GalaxiesContradiction` recorded at each rule's `IMPOSSIBLE`). Cheap
  enough to run at a stall: 1–2 firings per Unreasonable board, ~100 ms
  for a whole board's worth of hints. A static what-if walk was not
  attempted: Galaxies' contradictions come from a full fixpoint, not a
  depth-1 chain, so there is no short walk to show.
- **F5 — the hint colour had to move, and the reason generalises.**
  `HINT_ACTION` and `DRAG_ADD` are both `BLUE`, and Galaxies spends blue
  on the drag preview (owner-accepted in
  `widen-galaxies-association-gestures`). They collide on the *same
  object at the same instant*: both ring a dot, and a cell→dot drag is
  precisely how a player follows an association hint. The hint took
  purple; verified in the browser with a drag in flight under a displayed
  hint, in both schemes.
- **F6 — `uiUpdateClearsHint` is deliberately not implemented.** The hook
  exists for games whose hint *suppresses* another surface; Galaxies'
  suppresses nothing, and a drag in progress is the player following the
  hint, not leaving it.
- **F7 — two defects only the browser found.** A firing built from the
  rules' progress codes listed *half* the cells its own move claimed
  (`solverAddAssoc` claims the partner, which then reports "nothing to
  do"), so the hint said "this cell" while filling two; and a ring drawn
  on a dot standing inside a filled cell is its own colour on its own
  colour. Both are now assertions.

## Acceptance round 1 (2026-08-11)

- **F8 — the partner cell may not be painted like the subject.** Both
  cells of the pair filled solid made every "this cell" ambiguous. They
  are *not* equivalent moves in the quality bar's sense — one is deduced,
  the other follows by a symmetry the player already knows — so the
  deduced cell keeps the solid action colour and the partner takes a bare
  outline of the same hue (`GalaxiesHint.focus`). Removing the partner's
  mark entirely was considered and rejected: the move decides that cell,
  and a step must not change a square it never marked.
- **F9 — `onlyReach`'s narration reworded.** It ended on "that one",
  which named nothing. It now opens on the shaded reach and ends on "the
  ringed dot"; `exclave`'s "that galaxy too" got the same treatment.
- **F10 — an arrow pointing at an adjacent dot drew into it.** Not a
  hint bug (it predates this change, on every committed arrow) but found
  during its acceptance. `drawArrow` reached a flat `tileSize / 3`
  regardless of how far the dot actually was; a dot on a cell's *edge* is
  only half a tile away, so the point landed inside the circle, while the
  diagonal case (a dot on a corner, `√2/2` tiles away) had ~`1/8` tile of
  clearance and looked right. The point is now capped at the dot's edge
  less that same `1/8`, which leaves the diagonals within half a pixel of
  where they were — the constant is *derived from* the case that was
  already correct rather than chosen.

## Acceptance round 2 (2026-08-11)

Both reports are about *relative* prominence, which is the thing neither a
unit test nor a snapshot can see.

- **F11 — demoting a mark must not also strip its background.** F8's
  outlined partner sat on bare board, because the evidence area filtered
  out *both* cells of the pair; an outline on plain grey competes with a
  solid fill rather than deferring to it. It was also a false picture:
  the partner is inside the reach the sentence describes. Only the
  acted-on cell is filtered from its own area now, so the partner is
  shaded like the rest of the evidence with the outline on top — and the
  `onlyReach` sentence, which had said the shading was "everywhere" the
  galaxy could stretch, now says it "shows how far", which stays true
  with one cell painted over.
- **F12 — the dot's mark is a filled halo, not concentric rings.**
  `drawCircle` strokes one pixel wide, so the ring trick borrowed from
  the drag preview was a hairline next to a solid cell fill. The halo is
  drawn filled and the dot repainted over it, which keeps the dot's own
  black/white — filling the dot itself was the owner's suggestion and
  would have cost the narration its noun, since it says "the ringed
  *white* dot".

## Acceptance round 3 (2026-08-11)

- **F13 — the plan cap counted the wrong thing, and it read as a stall.**
  Owner-reported on a 15x15 Unreasonable board that announced "No further
  move can be deduced" with most of the board undone. Reproduced on that
  exact desc: at move 25 the plan was **20 firings, 0 showable** — every
  one a dot's-own-cell for a dot sitting *inside* its cell, which the
  game refuses to let the player draw and which therefore re-derives on
  every recompute. The cap now counts showable steps, with a generous
  firing backstop. Pinned by a test on the reported desc that also
  asserts the board really does produce unshowable firings, so it cannot
  quietly stop exercising the class.
- **F14 — a new hint-only rung: "only one dot could own this cell".** The
  owner asked why the reach hint's picture shows the winning galaxy's
  extent when the sentence is about *other* galaxies not reaching, and
  suggested showing what a drag from the cell shows — the rings on the
  dots it could join. Measured before building: at a reach firing a drag
  would ring **1 dot in 37% of cases, 2–5 in the rest**, so drawing that
  picture unconditionally would have contradicted the sentence 63% of the
  time. The honest form is a *separate rung* for exactly the 1-ring case
  — sound (every condition the drag's predicate tests is necessary for
  ownership), hint-only, and argued in the affordance the player already
  has. After it, every remaining reach firing has ≥2 rings, so both
  sentences are true wherever they are said. It fires on 6.8% of steps;
  the mix is now separate 56.8%, onlyReach 13.9%, mirrorWall 11.5%,
  dotTile 9.2%, soleOwner 6.8%, exclave/elimination/enclosed ≈0.7% each.
- **F15 — the mirror rung's demotion, revisited.** The owner named it as
  their favourite technique and asked whether hiding it costs anything.
  It costs no deductive power: every rule runs to a fixpoint regardless,
  so the ladder decides only which explanation is offered first. At its
  current place it is 11.5% of steps (it was 58% when it ran first, which
  is what buried everything else). Left as is, but the ladder now lives
  in one visible list in `hint.ts` so the order is a one-line change.
- **Cost note.** Worst hint call on a 15x15 Unreasonable is ~350 ms, and
  it is almost entirely the `findMistakes` re-solve the refusal check
  needs, not the plan: dropping the cap from 20 showable steps to 8 moved
  it by 36 ms. It runs in the puzzle worker, so the UI does not block.

## The contradiction rung, removed (2026-08-11, owner)

F4/F14's Unreasonable rung is **gone**, and with it `refuteAssoc`,
`candidateDots` and the contradiction-site recording threaded through the
rules. The owner's call, and the right one: *hints are for learnable
deductions*. The rung hypothesised a cell's dot, propagated the whole
fixpoint, and reported the alternative that did not break — sound and
narrated, but "I tried them all and this one survived" is a search
result, not a technique anyone can carry to the next board.

Where deduction genuinely runs out, the hint now **refuses and says what
the position is**: *"Nothing further follows by deduction here. This
board's difficulty allows positions that need trial and error: save a
checkpoint, try one, and undo if it breaks."* That is the Unreasonable
tier working as defined, and the player has the save slot and Solve.

What this cost, honestly: an Unreasonable board is no longer walkable to
solved by hints alone (all 26 in the earlier sweep were). What it bought:
every step the hint utters is now a rule the board shows, on both tiers,
with no per-tier exception to reason about — asserted directly rather
than argued.

## The tier name, settled (2026-08-11)

The hint solving Unreasonable boards raised the question of whether the
tier should become "Hard". It should not, and the reasoning is worth
keeping because it corrects something in the policy doc.

**The rung guesses.** `refuteAssoc` runs the *whole deduction fixpoint*
from its hypothesis, settling dozens of cells before the contradiction
appears. The owner's rule — *guessing rather than checking is
Unreasonable*, with the exception of a contradiction visible from the
placement itself without thinking a step ahead — puts that squarely on
the guessing side, as does `hints.md`'s own Sticks test (does the
rejected trial **propagate** before the oracle is asked?). "Unreasonable"
stays.

**The policy doc said otherwise and has been fixed.**
`solver-and-generator.md` called single-level forcing "deduction" in one
breath and "an immediate contradiction" in the next, and the finer test
lived only in `hints.md`. It now carries the propagation test, with both
of Galaxies' rungs as the worked pair: `soleOwner` is checking (true or
false on sight, any tier), the contradiction rung is guessing
(Unreasonable-only). **It also flags an unaudited consequence**: the same
doc describes the Latin family's `Extreme` tiers as this shape, and
nobody has read `latin.ts` against the test.

**Guarded, not assumed.** Nothing in the rung's code stops it firing on a
Normal board — it holds only because the direct rungs always finish one.
Measured at 0 firings across 3,067 steps on 26 Normal boards, and now
asserted (`galaxies-hint.test.ts`, "only the Unreasonable tier is ever
asked to guess"), together with its converse: an Unreasonable board *does*
need the rung, so the tier is not decoration.

**Coverage, for the record:** 26 Unreasonable boards across 7x7/10x10/15x15
all solved by following hints, every one of them needing the rung at least
once. That is not a proof the generator cannot emit a board needing nested
speculation — it grades with `solverRecurse` to depth 5 and this rung goes
one level deep — but such a board is by definition Unreasonable, so the
hint declining to narrate it is the policy working, not a defect.

## Open Questions

- None outstanding; D2 (F1) and D5 (F4) are settled above.
