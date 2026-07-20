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

## D2 — `path.c` is a seed, not an oracle

Its path-growing strategy (repeatedly add a path, or extend one end and push
others aside) is a reasonable *candidate producer* and worth reusing. But it is
explicitly inadequate on its own, so it is subordinated to the new solver's
uniqueness gate and tuned against the two quality failures upstream names:

- the add-vs-extend priority knob (add-where-possible gives too many trivial
  short paths; extend-where-possible gives hopelessly interwoven, non-unique
  grids) — find the middle, gated by the solver;
- boring paths (a whole edge row as a single path) — reject or penalise.

Its `tree234` usage becomes idiomatic Map/Set lookups (the leaf rule); do not
transcribe tree234.

## D3 — No differential; assurance is behavioural

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
behavioural + render tests.

## Risks

- **Solver feasibility (D1)** is the make-or-break unknown; spike it first.
- **Generator quality (D2)** is an open research-ish problem upstream did not
  solve; budget for iteration or accept a narrower size/difficulty range.
- **No oracle (D3)** — weakest assurance of the seven changes.
- **Greenfield UI (D4)** — no reference beyond a paragraph of intent.
