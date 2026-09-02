# Design — add-path-ts-port

## Context

Path is a Numberlink generator experiment, and the least ready of upstream's
unfinished puzzles. `path.c` has **no `struct game`, no input, no rendering, and
no solver** — it is purely a grid generator, and upstream's header records both
that its grids "are not of suitable quality to be used directly as puzzles" and
that fixing the fatal problem (no unique-solution guarantee) needs a solver it
never wrote: *"I fear there is no alternative but to write — somehow! — a
solver."*

So porting Path is a build, dominated by two things upstream left undone: the
solver, and the generator's quality. This document is about de-risking those,
not settling implementation detail.

## D1 — The solver is the crux and gates the whole change

Every logic-puzzle port in this repo meets a **unique-solution generation** bar,
and a solver is the only way to meet it. Numberlink's is non-trivial: it is
NP-complete in general, though puzzle-sized boards are tractable. The change
cannot proceed past a spike until a solver exists that can *prove uniqueness*
(not merely find a solution) on realistic sizes at acceptable speed.

**Therefore the solver is a gating spike (task 0.2 / §1), before any game or
generator work.** If the spike shows uniqueness-proving is too slow at usable
sizes, that is a finding that legitimately ends the change — better learned in a
spike than after building a UI on top of an ungateable generator.

Approach is open: constraint propagation (forced links from degree/parity
constraints) with a bounded search fallback is the likely shape, mirroring how
the deductive games in this repo grade difficulty. Record the choice in the
spike.

**A SAT/CP encoding is an explicit candidate for that spike** (owner-scoped,
2026-08-01), and this is the change that decides whether one gets built at all.
Numberlink is a classic SAT benchmark, and "prove uniqueness" is the query SAT
answers most naturally: solve, add a clause excluding that solution, solve again.
Two objections were raised and only one survived:

- *It cannot narrate its reasoning, and this repo's solvers double as hint
  engines.* **Withdrawn** — several games already ship an *Unreasonable* tier the
  solver reaches and the hint does not, so "solves it but cannot explain it" is an
  established shape. A SAT-backed uniqueness gate needs no narration at all; the
  *hint* would still come from the deductive rungs, which is the same split those
  games already have.
- *It would forfeit the byte-match differential.* **Stands, but does not apply
  here.** On a ported game the generator is solver-gated, so its accept/reject
  decisions must reproduce C's deductive verdicts exactly, and a SAT uniqueness
  check would change which puzzles exist. Path has **no C game and no C solver**
  (D3), so there is nothing to forfeit — which is precisely why the question
  belongs in this spike and nowhere else.

If SAT wins here, **Seismic's region fill is the second consumer** that would
justify promoting it from Path-local to shared: that fill is already diverged from
upstream, so it has no oracle to lose either, and its 10×10 feasibility question
is a SAT query (see the audit archived with `audit-author-known-issues`, §3a). Do
**not** build a shared constraint engine before this spike — infrastructure ahead
of the game that pressures it is the mistake
`openspec/postmortems/2026-05-21-scene-graph-withdrawal.md` records.

## D2 — `path.c` is a seed, not an oracle

Its path-growing strategy (repeatedly add a path, or extend one end and push
others aside) is a reasonable *candidate producer* and worth reusing. But it is
explicitly inadequate on its own, so it is subordinated to the new solver's
uniqueness gate and tuned against the two quality failures upstream names:

- the add-vs-extend priority knob (add-where-possible gives too many trivial
  short paths; extend-where-possible gives hopelessly interwoven, non-unique
  grids) — find the middle, gated by the solver;
- boring paths (a whole edge row as a single path) — reject or penalize.

Its `tree234` usage becomes idiomatic Map/Set lookups (the leaf rule); do not
transcribe tree234.

## D3 — No differential; assurance is behavioral

There is no C game and no C solver, so there is nothing to byte-match. Assurance
rests entirely on the solver's own correctness (proven on hand-authored boards
of known status) and on the invariant that every generated board is uniquely
solvable. This is weaker than the differential every real port has, and is a
direct consequence of Path being unfinished — state it to the owner.

## D4 — The game is invented from upstream's header sketch

Upstream never built the UI but sketched it in the header: a connection-based
data model (track links between adjacent cells, so a player can lay path
sections before joining them to an endpoint) and click-drag-to-link input. That
sketch is the starting point; the rest is designed by this change and covered by
behavioral + render tests.

## Risks

- **Solver feasibility (D1)** is the make-or-break unknown; spike it first.
- **Generator quality (D2)** is an open research-ish problem upstream did not
  solve; budget for iteration or accept a narrower size/difficulty range.
- **No oracle (D3)** — weakest assurance of the seven changes.
- **Greenfield UI (D4)** — no reference beyond a paragraph of intent.
