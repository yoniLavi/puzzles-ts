# add-bridges-hint — the measurement

Taken 2026-09-12, against the two falsifiers this change's `proposal.md` stated
before the work started. Line counts are raw `git diff --numstat` on production
files, which is how the control in
[`characterize-the-hint-assessment-corpus`'s `audit.md`](../archive/2026-09-09-characterize-the-hint-assessment-corpus/audit.md)
§2.2 and `add-tracks-hint`'s `findings.md` §1 were both taken.

## 1. The number

| row | Bridges | Tracks | Galaxies (the original control) |
| --- | --- | --- | --- |
| narration and plan mechanics | **+405** | +345 | +457 |
| **the recording projection** (`solver.ts`) | **+377 / −9** | +536 / −19 | +387 / −29 |
| the overlay (`render.ts`) | +331 / −51 | +220 / −19 | +192 / −26 |
| wiring (`index.ts`, `state.ts`) | +44 / −8 | +31 / −1 | +102 / −1 |
| **game total** | **+1,157 / −68** | +1,132 / −39 | +1,138 / −56 |
| **engine** | **0** | 0 | +3 |

Bridges' narration row is `hint.ts` + `hint-text.ts` together, because Tracks'
+345 was measured before `extract-hint-strings` split the second file out and
the rows would otherwise not be the same thing.

**Three games of very different shape, three totals inside 2% of each other.**
That is worth noticing before anything else: a hint has cost about the same on
a square grid of cells (Galaxies), a square grid whose deductions are about the
*sides* between cells (Tracks), and a non-grid graph of islands and spans
(Bridges). Whatever the shared layer is buying, it is not moving this number,
and the number does not appear to depend on the board model either.

## 2. The falsifier the corpus stated: the marks do not transfer, at all

The audit predicted that `hint-mark.ts` — used by **24 of the 30** hinting games,
every one of whose marks is a band on a **cell's border box** — would meet its
limit here, because "a bridge spans several cells and is not any cell's border".

**It is stronger than that: nothing from `hint-mark.ts` transfers to Bridges,
and the island was the surprise.** The audit expected the islands to band and
the bridges not to. In fact:

- **A bridge is a span**, as predicted. It is drawn as the bridge bundle it
  would become, with the bars the step *adds* in the action color over the ones
  already there, or as the game's own pair of crosses when the step blocks it.
- **An island is not a cell either.** `islandRadius` is `12/20` of the tile, so
  the circle is *wider than its own tile* and is clipped into the four
  neighbors, which is why the packed draw model carries island-arc fields for
  every line square. A band on the tile's border box would cut across the
  circle rather than outline it. The island is marked by recoloring **its own
  rim and clue digit** — which is a ring, because `drawIsland` paints an
  annulus, and it is one mark rather than two because the digit takes the rim's
  color.

So the honest answer is not "the shared vocabulary generalizes" and not "it is a
square-grid convention wearing framework clothes" either. It is **the same
answer `add-tracks-hint` gave one game earlier, arrived at from further away**:
where a game's decided element is not a cell, the mark comes from
§ "Echo the move's shape in the hint color" — the game's own shapes recolored —
and `hint-mark.ts` is the right tool exactly when the thing being marked *is* a
cell. Two games in a row have now needed the second answer for part of their
marks and Bridges for all of them, which is enough to say so in
`docs/games/hints.md` rather than leaving each game to rediscover it.

**And the cost of not transferring is visible in row 3.** Bridges' overlay is
+331 against Tracks' +220 and Galaxies' +192, and the extra is the mirrored
island/line hint word the packed draw model forces: a hint that recolors an
island has to intrude into four neighbor tiles exactly as the island does.

### 2a. A name a cross-game guard keys on can already be taken

Bridges exported `COL_HINT` before this change, for upstream's *"Show possible
bridge locations"* bevel — a different thing entirely. `hint-mark.test.ts` finds
each game's hint colors by reading that export out of the game's own
`render.ts`, so enrolling Bridges would not have failed the guard: it would have
**silently pointed it at a color no hint ever paints**. The constant is now
`COL_POSSIBLE`. This is `AGENTS.md` § "A scan that keys on a name" from the
other end — the sweep keyed on a name, and the name was taken — and it is worth
checking for in any game that joins a guard that reads its source.

## 3. The other falsifier: a rung is not a premise, at either end of the range

`add-tracks-hint` §3 found that Tracks' **8** rungs hold **11** narratable
premises, and concluded that the runner's granularity is the *grading*
granularity while a hint's unit is strictly finer. The obvious reading of that
is "eight fine rungs were still too coarse". Bridges is the same finding at the
opposite extreme, and it is what makes the conclusion general rather than
Tracks-shaped:

| | rungs | narrated premises | distinct rules the projection separates |
| --- | --- | --- | --- |
| Tracks | 8 | 11 <sup>a</sup> | 12 <sup>b</sup> |
| **Bridges** | **3** | **7** | **9** <sup>c</sup> |

<sup>a</sup> `docs/games/hints.md` § "A rung is not a premise".
<sup>b</sup> `add-tracks-hint`'s `findings.md` §1, which is where the ≈45 below
comes from. <sup>c</sup> The seven narratable premises plus the two rules that
declare none: the bookkeeping mark, and stage 3's per-direction maximum, which
the player has no way to write down at all.

Per narrated premise the recording projection costs **54 lines in Bridges and 49
in Tracks**; per distinct rule, **42 and 45**. The rung counts differ by 2.7×
and the per-premise cost differs by about a tenth, in opposite directions
depending on which unit you pick — which is the point:

> **The recording projection's cost tracks the number of distinct premises a
> game's rungs hold, and is independent of how many rungs hold them.**

That was `add-tracks-hint`'s claim from one measurement. It now has two, taken at
3 rungs and at 8, and they agree. The consequence for the technique contract is
unchanged and now better supported: `DeductionTechnique` is the right unit for a
tier and the wrong unit for a sentence, and a contract that split a technique
into find/apply/narrate would split at the rung, which is above where the
narration splits.

**The per-premise early return is what makes the difference visible**, and in
Bridges it is needed at *two* levels rather than one. Stage 1's three arms are
already mutually exclusive, so the level that matters there is the **sweep**: a
stage runs every island before reporting, and on the recording path it stops at
the first island that moved. Stage 2 and stage 3 need the inner return as well,
because each holds two rules and each rule runs its own loop over directions.
Without the outer one, a single step on a 15x15 board would carry the bridges of
every island the sweep touched. `bridges-hint.test.ts`'s *"one firing is one
step: every move in it runs from one island"* is the assertion that fails when
it is removed, and it is checked over **1,349** shown steps, **380** of which
really do decide more than one span.

## 4. Three smaller measurements

**Every premise fires, and the one the shipped presets cannot reach is derived
rather than observed.** Over 12 shapes × 5 seeds — **2,683 firings**, measured
2026-09-12 — all seven premises fire and no board stalls. `wouldCloseLoop` is
the exception, and it is
not a rarity: the loop rung returns immediately when loops are allowed, and
**every Bridges preset allows them**, so no shipped board can reach it at all.
The ledger entry asserts that fact about the presets rather than the absence of
the firing, so a preset that stopped allowing loops makes the entry wrong and
the test says so.

**Half of every deduction is bookkeeping the player never sees.** **1,334 of the
corpus's 2,683 firings** — 49.7% — are stage 1 marking an island complete, and
the other 1,349 are the plan. They declare
no reason and the plan hides them, and Bridges needs **no board-legality half**
to `showable` at all — the reason test alone is enough, because that one rule is
the only reason-less one and the fork's own auto-mark aid already grays a
satisfied island. Tracks needed both halves; Bridges needs one. The hook's
second obligation is therefore per game rather than universal.

**The trial rung is a Check, not a Search, and that is now settled for this
game.** Stage 3 places bridges, asks two validators that run no fixpoint and no
sub-solve (`solveIslandSubgroup`, a dsf group query; `solveIslandImpossible`, a
per-island arithmetic sweep) and rolls back. Under
[`solver-and-generator.md`](../../docs/games/solver-and-generator.md)
§ "Check, Tactic, Search" that is a Check, so it narrates directly at Tricky and
Bridges' top tier needs no `Unreasonable` name. The audit files Seismic's
`attempt` third precisely because it is *not* obviously on this side of the
line; Bridges' is, and establishing that cost one reading rather than a change.

## 5. What this leaves the corpus

Tracks and Bridges were the audit's first two picks, and both have now reported.
The third, **Seismic**, is the one the audit said to take "only if the first two
disagree" — and on the deduction end they do not: the runner carries the loop,
the recorder is per-game, and its cost is per premise. What Seismic would settle
is a different question (where the Check/Tactic/Search line falls for a one-ply
trial rung), and Bridges has made it *cheaper* rather than more urgent by
answering the same question for a rung of the same shape.
