# Design — add-spokes-hint

## Context

Spokes' solver (`spokes/solver.ts`) is already a fixpoint over four rungs plus a
validator, and every rung reaches its conclusion by a stateable argument, not by
search. That is the whole precondition for a Palisade-grade hint: the engine that
proves a move can also *say* why (the `ts-engine` narratable-deduction doctrine —
solver and hint are two projections of one engine, never two implementations).

The rungs, in the order `spokesSolve` runs them:

| rung | what it concludes | why |
| --- | --- | --- |
| `spokesSolverOnes` | mark the spoke between two clue-`1` hubs | joining them satisfies both and seals them off as a closed pair of two, stranding everything else |
| `spokesSolverFull` | draw every remaining spoke of a hub, **or** mark every remaining spoke | `available − marked == clue` (nowhere else left to put them) / `lines == clue` (no room for more) |
| `spokesSolverDiagonal` | mark a diagonal | its crossing partner is already a line, and two diagonals cannot cross |
| `spokesSolverAttempt` | set one spoke | the opposite value provably drives `spokesValidate` to `invalid` |

`spokesValidate` is the oracle underneath all of them: per-hub line and mark
counts, no crossing lines, and — via the `dsf` — no group of hubs sealed off from
the rest. That connectivity clause is what gives the two-ones rule and most of the
look-ahead contradictions their bite, and it is the part of Spokes a new player
routinely fails to see. A hint that teaches it is worth more than one that teaches
counting.

The engine side needs nothing new: hooks, `ActiveHint` lifecycle, `continuesPrevious`
journeys, auto-hint pacing and overlay clearing all already exist. Spokes is a new
*implementer*.

## Decisions

### D1 — The hint replays the solver from the player's board, one **firing** at a time

`deduceSpokesPlan(board)` clones the player's current board and walks the same
rungs in the same order as `spokesSolve`, but returns one *firing* at a time — a
firing being one rung reaching one conclusion — with the spokes it forces, the
rung that forced them, and its evidence. It then applies that firing and repeats.

Rung order is preserved, so the cheapest, most teachable deduction is always
offered before the look-ahead, and the plan is **recompute-stable** (quality bar
rule 5) for free: it is a deterministic function of the board, so a hint
recomputed after the player follows a step simply continues where the last one
left off. There is no heuristic to oscillate, unlike Inertia.

The plan is capped at `HINT_PLAN_MAX` firings; the look-ahead rung is expensive
(a sub-solve per candidate spoke) and a player rarely follows more than a few
steps before diverging. Hitting the cap just ends the plan; the next request
computes the next batch.

### D1a — Goal-first ordering; never hint a useless rule-out (owner directive)

The first cut replayed the solver's *own* rung order (two-ones → full → diagonal
→ look-ahead), which surfaced two problems the owner flagged on a real board:
it hinted the two-ones rule-out between two hubs that were **already satisfied**
(pure busywork — neither could take the spoke anyway), and it led with rule-outs
over connections. Both are fixed in `nextSpokesFiring`, which the hint is free to
reorder because it only needs each firing to be *forced*, not to mirror the
solver:

- **Draw connections first.** `findSaturation` (the line-forcing rung) is tried
  before any mark rung, so the plan leads with progress toward the picture.
- **A rule-out is hinted only when it helps a hub that still needs lines**
  (`markHelps`: at least one endpoint unsatisfied). A mark between two satisfied
  hubs advances nothing — and, crucially, is **never load-bearing**: completion
  needs the required *lines* drawn, and a both-ends-full spoke feeds no hub's
  saturation, so filtering it can't stall the plan (guarded by
  `spokes-hint.test.ts` "never marks a spoke whose both hubs are already
  satisfied"). Two-ones additionally requires *both* clue-1 hubs unsatisfied —
  the only state in which its "would isolate them" narration is even true.

The narration was also condensed hard (owner: "way too long for the little
deduction it offers"): each rung is now one line for a player who knows the rules
(*"Connecting two 1-hubs would strand them from the rest — so rule out this
spoke."*), guarded by a 120-char per-step ceiling in the hint tests.

### D1b — The crossing rule-out is automatic, not a hint (owner directive)

A diagonal line visibly blocks its crossing — any player can see a line can't go
there — so hinting the rule-out is noise. The game now does it: `executeMove`
auto-marks the crossing when a diagonal line is drawn, and clears that mark when
the line is erased (`syncDiagonalBlock` in `state.ts`; a blocked crossing is inert
to clicks, so the auto-mark can't be toggled off while the line stands). The
crossing must be a **real** mark, not just a display cue, because the solver/hint
counting (`nodes − marked == clue`) needs it — which is exactly why upstream had a
`spokes_solver_diagonal` rung. The hint's replay auto-marks identically
(`applyFiring` calls the same helper), so the **diagonal hint rung is deleted**:
it can never fire (the crossing is marked the instant its partner is drawn) and it
was never a deduction worth teaching. Guarded by `spokes.test.ts`
("auto-rules-out the crossing … and clears it on erase"). Diagonal *line* hints
(from saturation/contradiction) are unaffected — the corner-rendering path (D5)
stays.

### D2 — One firing is one journey (quality bar rules 2 and 3)

`spokesSolverFull` on a saturated hub forces **every** remaining spoke of that hub
in one stroke — that is a single deduction, and it must read as a single hint.
It is emitted as one multi-leg journey: the first leg carries the full narration,
the rest are flagged `continuesPrevious` so the midend keeps them displayed and
auto-play runs them back-to-back as one hint.

All legs of a firing render in the **same** colour, because they share a fate.
Giving the "first" spoke a distinct colour would read as "this one is special",
which is precisely the misleading signal bar rule 3 exists to forbid.

The two-ones and crossing-diagonal rungs each force exactly one spoke, so their
journeys are single-leg.

### D3 — Narration: state the premise, then the impossibility, then the conclusion

Every sentence a hint utters is a claim, and each of these is checked in code
before it is uttered (quality bar rule 5).

- **Saturation** — *"This hub needs 4 lines and has exactly 4 spokes left that
  could carry one. There is nowhere else to put them, so every one of them is a
  line."* Evidence: the hub, and the spokes being drawn.
- **Exhaustion** — *"This hub already has all 3 of the lines it needs, so no
  other spoke here can carry one — rule them all out."* Evidence: the hub, and
  its existing lines.
- **Crossing diagonal** — *"A line already runs corner-to-corner through this
  square, and two diagonals cannot cross. So this diagonal is ruled out."*
  Evidence: the crossing line.
- **Two ones** — *"Both of these hubs need exactly one line. If that line joined
  them to each other, both would be finished and the pair would be sealed off
  from the rest of the board — and every hub has to end up in one connected
  group. So they cannot be joined to each other."* Evidence: both hubs. This is
  the rung most worth teaching, and its narration must name the connectivity rule
  explicitly, not just assert the mark.
- **Contradiction look-ahead** — *"Suppose this spoke were a line: following the
  forced consequences, the ringed hub is forced past its clue — impossible. So it
  must be ruled out."* Evidence: the hypothesis spoke (the highlighted move) plus
  the hubs where the board breaks (ringed). **D3a — resolved (see below).**

#### D3a resolved — narrate the hypothesis + the *named* break, ring where it breaks

Measured firing frequency while following the plan on clue-only boards (15
seeds/preset): the look-ahead is **not** rare on Tricky/Hard — it is the single
most common firing on 4×4 Hard (contradiction 197 vs saturation 125, exhaustion
83, …), and ~1/3 of firings on Tricky. So its narration matters. The trial
board breaks in one of three ways, split roughly evenly: an **over-filled hub**,
a **crossing** pair of diagonals, or a **sealed** group — so `analyseBreak`
classifies which, names it in one clause (*"the ringed hub is forced past its
clue"* / *"two diagonals are forced to cross at the ringed corner"* / *"the
ringed hubs are cut off from the rest of the board"*), and rings those hubs as
evidence — the words and the picture agree.

The narration names the **final** contradiction rather than replaying the forced
chain, and is honest that a chain exists (*"following the forced consequences"*).
This is single-level forcing, which `hint-authoring.md` §1B.1 flags as *not* a
glance-able step, with two compliant answers: externalize it as a tentative
what-if walk, or keep forcing-tier boards out of non-`Unreasonable` tiers.
Spokes ships Tricky and Hard, which *require* the look-ahead, so neither applies
cleanly; this hint takes the collection's current pragmatic stance (the same as
the Latin `Extreme`-tier hints §1B.1 says to revisit "when next touched"): a
concise honest proof, with the break **ringed** so the conclusion is anchored to
something the player can see, not merely asserted. A full tentative-mark walk is
the aspirational next step, out of scope here, and would be a cross-game engine
build (it needs a hypothetical-mark render state) rather than a Spokes change.

### D4 — Refuse rather than deduce from a doomed board

Refuse, with a banner, when:

- the board is **solved** — "This board is already solved.";
- `findMistakes()` is non-empty — the standard "fix the highlighted mistakes
  first" banner, since Check & Save already paints them;
- the board is live-invalid in the way the renderer already shows (an over-filled
  hub, or a group sealed off) — same treatment: the player must undo, not be
  handed a "forced" move that only follows from their own error;
- no rung fires. On a shipped board past the guards above this should be
  unreachable, since generation gates every board on this very solver; if it ever
  happens it is a bug, and refusing honestly beats inventing a step.

### D5 — Rendering: the hint paints a spoke, and must invalidate its corner

The hint overlay is folded into the per-hub cache key (via a dedicated
`OverlaySidecar`), plus a `COL_HINT_CELL` ring on the evidence hubs — otherwise
it will not paint on a hub nothing else changed (playbook §3.2). Guarded
cross-game by `hint-overlay.test.ts`.

**Refinement during implementation — the picture must match the words.** A first
cut drew *every* forced spoke as a `COL_HINT` line (as this section originally
said). Eyeballing the frames showed the flaw: three of the five rungs force a
*mark* (rule-out), and a solid blue line for a rule-out reads as *"connect
these"* — the opposite of the narration (quality-bar rule 2.4/5.1). Fixed by
echoing the game's own visual language: a **`SPOKE_LINE` suggestion** is a
`COL_HINT` line ("draw this"), a **`SPOKE_MARKED` suggestion** is a `COL_HINT`
dot at the spoke's rim ("rule this out") — the same shapes the game already uses
for a drawn line and a placed mark, in the hint colour. The forced state rides in
the highlight (`spokes[].state`); the sidecar carries line bits and mark bits in
disjoint ranges, drawn only where the spoke is still `EMPTY` (a leg already
followed is a real line/mark, not re-tinted).

**Spokes-specific trap (now only for line diagonals):** a diagonal line is drawn
as two halves by the two hubs it joins, and the four-cell corner square it passes
through belongs to the separate corner pass (see the `render.ts` header). A
diagonal *line* hint therefore invalidates its corner entry too (a `CORNER_HINT`
bit in the corner key, mirroring `CORNER_WRONG`) — otherwise the hint paints with
a hole in the middle. A diagonal *mark* hint is a rim dot, so it needs no corner
handling; only line suggestions reach the corner pass.

## Open questions — resolved

- **D3a** — the depth of the contradiction narration. **Resolved** (see D3 above):
  name the hypothesis + the classified break in one clause, ring the break hubs,
  don't replay the chain. Measured, not guessed.
- Whether the look-ahead is common enough to be worth its narration budget.
  **Answered: yes** — it is the most common firing on 4×4 Hard and ~1/3 of Tricky
  firings (measurement in D3a), so the elaborate-enough narration is justified.
