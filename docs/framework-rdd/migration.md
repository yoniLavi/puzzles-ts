# Migration — from the Game interface to the framework

> **⚠️ STATUS: design fiction** — describes a system that does not exist.
> Authored by `rewrite-game-dev-docs` (2026-08-07). Current truth:
> [`docs/games/`](../games/README.md). See the [vision README](./README.md).

The framework is not a rewrite; it is mostly a *promotion*. The engine already
contains, as separately-adopted helpers, nearly every organ the framework
needs — what changes is that they stop being things a game remembers to use
and become things a definition implies. This document maps the path and pins
the invariants that must not move.

## What already exists, and what it becomes

| Today (adopted helper) | Framework organ |
| --- | --- |
| `deduction-fixpoint.ts` | The solve/grade projection's loop, unchanged. |
| `hint-plan.ts` + `deduction-record.ts` | The recorder-on projection (merged: one runner, recorder optional). |
| `candidate-hint.ts` + `latin.ts` + `latin-hint.ts` | The CandidateBoard and LatinBoard substrates. |
| `difficulty.ts` (`DifficultyContract`) | Derived from the ladder; the contract type survives as the introspection surface. |
| `overlay-sidecar.ts` | Internal to the tile renderer; no game-visible API. |
| `pointer.ts`, `params.ts`, `key-labels.ts` | The param layer's leaves. (`pointer.ts` was to be the gesture library's; that direction is withdrawn — it stays what it is, the frontend-fact leaf, and the derivable half of a keyboard is already derived there.) |
| `grid/`, `geometry.ts` | (Was to be the board model's topology providers; that direction is withdrawn — they stay what they are. `grid/` *is* the general board model, for the two games that want one; `geometry.ts` is the two-line coordinate pair the rest curry with their own border.) |
| `retry-limit.ts`, `step-budget.ts` | Framework-injected budgets. |
| `testing/` harness + the per-capability guards | The conformance suite's execution layer. |

The `Game` interface itself remains the runtime contract the midend consumes:
a framework definition *compiles to* (is adapted onto) a `Game` object. That
adapter is the whole trick — the midend, worker, app shell and save formats
do not change at all in phase one, which is what makes the migration
incremental and abortable.

## Order of adoption

1. **The framework core co-developed with a greenfield pilot (Path), the way
   the TS midend was co-developed with Flip.** A greenfield game is the
   cheapest honest pressure on the contract: no frozen IDs, no fixtures, no
   narration strings to preserve — the validation is "is this clearly nicer
   than what the playbook would have produced?", answered on a real game.
   Numgame is the second data point. Given the dozens-of-new-games ambition
   (see the README), greenfield-first is also simply the value stream.
2. **The conformance suite over the registry**, replacing the hand-enrollment
   lists for framework games; non-framework games keep today's guards.
3. **Re-expression exemplars, one per family, opt-in** — one Latin game
   (Towers), one edge game (Palisade), one planner game (Sixteen), one
   bespoke-hatch game (Loopy — which exists to prove the hatch, not the
   fit). These validate the *migration* invariants (byte-stable IDs, frozen
   narrations) that greenfield games cannot. A game adopts only when the
   re-expression is *nicer* — the standing "noticeably cleaner is
   sufficient, contortion is disqualifying" rule decides, per game.
4. **Then the full sweep, in family batches (owner decision, 2026-08-07):
   every game is re-expressed.** In an AI-driven repo the corpus is the
   documentation — future sessions learn the architecture from the games
   they open, so a mixed tree manufactures divergence at exactly the scale
   the many-games ambition implies. The sweep waits until the exemplars
   have hardened the contract (a premature sweep multiplies every contract
   change by 57), then proceeds family by family, mechanical by that point.
   A handful of games (Untangle, Cube) adopt the *definition* while keeping
   bespoke input/render hatches — the hatches are part of the framework,
   and even those games gain conformance enrollment.

   Two rules make 57 re-expressions tractable without diluting the
   acceptance doctrine:

   - **Two-lane acceptance.** A re-expression whose entire guard set passes
     **unchanged** — frozen differentials byte-clean, narration strings
     byte-clean, render snapshots untouched — is machine-provably invisible
     and gets batched spot acceptance; one that re-baselines even a single
     snapshot takes the full owner-acceptance gate. The scarce resource is
     owner time, not AI labor, and this spends it only where behavior
     could have moved.
   - **A capability diff per game.** The characteristic sweep risk is silent
     capability loss (the repo's known silent-shrink shape at scale): each
     re-expression asserts the game has the same capability set before and
     after — hints, mistakes, prefs, keypad, reference aid, difficulty
     tiers — checked by the suite, not by eye.

     > **This needs no manifest, and asking for one would make it weaker**
     > (`audit-declared-versus-derived-capabilities`). The set is *derived* —
     > the optional `Game` members the object has, the `Ui` fields its `newUi`
     > returns — and a derived set snapshotted in the guard is the same diff
     > that cannot be forgotten by a re-expression that drops a member. The
     > shape already ships five times over; `contract-surface.test.ts` reads
     > the whole optional surface off the interface's own AST, which is the
     > closest thing to a manifest this repo needs and is not written per game.

## Invariants that must not move

- **Game IDs and descs are player promises.** Every existing game keeps its
  hand-written codecs; `random.ts` stays bit-identical; a re-expression
  changes zero bytes of any `params:desc` / `params#seed` id. Asserted by
  the frozen differentials, which are precisely the net for this.
- **Narration strings are frozen through re-expression.** A hint suite's
  wording assertions pass unchanged, byte-for-byte, or the re-expression is
  wrong. (An exemplar hint never loses a word to an abstraction — the rule
  that has already survived eleven Latin games survives this too.)
- **Render output is stable where behavior is.** Tier-2.5 snapshots move
  only where a change is *intended*; the mechanical review rule from the
  color work (every changed snapshot line is explainable by the declared
  change) applies to each adoption diff.
- **No approval-free framework-scale pivots.** Each family exemplar is its
  own openspec change with owner acceptance; the scene-graph postmortem's
  bar (real downstream pressure, measured) governs anything that touches
  rendering.

## What could falsify this design

Named up front, because an RDD doc that cannot fail is decoration:

- ~~The adapter forces contortion on the first non-Latin exemplar (the
  Palisade re-expression is the test — edge games are where "cells with
  domains" assumptions die).~~ **This one fired, 2026-09-06** — though not the
  way it expected. Palisade could not be contorted by the board model because
  it had already been served *by another axis*: `border-grid.ts` gives it state
  allocation, its pixel→edge map, its half-grid cursor and its `computeSize`
  geometry, keyed on the mechanic. And `src/engine/grid/` — a general
  planar-graph board model with all eighteen tilings — has shipped since Pearl
  and has two consumers. The board model is withdrawn:
  `openspec/postmortems/2026-09-06-board-model-withdrawal.md`.
- ~~The derived gesture layer cannot express a real game's input without more
  declaration than the `interpretMove` it replaces (Sixteen's drag-to-slide
  is the test).~~ **This one fired, 2026-09-05.** Sixteen's input decomposes
  into six arms; two are library-shaped and the other four are ~155 of its 262
  lines. The gesture layer is withdrawn —
  `openspec/postmortems/2026-09-05-gesture-table-withdrawal.md`. **A falsifier
  that fires is the doc working**, which is why it is struck through here
  rather than deleted.
- The conformance matrix's cost outgrows the gate's budget discipline
  (measure at exemplar three, against `docs/games/testing.md`'s
  right-sizing rules).
- Re-expression keeps producing byte-different narrations or descs
  (would mean the projections are not faithful; stop and redesign rather
  than relax the invariants).

Any of these surfacing ends the phase honestly — the postmortem discipline
exists so that a withdrawal is a recorded outcome, not a sunk-cost slide.
