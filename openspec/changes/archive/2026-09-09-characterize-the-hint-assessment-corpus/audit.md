# The hint assessment corpus — what it is, and what each member would test

Measured 2026-09-09. Every population here is **derived**, never listed: the
hinted set from `typeof game.hint === "function"` over the registry
(`engine/testing/hint-games.ts`), the shared-organ membership from a
comment-stripped scan of each game's own code
(`engine/testing/enrollment.ts`'s `membersNotMentioning`), and the shapes from
`explore-the-deduction-engine-reach`'s reading of all 30 off-engine solvers.

**Vacuity numbers.** 57 games offered by the registry, 57 read. 30 declare a
`hint()`; **27 do not**. 19 of the 27 hold a `solver.ts`; 8 do not. 26 hint
introductions were located in git and all 26 name their game in the commit
subject. Every figure below is reproducible from those keys.

---

## 1. The real list

### 1.1 The proposal's 19 survives — and that is the *less* interesting half

The proposal wrote its own health warning: *"That 19 is a grep heuristic and must
not be carried into this change as a finding."* Read against the registry rather
than against `ls`, the membership is nonetheless **exactly right**: 19 hintless
games hold a `solver.ts`, and they are the 19 it named.

```
abcd ascent bridges loopy magnets map mathrax mines mosaic net
pearl rect rome seismic separate signpost slide tents tracks
```

**What the grep got wrong is not who is in the set but what the set is made
of** — and that is the whole of task 1. `solver.ts` is a filename, not a shape.
Four of those nineteen hold no deduction ladder at all, and six of them are
already wired to the shared runner.

### 1.2 What the grep over-counted, with the reason

Per task 1.2, recorded rather than silently dropped. The proposal guessed *"map,
mines, net, signpost, slide at least"*. Reading the drivers, the over-count is
**four, and the guess was wrong about two of them in each direction**:

| Game | Proposal's guess | What its solver actually is |
| --- | --- | --- |
| `mines` | not a ladder | ✅ correct — probabilistic set-difference solver with a perturbation loop |
| `net` | not a ladder | ✅ correct — loop/connectivity analysis, no rungs |
| `slide` | not a ladder | ✅ correct — breadth-first movement planner |
| `rect` | *not flagged* | ❌ **also not a ladder** — recursive rectangle placement with backtracking |
| `map` | not a ladder | ❌ **is a ladder** (class A2): four-coloring deductions written inline |
| `signpost` | not a ladder | ❌ **is a ladder** (class C): a single chain-joining rung |

So the honest over-count is `mines`, `net`, `slide`, `rect` — **four, not five** —
and two games the proposal wrote off are deductive. The lesson is the one
`adopt-shared-deduction-fixpoint` recorded: a guess about a solver's shape,
written from its name and its game's reputation, is wrong about a third of the
time, and it errs in both directions.

### 1.3 The classification: 27 hintless games in seven classes

Shapes from `explore-the-deduction-engine-reach`; the on-engine memberships are
re-derived here because five of them have moved since that sweep.

| Class | n | Games | What a hint would be a projection of |
| --- | --- | --- | --- |
| **R — already on `runDeductionFixpoint`** | **6** | ascent, bridges, magnets, rome, seismic, tracks | a declared ladder with named rungs and a firing seam |
| **L — already on the Latin engine** | 1 | mathrax | `latinSolverTop`, which *already threads a `DeductionRecorder`* |
| **A2 — fits the runner, techniques inline** | 2 | map, separate | a ladder that must be split into functions first |
| **B — sweeps the whole ladder before restarting** | 3 | abcd, pearl, tents | a ladder whose *order* the hint must re-impose |
| **C — one or two rungs** | 2 | mosaic, signpost | a single rule; no ladder to project |
| **D — earned bespoke hatch** | 1 | loopy | a loop that breaks the runner's central promise |
| **E — not a deduction ladder** | 4 | mines, net, rect, slide | nothing; a hint here is a *planner* (the Inertia bar) |
| **∅ — no solver at all** | 8 | blackbox, cube, flip, guess, pegs, samegame, sokoban, twiddle | — |

**Six on the runner, not five.** The proposal and
`adopt-the-deduction-runner-where-it-rewires` both say *five* (tracks, rome,
seismic, ascent, bridges) because both counted from that adoption's own
population. **Magnets** was already on the runner before it, is hintless, and is
therefore a seventh member of the corpus that no document names. It is
also the only one of the six with **no ladder-equivalence test** — see §2.6.

### 1.4 The eight with no solver, briefly

They are in the corpus only in the sense that they are hintless. `cube`, `pegs`,
`samegame`, `sokoban` and `twiddle` are movement games with no solution to
project; `blackbox`, `flip` and `guess` have a `solve` that *reveals* rather than
deduces. A hint for any of them is the Inertia problem (find the one thing the
game can prove and lead with it), not the Palisade problem. **None of them tests
the framework's deduction contract**, which is what makes them the wrong picks
however cheap they look.

---

## 2. The characterization

### 2.1 The baseline: what a hint has cost, measured

Keyed on the commit that first added `<game>-hint.test.ts` — a uniform artifact
every hinting game carries, and the one key that survives the 2026-08-02
tree-wide move that makes `git log -S -- src/games/…` silently report the wrong
commit for every game.

**26 hint introductions located; 26 verified by their commit subject naming the
game.** Lines are **game production code only** (tests, snapshots and fixtures
excluded), and every figure is an **upper bound** — several commits bundle other
work, called out below.

| | game lines | engine lines |
| --- | --- | --- |
| **Median, all 26** | **~600** | 0 |
| **Median, the 23 deductive hints** | **~603** | 0 |
| Range | 247 (range) – 1,621 (boats) | 0 – 652 (netslide) |

**Engine lines added is 0 in twelve of the twenty-six, and every non-zero figure
is a named extraction** — `candidate-hint.ts`'s dialect (crossing +153, keen
+199, dominosa +263), the shared plan loop (boats +86), the slide planner
(netslide +652), Salad's two extractions (+200). The last four deductive hints
(bricks, spokes, sticks, galaxies) added **≤2 engine lines each**, and those two
lines were the `hint-games.ts` enrollment entry — which `derive-hint-enrollment`
has since deleted. **Today the figure is zero.** The shared surface a hint needs
stopped growing in early August.

Commits that bundle other work, so their figure is loose: unruly (*land port*),
filling (*finalize port*), dominosa (*stage-2 accept + reference panel*), towers
(*notes as first-class markings*), subsets (*two-way reference aid*), boats,
crossing, salad, netslide (*shared-surface extractions*), lightup (*tier rename*),
keen (*Latin hidden-single fix*).

### 2.2 The control, and the number the whole assessment turns on

**Galaxies is the one clean control in the collection**, and it is worth the
paragraph.

Galaxies is class **A1** — the exact shape the runner adoption targeted. It
received its explained hint on **2026-08-11**, four weeks *before*
`adopt-the-deduction-runner-where-it-rewires` wired it to
`runDeductionFixpoint` (2026-09-09). So its hint is a measurement of what an
A1-shaped hint costs **without** the runner, taken on a game that has since
acquired it:

| file | lines |
| --- | --- |
| `hint.ts` (new) | **+457** |
| `solver.ts` | **+387** / −29 |
| `render.ts` | +192 / −26 |
| `index.ts` | +102 / −1 |
| **game total** | **+1,138 / −56** |
| engine | +3 (two of them the enrollment line, since derived away) |

**`solver.ts` +387 is the number.** That is the *recording projection* — the
second walk over the same deductions that emits what fired and why. It is what
`adopt-the-deduction-runner-where-it-rewires` meant by *"the runner is what
carries the recorder"*, and it is the only part of the 1,138 that adoption could
plausibly shrink. `hint.ts`'s 457 is narration and plan mechanics, `render.ts`'s
192 is the overlay, `index.ts`'s 102 is wiring — the framework has never claimed
any of those.

**So the falsifiable form of the deduction end's last promise is:** an A1 game
hinted *after* adoption should not need a ~387-line second walk over its own
ladder. If it does, adoption bought the wiring guarantee (which is real — Undead
and Solo) and nothing else, and `docs/framework-rdd/` closes.

### 2.3 The thing that will decide it: the runner carries the *loop*, not the record

This is the finding that makes the corpus an instrument rather than a queue, and
it is a correction to a sentence three documents now repeat.

`runDeductionFixpoint` gives an adopting game: the ordered pass, the tier cap,
the restart-on-first-firing rule, the grade bookkeeping, a recorder-gated step
budget, and non-termination attribution by rung id. What it does **not** give is
a record of *what a firing did*. `DeductionTechnique.run` returns a `number`; the
runner's own doc comment says so plainly — *"the runner is oblivious to it"*.

All six adopted hintless games expose an `onFiring?: (id: string) => void` seam,
and it reports the rung's **id** only. That seam exists for
`ladder-equivalence.ts`'s firing census, not for a hint.

And the three most recent deductive hints did not thread a recorder through the
solver at all. They wrote a **parallel recorder** — a second implementation of
the same deductions — and said why:

- **Clusters**: *"separate code reusing this module's primitives, so the
  generator's `solveGame`/`clustersValidate` path above stays byte-identical by
  construction… Where the generator only needs *that* a coloring is refuted, the
  hint also needs *why*."*
- **Subsets**: *"Because `subsetsSolveGame`/`subsetsValidate` — the byte-match
  differential surface — never call any of this, the generator's desc is
  unaffected *by construction*; there is no recorder flag on the hot path."*
- **Undead** is the shape both cite.

**Two reasons are tangled there and only one of them survives AGENTS.md.** The
byte-match reason is the weaker one — *"Byte-parity was a tool, and the job it
existed for is over"*. The second is not: the generator needs only *that* a
deduction fires, while the hint needs *why*, at *which* cell, on *which* premise,
**and in a different order** — Clusters restarts its row-major scan after each
firing so that one deduction is one plan step, and takes the shortest forcing
chain rather than the first in scan order. That is a genuine design difference,
not bookkeeping.

**So the honest question this corpus asks is sharper than "is a hint cheaper
now?"** It is: *can a technique's `run` record what it did without the generator
path paying for it?* Filling is the only game in the tree that answers yes today
— it threads an optional `FillingRecorder`, built only on the hint path. Whether
that generalizes is exactly what writing one of these six hints will settle, and
it is the last unanswered question in `docs/framework-rdd/deduction.md`.

### 2.4 Per-game: what each would press on

The six on the runner, plus the three next-cheapest, plus the two that press
hardest on something else. Rung lists are the declared ladders; "certified"
means a `<game>-ladder.test.ts` firing census reaches the rung.

| Game | Rungs | Board model / substrate | Presses on | Exists to build on | Must be built |
| --- | --- | --- | --- | --- | --- |
| **tracks** | 8, 1 dead (`check-single`) | square grid, **edge bits packed into the square's own flag word** (`S_TRACK_SHIFT`/`S_NOTRACK_SHIFT`) | an **edge/vertex board** — the row-4 exemplar that withdrew the board-model declaration | ladder + census + frozen differential; `findMistakes` | recording projection; edge-marking overlay; narration for 7 rungs |
| **rome** | 7, 1 dead (`naked-pairs`) | square grid of **arrows**, dsf-backed region logic | a **candidate substrate that is not digits** (arrow directions), and dsf reasoning | ladder + census; `findMistakes` | recording projection; arrow narration vocabulary |
| **seismic** | 3 (`marks`, `areas`, `attempt`) | square grid + region dsf, digit candidates | the **one-ply trial rung** — is `attempt` a Tactic or a Search? | ladder + census; the candidate substrate is digit bitmasks, close to `candidate-hint.ts`'s | recording projection; trial-placement narration |
| **ascent** | 10, 0 dead | square grid, path of consecutive numbers, four modes with bespoke padding | **modes changing the geometry**, and a game that already diverged for honest tiers | ladder + full census; the tier-gate divergence is already made and its oracle kept | recording projection; path narration |
| **bridges** | 3 stages | **islands and bridges — a non-grid graph** | a board that is genuinely not `y*w+x` | ladder + census; `findMistakes` | recording projection; graph-overlay marks; three coarse stages may need splitting to narrate |
| **magnets** | 10 across 2 ladders | square grid of dominoes, +/−/neutral | **two runner call sites in one solver**, and tri-state cells | ladder declared | **no ladder-equivalence test** (§2.6); recording projection; narration |
| **mathrax** | 3 bespoke + the Latin rungs | **Latin square**, digit candidates | almost nothing — the family is done | `latinSolverTop`'s `DeductionRecorder`, `latin-hint.ts`'s narration, `candidate-hint.ts`'s plan | narration for 3 `usersolvers` only |
| **abcd** | class B (sweeps) | square grid, letter candidates | order re-imposition on a sweeping solver | `adaptiveMarkAll`; the candidate substrate | a ladder order the solver does not have; recording projection |
| **signpost** | 1 | square grid, arrow chains, dsf | nothing — one rung is not a ladder | dsf chains; `findMistakes` | everything, and there is little to say |
| **loopy** | bespoke hatch | **any of 18 planar tilings** via `engine/grid/` | the aperiodic tilings and the *only* unmet hatch obligation in the tree | `engine/grid/`; `border-grid.ts`-adjacent edge input | the hatch's narratability obligation, which is currently **vacuous rather than satisfied** |
| **slide** | class E (BFS) | square grid, movable blocks | the **planner** contract — recompute stability, monotone potential | `slide-planner.ts`; Inertia and Netslide as exemplars | a stable subgoal; and it joins `SEARCH_PLANNING_GAMES`, whose two members are **43% of suite time** |

### 2.5 Task 2.3 — do their generators already accept only explainable boards?

**Yes, for all six on the runner, and this is the corpus's best property.** Each
generates against its own solver at the target tier and rejects a board the
declared ladder cannot finish — `tracksSolve(scratch, diff)`,
`romeSolve(board, diff)`, `solveGame(board, diff)` (seismic),
`ascentSolve(grid, params.diff, sc)`, `solveFromScratch(st, p.difficulty)`
(bridges), `check_difficulty`'s port (magnets). Five of the six also reject a
board an easier tier would solve, so the tier binds.

All six also reject a board that is *too easy*, by one of two mechanisms: Rome,
Seismic, Ascent and Bridges re-solve at `diff - 1` and reject on success, while
Tracks and Magnets read the runner's own grade (`maxDiff < diff`) and reject on
that. Same guarantee, two spellings — worth knowing before assuming a shared
one exists.

**So the narratable-deduction policy does not have to run first, and no board
moves.** A hint author on any of the six inherits a generator that has already
guaranteed the ladder explains every published board. That is the single largest
reason these six are the corpus rather than a backlog.

Two footnotes:

- **Ascent has already made the Spokes-shaped divergence.** Upstream has no
  difficulty gate at all — measured, *7 of 22* frozen C boards above Easy fall to
  a lower tier, and 56 of 180 freshly generated ones — so `newAscentDesc` rejects
  them and generates another, while an option keeps upstream's ungated path for
  the differential. The oracle was kept *and* the boards improved; it is the
  shape `AGENTS.md` § "Assuming you must choose" points at.
- **Two rungs can never appear in a hint.** Tracks' `check-single` fired zero
  times across 324 solves, and Rome's `naked-pairs` zero across 2,896 calls
  *during generation*. Both were checked against the C and found reproduced line
  for line, so neither is a port defect. A hint author narrates 7 rungs of Tracks
  and 6 of Rome, and should not spend a sentence on the other two.

### 2.6 One live shortfall, found while characterizing

**Magnets is on the shared runner with no ladder-equivalence test.** It was
adopted before `engine/testing/ladder-equivalence.ts` existed, so its ten rungs
across two call sites have **no firing census** — nobody knows which of them the
generator ever reaches. That is precisely the blind spot the harness was built
for: Tracks proved that deleting a whole rung can leave all 39 of a game's tests
green, because a byte-match corpus certifies only the rungs it fires.

This is not speculation and does not need an investigation to confirm — the file
is absent and the seam (`onFiring`) that the harness needs is absent with it.
**Filed as `certify-the-magnets-ladder`** rather than reported here, per
`AGENTS.md`: *if it is not worth a commit, it was not worth reporting as a
finding.*

---

## 3. The recommended assessment order

A corpus entry that cannot fail anything is not an assessment, so each pick names
what it would falsify.

### First — **Tracks**

*Already named by `explore-the-deduction-engine-reach`, and characterizing the
corpus does not move it.* It is the most exact transcription of the runner's
shape in the collection, its ladder is certified with a firing census, its
generator gates on that ladder, and its differential proves the adoption changed
nothing.

**What it falsifies.** The deduction end's whole remaining claim. Galaxies —
same class, hint written pre-adoption — needed **+387 lines in `solver.ts`** for
its recording projection. If Tracks needs a comparable second walk, then
`runDeductionFixpoint` bought the wiring guarantee and nothing else, the phrase
*"the runner carries the recorder"* is wrong in three documents, and
`docs/framework-rdd/deduction.md` closes on its own arithmetic the way
`presentation.md` did.

**What it presses on beyond that.** An edge board represented in the least
framework-friendly way in the collection — edge bits packed into the square's own
flag word. Note this is *not* predicted to be hard: `hint-mark.ts`'s bands
(`MARK_TOP | MARK_LEFT | …`) are cell-*border* marks by construction, and
Palisade already marks an edge by banding both cells that share it. Tracks
should therefore inherit its overlay. If it does not, the shared mark vocabulary
is narrower than 24 games' use of it suggests, and that is worth finding out on
the cheap game rather than the expensive one.

### Second — **Bridges**

**What it falsifies.** That the shared hint *marks* are as general as their
adoption suggests. **24 of the 30 hinting games use `hint-mark.ts`**, and every
one of its marks is a band on a **cell's border box**; `hint-ordinal.ts` draws
its chain number "inside one tile" so it can ride the existing `OverlaySidecar`
diff. Both are therefore cell-shaped by construction. An island in Bridges sits
at a grid coordinate and can be banded — but **a bridge spans several cells and
is not any cell's border**, so the deduction Bridges most needs to point at is
the one thing the shared vocabulary cannot express. Either it generalizes, or a
mark helper 24 games depend on is a square-grid convention wearing framework
clothes, and the honest place to say so is `docs/games/hints.md`.

**Second reason to take it early.** Its ladder is **three coarse stages**
(`stage1-arithmetic`, `stage2-counting`, `stage3-connectivity`), not fine rungs.
One firing = one journey is the Palisade bar; a stage that forces twenty bridges
is not one journey. So Bridges also tests whether the *granularity* the runner
rewards is the granularity a hint needs — and if the answer is "split the
stages", that is a real finding about the technique contract, discovered on a
game rather than in a document.

### Third — **Seismic**, and only if the first two disagree

**What it falsifies.** The Check/Tactic/Search line. Seismic's `attempt` rung
tentatively places a candidate, rolls back, and strikes it if a region starves.
Read as a bounded one-ply chain it is a **Tactic** and narrates directly (*"put a
3 here and this region can no longer house its 4"*); read as a search it is not
narratable and Seismic's Hard tier cannot be hinted honestly. The collection has
answered this per game and never in general. Seismic is the cheapest place to
settle it — three rungs, a certified census, and a generator that gates.

**Deliberately not picked, with reasons:**

- **Mathrax** is the cheapest hint in the corpus and therefore the *worst*
  assessment. It is already on `latinSolverTop`, which already threads a
  `DeductionRecorder`, and `latin-hint.ts` already narrates the generic rungs;
  only its three `usersolvers` need words. It would measure the Latin family,
  which has been measured six times. It is the right pick for *value*, and it
  should be written — just not as the instrument.
- **Loopy** is the most interesting and the wrong shape for a first measurement.
  It is the tree's one **unmet hatch obligation** (its narratability promise is
  vacuous, not satisfied), it spans eighteen tilings, and its no-go reason is the
  runner's central promise. A hint there tests the *hatch*, not the contract, and
  it should follow the three above rather than precede them.
- **Slide** is the planner arm's obvious next member and carries a known cost
  trap: it would join `SEARCH_PLANNING_GAMES`, whose two current members are
  **43% of the whole suite's runtime**. Take it only with a stated bound on the
  walk, per `AGENTS.md` § "A test earns its runtime".
- **The eight with no solver** test nothing about the deduction contract, however
  cheap they look.

### 3.2 The handoff

The top pick goes to a change that **writes Tracks' hint against today's
machinery** — no contract chosen in advance, per the standing note that the
`find`/`apply`/`narrate` split is still fiction and owes an answer to *what it
buys beyond the hint walk*. The evidence is what it costs, compared against
§2.2's Galaxies control, and reported in the same terms: **game production lines,
of which how many are the recording projection.**

Filed as `add-tracks-hint`.
