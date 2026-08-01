# The audit table

Every author-stated known issue in the tree, and what the port did about it.
Archived with this change because the sources — `puzzles/unreleased/docs/<game>.md`
and the `TODO` blocks at the head of each `.c` — live inside `puzzles/`, which
`retire-c-engine` removes.

**Verdicts.** *Fixed before* — resolved by an earlier change, cited.
*Fixed here* — resolved by this change. *Declined* — deliberately not done, with
the reason. *Promoted* — filed as its own change.

Three sources were swept, and they do not say the same things:

1. the `## Status` section of each `puzzles/unreleased/docs/<game>.md` — candid
   and player-facing;
2. the `TODO` / `FIXME` blocks in each `.c`, recovered from git history for the
   games whose C is already deleted (`git log --diff-filter=D`);
3. upstream Tatham's own notes for the games this fork *finished* rather than
   ported — `puzzles/unfinished/README` and each file's header comment.

`puzzles.but` and the per-game HTML overviews were also skimmed (tasks 1.4): they
carry **no** admitted per-game defects. Upstream's prose states design facts
("Mines may require a guess"), not faults, so nothing there needed reconciling.

---

## 1. `docs/<game>.md` — `## Status`

| Game | The author's point | Verdict |
|---|---|---|
| **abcd** | "This puzzle is fully implemented and playable." | — nothing stated |
| **ascent** | "This puzzle is fully implemented and playable." | — nothing stated |
| **boats** | "The solver cannot currently handle some of the harder Battleship puzzles out there." | **Declined.** A solver weaker than the genre's hardest is the difficulty curve upstream shipped, not a defect (playbook §4 rule 3); strengthening it changes every generated board and forfeits the byte-match oracle. `boats/design.md` records the deliberate `STATUS_INVALID` abort that only ever makes the solver weaker, never wrong. |
| **bricks** | "Selecting Tricky difficulty may generate a puzzle at Normal difficulty instead." | **Declined — intended behaviour.** The min-difficulty gate rejects only puzzles the *Easy* solver completes; it never guarantees the board strictly requires the selected tier. Recorded in `bricks/solver.ts` and `add-bricks-ts-port` D3. |
| **clusters** | "There are currently no difficulty settings." | **Declined.** Adding tiers means new solver rungs, changes every board, and forfeits the differential — for a small game nobody has asked for tiers in. |
| **crossing** | "This puzzle has severe problems" — (a) the number list cannot be made to fit, (b) entry is one cell at a time, (c) the per-digit colours are vestigial and "should probably be removed entirely". | **Fixed before**, all three: `add-crossing-ts-port` F8 (panel layout, corrected twice), F10 (cursor auto-advance with a crossword direction model), F11 (per-digit colours gone), and F14 went further — the clue list became the drag-and-drop input surface the author had scrapped. Specs: `crossing` "advances the selection along the number being filled", "places whole clue numbers from the list". |
| **mathrax** | "I haven't properly tested the Recursive difficulty level. It's possible that it works exactly the same as Hard mode." | **Fixed before, and the real fault was worse.** `add-mathrax-ts-port` found upstream's `Recursive` boards are *ambiguous* — 30 of 30 sampled had more than one solution — because both strip loops test `mathrax_solve` for bare truthiness and its "ambiguous" verdict is truthy. The port strips only while the board stays **uniquely** solvable. Below Recursive no recursion runs and the two tests coincide, so Easy/Normal/Tricky stay byte-identical; the divergence is confined to the tier that was ill-posed. Recorded in `mathrax/generator.ts`; asserted by `mathrax-differential.test.ts` ("records upstream's Recursive tier as ambiguous"). |
| **rome** | "This puzzle is fully implemented and playable." | — nothing stated |
| **salad** | (a) the pseudo-Latin machinery "is currently fairly messy, and doesn't allow for more complex solver techniques"; (b) "The Number Ball generator currently doesn't create puzzles that make good use of the concept, in my opinion." | **Declined**, both, recorded in `add-salad-ts-port` design §"the author's own notes". (a) is a `latin.ts` framework project (a repeats-aware cube), not a port; it would change every Salad board and throw away the byte-match oracle. The messiness is confined to the hole↔candidate translation, documented at the head of `salad/solver.ts`. (b) is the same trade for a taste judgement its own author hedges. |
| **seismic** | "playable on lower sizes, but has a near-zero chance of generating sizes higher than 7x7. The generator step that creates randomly filled regions needs to be completely replaced with a different approach." | **Fixed before**, plus one more size **fixed here**; the Seismic-mode 10×10 remainder **declined** — see §3a. `replace-seismic-region-generator` replaced the generator as asked and took Seismic 7×7 Hard from 24.9 s to 108 ms with the 28-fixture byte-match intact. This change makes **Tectonic 10×10** — the size the `.c` names as standard for Hakyuu — reachable from the Custom dialog, which had been barred only by a bound the other mode needed. |
| **spokes** | "It would be interesting if the game had more varied layouts similar to Puzzle Picnic, where the grids aren't fully filled with hubs." | **Declined.** An explicit wish rather than a fault ("it would be interesting"); it is a new generator and a new grid model for a game that plays correctly. |
| **sticks** | "There are currently no difficulty settings." | **Declined** — as clusters. |
| **subsets** | "There are currently no difficulty options or alternate grid sizes." | **Declined.** 4×4 over four letters is the *only* configuration where the sixteen possible sets exactly fill the sixteen cells — the bijection the puzzle is built on — so "alternate grid sizes" is a different puzzle. Upstream's `configure` slot is `false` for the same reason (`add-subsets-ts-port` D8). Now stated in the help page instead of read as an omission. |

## 2. `TODO` / `FIXME` in the C

| Game | The author's point | Verdict |
|---|---|---|
| **abcd** | "Get large puzzles to have a lower fail ratio. I haven't currently been able to produce a valid 10x10n4 puzzle, and a 9x9n4 puzzle can take *tens of thousands* of attempts." | **Promoted → `bound-abcd-generable-sizes`.** Measured here (30,000 attempts per configuration, ~0.065 ms each): 8×8 n4 accepts 1 in 526, 9×9 n4 1 in 15,000, and 10×10 n4 / 9×9 n5 / 12×12 n4 never. The live defect is not the rate but that `ABCD_MAX_ATTEMPTS = 5_000_000` turns a Custom-dialog mistake into ~5.4 minutes of frozen worker before an unhandled throw. |
| **abcd** | "Solver techniques for diagonal mode?" | **Declined** — a stronger solver changes every board (rule 3). |
| **abcd** | "TODO Prevent operations which do nothing" | **Fixed here.** Re-typing the letter already in a cell, or clearing an already-empty note-less cell, no longer costs an undo step. Suppressed *locally* in `interpretMove`, never by comparing serialised state. Test: `abcd.test.ts` "costs no undo step for an entry that would change nothing". |
| **abcd** | error letters are coloured red where "this could be changed to the exclamation mark symbol which appears in Map and Tents" | **Declined.** A style preference the author hedges, and this fork surfaces wrong entries through the shared Check & Save overlay, which is a stronger signal than either. |
| **boats** | solver: "Watch for smaller runs that cannot fit any boat, and fill them with water"; "Recursion?" | **Declined** — both strengthen the solver; rule 3. |
| **boats** | ui: "Certain custom fleets don't fit in the UI" | **Fixed here**, and it was worse than the wording suggests. The fleet display broke rows only *between* whole batches, so a fleet holding more boats of one size than fit on a row drew past the right edge — where the canvas clips it, so **the boats simply were not there**. `/boats?type=4x8f1dn,7` (which `validateParams` accepts and the generator builds) showed **five** of its seven boats before this change and shows all seven, on two rows, after. `fleetLayout` now also breaks *within* an over-wide batch, and is shared by the measurer and the drawer so they cannot disagree about the row count. Tests in `boats.test.ts` assert containment, that every shipped preset is unchanged, and that the layout still matches upstream's wherever upstream fitted; verified in Chrome. |
| **crossing** | "Some puzzles have isolated squares (1x1 areas)" | **Fixed before** — `add-crossing-ts-port` F13. |
| **crossing** | "Find a way to fit the number list on the screen…" | **Fixed before** — F8. |
| **crossing** | "Redesign the graphics. Numbers are drawn on an outdented tile, and each number has a different color." | **Fixed before** — F11, F17 (colour by *dimension*, two hues of provably equal strength). |
| **crossing** | "More difficulty levels" | **Declined** — new solver tiers; rule 3. |
| **crossing** | "Puzzles should be printable" | **Declined.** `printing.c` was deleted at fork and there is no TS replacement; the playbook's standing rule is not to promise a print path. |
| **crossing** | "Optimize drawing routines" | **Declined — already satisfied.** The port renders through a per-tile `Int32Array` cache; there is no measured drawing cost to optimise. |
| **crossing** | `free_puzzle` is `return; // TODO FIX!` — a disabled refcount free | **Fixed before, by construction.** The port has no refcounting; the structure is garbage-collected. |
| **crossing** | "TODO actually scan area for longest row" (`maxrow` hard-coded to 9) | **Fixed before** — recorded and handled in `crossing/state.ts`. |
| **rome** | "TODO loose pixels for corners" | **Fixed before, by construction.** The port paints the whole board `COL_BORDER` and insets each cell's own background, so region borders are the *gaps* rather than drawn segments and there are no corner seams to leave stray pixels in (`rome/render.ts` head comment). |
| **salad** | "TODO: Add difficulty levels" | **Fixed before, upstream.** Salad ships a Difficulty parameter; the TODO predates it. |
| **seismic** | "This is a dumb way of generating a region layout" | **Fixed before** — the generator was replaced; same item as the Status entry above, with the 10×10 remainder declined in §3a. |
| **seismic** | `int FIXME;` in the draw state | Not an issue — an unused placeholder field, absent from the port. |
| **subsets** | "TODO: When other sizes are supported, read n instead of returning a constant" | **Declined** — same as the Status entry; other sizes are a different puzzle. |
| **subsets** | "// TODO repair this" — a commented-out mirror-image elimination in the solver | **Declined, and recorded in code.** The block is not compiled in the C, so the shipped solver has never had it; `subsets/solver.ts` says so at the site rather than silently omitting it. Adding it strengthens the solver and changes every board. |

## 3a. Seismic 10×10 — half of it shipped here, half declined (owner decisions, 2026-08-01)

A change (`reach-ten-by-ten-seismic`) was drafted for the remainder of Seismic's
Status entry and **withdrawn before implementation** when the owner asked whether
there was a way forward worth another session on it. Answering that properly
turned up a **premise error worth recording**, because it had survived into the
change's own proposal: 10×10 was described as needing a better generator in both
modes, and in one mode it only needed a bound removed.

**Measured on the shipped code**, six generations per mode across both
difficulties: **Tectonic 10×10 works** — 41 ms, 4.4 s and 7.2 s per difficulty —
while **Seismic 10×10 fails every time**, each attempt running ~16 s before
exhausting its retry budget. But *neither* was reachable, because `MAX_CELLS = 64`
refused 100 cells in both modes. So the honest state was not "slow"; it was
"barred", and Tectonic was barred by a limit that only Seismic needed.

`replace-seismic-region-generator`'s F7 had unified the bound and dropped the
10×10 preset together, giving one reason for both: an 18-second wait must not come
out of the Type menu. That reason is sound **for presets** and does not reach the
Custom dialog, where the player has typed the size they want. With the owner
confirming that a long Custom wait is acceptable and that a slow preset is not,
this change **splits the bound per mode** (Seismic 64, Tectonic 100) and leaves
presets at 8×8 — now asserted, not merely conventional, so a slow preset cannot
drift back in.

**The general shape**: when one bound serves two mechanisms, retiring the stricter
one silently takes the looser one with it. F7's unification was right about the
tail and wrong about the scope, and nothing caught it because "10×10 is not
offered" was true either way.

### The Seismic-mode half, declined

The rest of the entry — Seismic mode at 10×10 — stays declined, and the reasoning
is worth keeping because the item reads like an obvious open task and will invite
reopening.

**It is two independent projects, not one.** F4 is the *fill* — placing `1..k`
into each region under the keep-apart rule. F7 found that Tectonic 10×10, which
*does* fill, still takes 4.9–6.2 s median and **18.3 s worst of nine seeds**,
because clue-stripping runs `O(cells)` solver calls at `O(cells²)`. So a perfect
fill still leaves 10×10 unshippable until the stripping stage is separately
rebuilt.

**The prior question is unanswered, and it decides everything.** The measurements
conflate "the search cannot find a fill" with "no fill exists". F4 has evidence of
both: small-region tables fail in ~20 ms because the search *proves* UNSAT, while
large-region tables fail in ~20 s because it merely struggles. At the shipped
distribution 10×10 is 0/100, and nobody knows which of the two that is. If those
partitions are unsatisfiable, then no amount of better search — backjumping,
restarts, value ordering — can ever help, and the only lever left is mean region
size, i.e. **changing what a Seismic board looks like at every size**, which is a
taste decision rather than an engineering one.

**And the ceiling is one board size.** The best distribution measured (34/100, at
mean region 4.45 against upstream's realised 2.62) still collapses at 12×12. The
demand-to-capacity ratio sits near 80% at *every* board size, because the
keep-apart distance scales with the number's value rather than with the grid, so
nothing eases off with scale.

**The spec states this as a rule, not as a fact about 10×10.** The `seismic`
requirement now says Seismic's bound is one of *possibility* rather than of
patience, and that raising it requires a multi-seed tail measurement — so the
decline is preserved as the reason, not just as a number.

**If it is ever reopened, do this one experiment first, and only this one.** Take
~20 of the 0/100 partitions at the shipped distribution and put them to a real
CP/SAT solver. **SAT** ⇒ the fill search is the bottleneck and the standard CSP
upgrades are worth costing. **UNSAT** ⇒ 10×10 is impossible at upstream's look and
the only question left is a product one — is a coarser-region Seismic wanted at
every size? That is a half-day spike, and its likely answer makes the rest moot.

### On building a shared CP/SAT solver — the door is open, and Path is the trigger

The first objection raised against a shared constraint engine was that it would be
**un-narratable**: this repo's solvers and hints are two projections of one
deduction engine, and a SAT answer explains nothing. **The owner corrected that
(2026-08-01), and the correction holds**: several games already ship an
*Unreasonable* tier that the solver can reach and the hint cannot, so "solves it
but cannot explain it" is an established, acceptable shape here. Narratability is
not the blocker.

**The real blocker is the byte-match oracle, and it is narrower than it looks.**
On every ported game the generator is solver-gated, so its accept/reject decisions
must reproduce C's *deductive* solver's verdicts exactly; swapping in a SAT
uniqueness check would change which puzzles exist and forfeit the differential
across the collection. So SAT is usable only where there is no oracle to lose:
**already-diverged generator internals, and greenfield games.**

That leaves exactly two candidate sites, and they are not equally weighted:

- **Seismic's region fill** — already diverged (the constructive grower replaced
  upstream's stages), so a feasibility oracle there costs nothing. Real, but it is
  one stage of one game.
- **Path (Numberlink)** — greenfield, and *load-bearing*. Upstream's own header
  says it plainly: *"There remains the question of unique solutions, however. I
  fear there is no alternative but to write — somehow! — a solver."* Numberlink is
  NP-complete, it is a classic SAT benchmark, and "prove uniqueness" is exactly
  the query SAT answers naturally (exclude the known solution, ask again).
  `add-path-ts-port` already gates itself on a solver-feasibility spike whose
  approach it deliberately leaves open.

**So: not now, and not speculatively.** Building the engine before Path's spike
would be framework infrastructure ahead of the game that pressures it — the exact
mistake `scaffold-scene-graph-game-contract` made, which this repo keeps a
postmortem for. The right sequencing is that **Path's gating spike evaluates SAT
as one of its candidate approaches**; if it wins there, Seismic's fill is the
second consumer that would justify making it shared rather than Path-local. That
is the owner's "useful across multiple games" test answered with evidence instead
of speculation. Recorded in `add-path-ts-port`'s D1.

## 3b. Sokoban's levels — nofix, and why the procedural alternative is not cheap

`add-sokoban-level-packs` was filed by this audit and **withdrawn unimplemented**
on the owner's decision: the collection stays entirely procedurally generated, and
authored levels for one game would make Sokoban the exception to the property
that defines the whole thing — every board comes from a seed.

The alternative the owner was open to — take inspiration from known-good levels
and reverse-engineer a *better procedural* generator — was examined and is not the
cheap option it sounds like:

- **Upstream's technique is not the deficiency.** `sokobanGenerate` already uses
  the standard method: start from a solved position and play *backwards*, pulling
  barrels rather than pushing. That is why every level is solvable by construction
  and needs no solver to gate it.
- **What it lacks is selection.** It makes N inverse moves and emits whatever
  position it lands on — no scoring, no candidate pool, no rejection. Sokoban
  quality lives almost entirely in that step: how far the barrels finish from
  their targets, whether the solution forces a non-obvious ordering, whether the
  corridors are trivial.
- **So "generate N, score, keep the best" needs a Sokoban solver**, to know a
  candidate's minimum push count at all — precisely the component the reverse-play
  design exists to avoid needing, and Sokoban solving is PSPACE-complete
  (tractable at these sizes, but a real piece of work).

That is what makes the high-effort-low-value read correct rather than merely
cautious: the cheap-sounding version is not cheap.

## 3. Upstream Tatham — games this fork finished

`puzzles/unfinished/README` explains only *why* the directory exists ("half-written,
fundamentally flawed, or in other ways unready"); the per-game statements are in
each file's header.

| Game | The author's point | Verdict |
|---|---|---|
| **group** | "…too esoteric (not to mention *hard*) for me to be comfortable presenting it to the general public"; TODO: more solver techniques (inverses, hard-mode associativity) | **Declined.** The esotericism is a shipping judgement this fork made differently — Group ships, with a hint (`add-group-hint`). The extra solver techniques strengthen the solver and change every board; rule 3. |
| **slide** | TODO: improve the generator; and three graphics complaints (wishy-washy colours, "the cattle grid effect is still disgusting", an excessive next-piece highlight) | Generator: **declined** — `add-slide-ts-port` found it "mostly sensible already" as the author himself notes, and the move-limit slowness is inherent. Graphics: the target green was **decided by the owner** on 2026-07-30 (keep it); the other two → **`refine-slide-appearance`**. |
| **sokoban** | "Random generation is too simplistic to be credible, but the rest of the gameplay works well enough to use it with hand-written level descriptions." | **Declined — nofix** (owner, 2026-08-01). `add-sokoban-level-packs` was filed (`add-sokoban-ts-port` had recorded curated levels as "a compelling, separate, owner-greenlit follow-up") and then **withdrawn unimplemented**: this collection stays entirely procedurally generated, and a hand-curated pack for one game would make Sokoban the exception to the property that defines the whole thing. The procedural alternative was examined too and is not cheap — see §3b. Archived at `2026-08-01-add-sokoban-level-packs` with its spec delta deliberately unapplied. |

## 3c. The oracle was released after this sweep — what that reopens

**Owner, 2026-08-01, after the table below was written:** *"I'm actually happy to
release the constraint of having the C implementation as our Oracle — it was only
a temporary one for the porting, but now that we've finished porting, I'm very
happy to diverge in favour of a better play experience, wherever it's worth it."*

That matters here because **"it would change every board and forfeit the
byte-match oracle" is a reason this table gives for several declines**, and it is
no longer a reason. Re-triaged, separating the verdicts that rested on the oracle
from the ones that stand on their own:

| Item | Still declined? |
|---|---|
| **bricks** — "Tricky may generate a Normal puzzle" | **No — reopened, and it is the strongest of these.** The decline called it "intended behaviour", which was true of upstream and is not a defence of shipping it: a player picks Tricky and gets Normal. Precedent exists in-repo — `spokes` spec, "grades its difficulty tiers honestly", which corrected exactly this shape *and kept the byte-match* by retaining upstream's original check for the differential alone. |
| **mathrax** — same shape, undocumented | **No — reopened.** Its generator "gates only at `maxdiff`… does not reject a puzzle that turns out solvable at a *lower* difficulty than requested". Same defect as bricks; the author never wrote it down. |
| **ascent, salad** — same shape, unverified | **Open question.** Neither generator shows a lower-tier rejection; a sweep should confirm before assuming. Boats, Rome, Seismic, Towers, Galaxies, Undead, Keen and Tracks all *do* grade honestly, so the gap is a minority, not the norm. |
| **salad (a)** — repeats-aware Latin cube | **No — reopened**, and now the largest of them. It was declined as "a `latin.ts` framework project… would change every Salad board and throw away the byte-match oracle". The second half is void; the first half is still a real size estimate. Its payoff is the author's own: stronger solver techniques, hence better Number Ball puzzles (his second complaint). |
| **clusters, sticks, subsets** — no difficulty tiers | **No — reopened.** Declined partly on "changes every board, forfeits the differential". What remains is honest scope: each needs new solver rungs. Subsets additionally has upstream's own disabled deduction (`// TODO repair this`) sitting there commented out. |
| **boats** — "solver cannot handle harder Battleships" | **No — reopened.** Declined on the weaker-solver rule, whose "changes every board" half is now void. What survives is the judgement call: is a stronger top tier a better game here? |
| **abcd** — diagonal-mode solver techniques | **Still declined**, but now on value rather than principle — a niche mode of one game. |
| **crossing** — more difficulty levels | **Reopened, low priority.** Crossing already gained the most from its port. |
| **seismic** — 10×10 (§3a) | **Unchanged.** The oracle was never the blocker; the fill is. But a CP/SAT feasibility check is now easier to justify, and §3a's reopening experiment is the same one. |
| **sokoban** (§3b), **spokes** (varied layouts) | **Unchanged** — declined by owner decision and as a stated wish respectively, neither on oracle grounds. |

**The technique that makes most of these cheaper than they look**: Spokes showed
you can diverge *and* keep the differential, by leaving upstream's original code
path reachable from the test alone. Reach for that before retiring a fixture set.

**Owner picked four to pursue, and scoping them found that two of the three
"add difficulty tiers" items are not the same size at all** — the phrase
"currently no difficulty settings" hides three different situations:

| Change | What the game actually has |
|---|---|
| `grade-difficulty-tiers-honestly` (bricks, mathrax, + survey) | The tiers exist and simply do not bind. Smallest, and Spokes' template applies directly. |
| `add-clusters-difficulty-tiers` | **Both deduction levels are already implemented** — `solverTry` and `solverRecurse` — and the generator just always gates at the deeper one. Nothing to invent; expose and grade. |
| `add-subsets-difficulty-tiers` | One deduction is sitting **commented out in upstream** (`// TODO repair this`). Repairing it *is* the second rung, so the repair and the tiers are one piece of work, in that order. Board size cannot carry difficulty here — 4×4 is the only bijection. |
| `add-sticks-difficulty-tiers` | Genuinely nothing in reserve: one technique, no second rung. Adding tiers means **inventing deductions**, so it opens with a gating spike and may legitimately end there. Sequenced after Clusters, which establishes the params/ID/differential pattern on the easy case. |
| `add-latin-repeats-support` (salad) | Framework work in `latin.ts`, gated on the whole Latin family's differentials staying green — the author's own request, and his second complaint is downstream of it. |

Boats' stronger top tier was offered and **not** taken; it stays declined, now on
preference rather than on the oracle.

## 4. What the sweep is worth knowing for

- **The two sources disagree about what matters, in both directions.** Crossing's
  `## Status` carried the request that most improved the game (cursor
  auto-advance) and the `.c` did not; Boats is the mirror image — its Status
  states a difficulty-curve preference that was rightly declined, while its `.c`
  quietly recorded the only live defect either source had (`Certain custom fleets
  don't fit in the UI`). Reading the more candid source alone is not enough.
- **"Declined" was the right answer far more often than "outstanding".** Of the
  ~30 points swept, three were live defects, two were promoted, two were declined
  only after a change had been drafted for them (§3a, §3b), and the rest were
  either already resolved by a port or are requests to make a solver stronger —
  which playbook §4 rule 3 refuses on principle, because a weaker solver *is* the
  difficulty curve upstream shipped.
- **A faithful port can fix an author's complaint without trying to.** Rome's
  loose corner pixels and Crossing's disabled `free_puzzle` both vanished because
  the idiomatic TS shape had no such failure mode. Neither was noticed at the
  time; both are worth recording, because the alternative reading — "the port
  reproduced it silently" — is the failure mode this audit exists to catch.
