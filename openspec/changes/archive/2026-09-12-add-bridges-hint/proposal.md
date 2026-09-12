# add-bridges-hint

**Readiness: ready.** The ladder is declared and certified, the generator gates
on it, the solver is a Check rather than a Search at every tier it ships, and
there is no contract to choose: the hint is written against today's machinery,
deliberately.

Corpus and order from
[`characterize-the-hint-assessment-corpus`](../archive/2026-09-09-characterize-the-hint-assessment-corpus/audit.md)
(2026-09-09) § 3, which picks **Bridges second** and says why. Its first pick,
Tracks, shipped as `add-tracks-hint` (2026-09-10) and reported in that change's
`findings.md`; this change is the next entry of the same instrument, not a
backlog item taken in turn.

## Why Bridges, and why second

Four things, all of them measured rather than argued:

- **Its ladder is declared and certified.** Three stages on
  `runDeductionFixpoint`, with `bridges-ladder.test.ts` proving them equivalent
  to the hand-written stage loop over four shapes, three seeds and four caps —
  and an **empty `unreached` ledger**, so the corpus reaches all three.
- **Its generator gates on that ladder.** `newBridgesDesc` rejects a board
  `solveFromScratch(st, difficulty)` cannot finish, and (above Easy) one that
  `difficulty - 1` *can*. So every published Bridges board is explainable by the
  three stages at its own tier, and **no board moves** for this change.
- **It has a frozen differential**, so a hint that reaches into the generator's
  path fails loudly rather than quietly changing which boards exist.
- **It is hintless**, which is the point of the corpus: re-reading a game that
  already has a hint tests nothing, because that hint was written against
  today's machinery.

## What this measures, stated as a falsifier before the work starts

The audit gives Bridges two falsifiers, and the first is the one that carries
the change.

> **The falsifier: `hint-mark.ts`'s marks are cell-shaped by construction, and
> Bridges' deductions are not about cells.** Every mark that module draws is a
> band on a **cell's border box** (`MarkBand` is a content box plus an outward
> and an inward reach), and `hint-ordinal.ts` draws its chain number "inside one
> tile" so it can ride the existing `OverlaySidecar` diff. **24 of the 30
> hinting games use `hint-mark.ts`.** An island sits at a grid coordinate and
> can be banded — but a *bridge* spans several cells and is not any cell's
> border, and the bridge is exactly what a Bridges deduction concludes about.
> Either the shared vocabulary generalizes, or a mark helper 24 games depend on
> is a square-grid convention wearing framework clothes, and the honest place to
> say so is `docs/games/hints.md`.

The second is about **granularity**:

> Bridges' ladder is **three coarse stages** (`stage1-arithmetic`,
> `stage2-counting`, `stage3-connectivity`), not fine rungs, and a stage that
> forces twenty bridges is not one journey. So Bridges also tests whether the
> granularity the *runner* rewards is the granularity a *hint* needs.

`add-tracks-hint`'s `findings.md` §3 already answered half of that from the
other direction — "a rung is not a premise, so return per premise" — on a game
with **eight** rungs holding twelve premises. Bridges is the same finding at the
opposite extreme: three rungs, and the count of premises is what this change
reports. If three coarse stages need the same per-premise early return that
eight fine ones did, then the technique contract's unit is not the hint's unit
at *either* end of the range, and that is a statement about the contract rather
than about two games.

Reporting both numbers honestly is a deliverable, in `add-tracks-hint`'s terms:
**game production lines, of which how many are the recording projection**, and
**rungs against narrated premises**.

## The obstacles, named in advance

- **A trial rung must be classified before it may be narrated.** Stage 3
  tentatively joins a direction, asks two validators (`solveIslandSubgroup`, a
  dsf group query; `solveIslandImpossible`, a per-island arithmetic sweep) and
  rolls back. Read against
  [`solver-and-generator.md`](../../docs/games/solver-and-generator.md)
  § "Check, Tactic, Search" that is a **Check** — one placement, one validator
  call, no fixpoint and no sub-solve — so it narrates directly at any tier. It
  is *not* the Seismic question the audit files third; establishing that it is
  not is part of this change.
- **Two of the three move types are toggles, and one has no player-visible
  form.** `N` toggles a no-line, so a step that asks for one the player has
  already drawn would *erase* it; and stage 3's max-capping writes into
  `maxv`/`maxh`, which no player annotation can express. Both have to be handled
  where the firing is built rather than where it is drawn.
- **The solver's own bookkeeping mark is a player move.** Stage 1 marks an
  island complete through `islandTogglemark`, which is the game's `M` move. The
  fork's `autoMark` aid already grays a satisfied island, so that firing tells
  the player nothing their board does not show: it is the
  § "Show only what the board does not already say" case, and Bridges' whole
  answer to it, with no legality test needed.

## Not in scope

Any change to which boards exist. The generator's solve path stays
byte-identical and `bridges-differential.test.ts` passes unedited; if it does
not, the recording projection has leaked into the hot path.
