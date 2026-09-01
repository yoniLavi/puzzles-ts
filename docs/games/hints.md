# Hints

**How to give a game a full explained hint.** Every game is expected to carry
a `hint()` — explained hints are a **core deliberate-divergence product
value** of this fork, not a nicety — but coverage is not yet complete: the
games still lacking one are exactly the registered games absent from
[`engine/testing/hint-games.ts`](../../src/engine/testing/hint-games.ts)
(12 as of 2026-08-11, Galaxies having landed; each is a queued
`add-<game>-hint` change waiting to be opened). Upstream's `'h'` returns one next move with
no explanation; that is below the bar. Adding a hint to a game is its **own
openspec change** (`add-<game>-hint`), acceptance-gated like a port.

Authoritative spec: the Hint System requirements in
[`ts-engine`](../../openspec/specs/ts-engine/spec.md). Quality bar:
[`palisade`](../../openspec/specs/palisade/spec.md) + the "Hint quality bar
(exemplar: Palisade)" section of [`AGENTS.md`](../../AGENTS.md). **Exemplars to
read:** Palisade (grouped multi-leg deductions),
[`src/games/range/`](../../src/games/range/) (`solver.ts` recording →
`index.ts` `hint`/`hintKeepTrack` → `render.ts` highlight),
[`src/games/towers/`](../../src/games/towers/) (candidate-elimination), and
[`src/games/inertia/`](../../src/games/inertia/) (the **non-deductive**
exemplar: verified-claim narration, a stable marked subgoal, a
recompute-stable plan).

This is one of the [`docs/games/`](./README.md) guides. Related files:
[`solver-and-generator.md`](./solver-and-generator.md) (the deduction engine
the hint is a projection of, and the guess-free generation policy),
[`rendering.md`](./rendering.md) (the cache/overlay machinery hint highlights
ride on), [`testing.md`](./testing.md) (the test tiers). **Update this file
whenever you work on a hint** and hit something it didn't tell you — that edit
is part of "done", in the same change.

## The quality bar

The full statement is in [`AGENTS.md`](../../AGENTS.md); the bar a `hint()`
must clear:

1. **Explain *why* the move is forced, not just *what* to do.** Narrate the
   actual deduction ("both edges border the same region, so they share a fate;
   walling both exceeds clue 2 — so neither is a wall"). If a narration's
   conclusion doesn't follow from its own stated premises, the deductive
   coupling is missing — surface it. A good hint *teaches the technique*.
2. **One deduction firing = one journey.** A single deduction that forces
   several moves is emitted as one multi-leg `HintStep` journey (continuation
   legs flagged `continuesPrevious`), so it reads and auto-plays as one
   coherent hint, not N disjoint ones.
3. **Equivalent moves share a colour.** Moves that share a fate render
   identically (Palisade: all `COL_HINT`); a distinct colour reads as
   "different roles" and misleads.
4. **Pace auto-hint uniformly.** `AUTO_HINT_STEP_MS` (1s) per step in
   [`src/puzzle/puzzle.ts`](../../src/puzzle/puzzle.ts), floored by the move's
   own animation so animated moves still play out fully.
5. **One deductive step per hint; externalize the rest onto the board.** A
   hint must land *at a glance* — at most one inferential step's worth of
   reasoning. Multi-step reasoning (including single-level forcing) is spread
   across **gradual board marks** — one mark per step, the accumulated marks
   carrying the state — never crammed into one dense sentence. See
   § "Cognitive load: one step per hint".

## Guess-free generation is the precondition

An explained hint can exist only if the board is **solvable by pure
deduction** — a hint that falls back on the known solution or a backtracking
search isn't teaching a *why*, it's revealing the answer. That is a
**generation policy**, not merely a hint policy, and it lives with the
generator: see [`solver-and-generator.md`](./solver-and-generator.md)
§ "Guess-free generation" for the policy (every non-`Unreasonable` tier is
pure deduction; the deduction/recursion line; the no-"just because"-fallback
bar and the two compliant ways to meet it; the one-narratable-engine shape
over `runDeductionFixpoint`). Movement/objective games (Fifteen, Sixteen,
Flood, Untangle) are out of the policy's scope and hint
heuristically/imperatively — § "Non-deductive (heuristic) hints".

## Cognitive load: one step per hint

Owner principle (2026-06-26): **every hint a non-`Unreasonable` tier shows
must be understandable at a glance — at most one inferential step of
reasoning.** A hint the player has to *work through* (holding a chain of "…and
therefore… and therefore…") has failed, even when it's correct. The product
value is a hint that lands immediately, not a proof to parse.

The corollary is the mechanism: **when a deduction's justification spans more
than one inferential step, externalize the chain as gradual marking on the
board — one mark per step — instead of cramming it into one dense sentence.**
The board's accumulated marks (pencil notes, for candidate-elimination games)
carry the state, so the player never holds the chain in their head; each
individual hint then narrates a single, self-evident step. This is exactly the
candidate-elimination pattern (populate → strike one candidate with a one-line
reason → … → place a naked single): each strike is one step, the marks are the
externalised memory.

### The forcing boundary

Read this before hinting a hard tier. *Single-level forcing* — "suppose X
here; propagate; it hits a contradiction; so not X" — is sound deduction, but
it is **not** one glance-able step. Arc-consistency and counting already catch
every *direct*, single-constraint contradiction, so a contradiction that
*survives* to the forcing rung necessarily comes from **combining several
constraints** (the hypothesis forces another cell, which then breaks a
clue/count elsewhere). A forcing deduction is therefore intrinsically a short
chain — measured, never fewer than **three** implication links, because a one-
or two-link chain *is* a naked pair and set elimination has already eaten it.

Two compliant options, one non-option:

- **Externalize it as a guided "what-if" walk** — tentative marks the player
  watches accumulate ("suppose vampire here → then this cell must be a ghost →
  now the left clue of 2 can't be met → so cross vampire out here"), each leg
  one glance-able step, only the final strike real. Buildable on the existing
  multi-leg journey (`continuesPrevious`) + pencil-strike machinery, but it
  introduces *tentative* (hypothetical) marks — a visual state distinct from
  real notes.
- **Keep the shipped tiers direct-only** — arc-consistency + counting (or
  positional + set for Latin), and don't ship forcing-tier boards at a
  non-`Unreasonable` difficulty. Simpler hints; a less-hard top tier.
- **Not allowed:** compress the forcing chain into a single "if X then
  contradiction" sentence and call it one step. It reads as a glance-able hint
  but isn't one — it asks the player to run the propagation in their head.
  (Existing forcing/`Extreme`-tier hints in the Latin family should be
  reviewed against this when next touched.)

**Which of the three applies is decided by
[`solver-and-generator.md`](./solver-and-generator.md) § "Check, Tactic,
Search"** (owner, 2026-08-12, `audit-guessing-tier-names` design D9), and the
split is *bounded-and-walkable*, not *was a trial involved*:

- a **Check** — one placement, one validator call, no fixpoint (Sticks'
  `sticksTry`, Bricks' and Clusters' single-cell rungs) — is ordinary deduction
  and narrates directly, at any tier;
- a **Tactic** — a bounded chain, measured 3–12 links in the Latin family and
  2–3 forced cells in Clusters — keeps its middle tier and **is walked**;
- a **Search** — the hypothesis runs a whole *unbounded* fixpoint or sub-solve
  (Undead's `forcingPass`, Bricks' `solverRecurse`, Dominosa's chain closure,
  Spokes' top-tier look-ahead, Galaxies' deleted rung) — is `Unreasonable` and is
  **not narrated at all**. The hint refuses and says deduction has run out.

**A game can ship a Tactic and a Search that are the same function** — Spokes
calls one look-ahead with a capped sub-solve at Tricky and an uncapped one above
it — in which case they narrate identically and no wording check can separate
them. Prove the hint reaches only the permitted one *structurally*: Spokes
asserts that a plan computed at the top tier equals one computed at Tricky, plus
a control showing Tricky does add firings the tier below lacks, so the equality
cannot pass vacuously. See `solver-and-generator.md` § "Check, Tactic, Search".

**The walk is the bar, and it is not a cross-game engine build.** This section
used to call it "the full answer" while offering a *stopgap* — state the
classified contradiction and anchor it to the board — on the grounds that
tentative marks needed new engine machinery. Clusters disproved that: it renders
every forced cell of its hypothetical from per-game overlay bits, no engine
change involved. The stopgap is retired as a *destination*; where a game has not
been walked yet, that is a debt with a name (`walk-tactic-hint-chains`), tracked
by the shrink-only `PENDING_WALK` list in
[`engine/hint-quality.test.ts`](../../src/engine/hint-quality.test.ts) — which
holds each game's **exact interim sentence**, so the guard stays live on
everything else that game says.

**One correction to a measurement this section used to lean on.** It cited
Undead's forcing narration — 130 chars, fires rarely — as evidence that a short
compressed sentence can stay a single step. Length was the wrong axis: that rung
runs the arc + counting **fixpoint** from its hypothesis, so it is a Search, and
brevity cannot redeem it. It is gone, and Undead's top tier is `Unreasonable`.
Measure the *shape of the call*, not the length of the sentence.

## Writing the narration

The narration *is* the product value, so most of this guide's hard-won lessons
are about prose. The arc every nontrivial hint follows:

> **indication** (the spotted pattern, named in board terms and generalisable)
> → **reasoning** (why that pattern forces the move) → **conclusion** (the
> action, in the necessity voice).

### Necessity for deductions, imperative for moves

A hint exists to tell the player **the next action to take**, so the clause
that states the conclusion (the "so …" tail) must read as a decision, not a
description. The collection has **two houses**, chosen by whether the move is
*logically forced* (owner-decided 2026-06-19):

- **Deductive games** (the move is *forced* by the rules): state the
  conclusion with a **modal of necessity** — `must be` / `can only be` /
  `can't be` / `must stay` / `must cross out`. **Never** a static
  state-of-being verb (`is` / `are` / `stays` / `it's`): "so it **stays**
  white" describes a continuing state instead of a forced decision and reads
  as flat — rewrite to "so it **must be** white". The necessity is the
  *teaching*. Keep the modal in the **conclusion clause only** — *premise*
  clauses still state facts plainly ("One of these matching neighbours
  **stays** white …, so every other copy **must be** shaded").
- **Movement / objective games** (Fifteen, Sixteen, Flood — the suggested move
  is *not* a logical necessity, just the recommended next action): use the
  **imperative** ("slide it into place", "move it to column 5", "fill with
  red"). A necessity modal would be wrong. Untangle's heuristic hint carries
  an empty explanation and is exempt entirely.

Pick the house by the *nature of the move*, not the genre: a deductive game
whose hint ever recommends a non-forced move uses the imperative for that
step. Palisade shows the houses can co-exist in one string — its necessity
premise ("Clue c reaches its count only if every remaining edge is a wall")
can carry an imperative tail ("draw them all"), because the forced-ness is
already explicit in the premise.

**Guarded cross-game** (`src/engine/hint-quality.test.ts`): every deductive
game's steps must match the shared necessity vocabulary; mechanical
populate/cleanup openers are recognised, and an owner-endorsed phrasing that
carries necessity in its own words (Filling's "fits exactly into") is a
*declared idiom* in that file — add to the idiom table deliberately, never by
loosening the shared pattern. Game-specific phrasing rules (the exact modal
for a strike vs a placement) stay per-game tests.

### Lead with the indication

**Every nontrivial hint SHALL open by naming the *indication* — the
recognisable board pattern that triggered the deduction — before any
reasoning** (owner-directed, 2026-06-19). The player should come away able to
*spot this pattern themselves next time*, not merely convinced that this one
instance is valid.

A hint is **pedagogy, not a terse textbook proof**. A proof that jumps
straight to "shading either of these would force a contradiction, so both are
white" leaves understanding *as an exercise to the reader*. Good teaching
states **what you noticed** first, phrased as a pattern the player can learn
to recognise ("there's a pair of 5s in one column and a pair of 1s in the
next"), not buried mid-sentence or left implicit in the highlight.

Worked example — Singles `offset`. Even value-aware it still *opened on the
conclusion* (*"Shading either of these two squares would force…"*): a valid
proof, but the player never learns **what to look for**. Leading with the
indication fixes it: *"There's a pair of 5s in one column and a pair of 1s in
the next, lined up so that shading either of these two squares would force one
of the 5s and one of the 1s to be shaded next to each other — and shaded
squares can't touch. So both must be white."* Now the first clause is a
teachable recognition cue. (Read the orientation off `reason.quad` so
"column"/"row" is concrete; `singles-hint.test.ts` "offset" asserts it opens
`/^There's a pair of \d+s in one (column|row)/`.)

What counts as "nontrivial": anything past a single local rule application.
The simplest cascade hints satisfy this for free because their *signal is the
move* — Singles `adjBlack` opens *"These squares touch a shaded square…"*. The
ones that need care are the multi-element deductions (offset, the corners, the
sandwich/pair pattern). When in doubt, lead with the indication; it is never
wrong to.

### Two marks on the board, one "this cell" — tie them, and never by colour

**If a step marks more than one element *of the same kind*, a bare "this cell"
points at neither** (owner-reported, 2026-08-14, on a Clusters frame showing a
solid target beside a ringed tile). The collection's mark convention is
consistent — `COL_HINT` is a
solid fill on the cell being decided, everything else is a ring or a wash — and
the narrations already name the *other* mark ("the **ringed** dot", "the
**shaded** squares", "the **highlighted** clue"). Only the target is left bare,
so the sentence is one word short and the player has to know the convention
before it parses. With **one** mark in view, "this cell" is right and a qualifier
is noise.

**The fix is never the colour.** *"the cell marked purple"* is the obvious
reading and the one thing ruled out: the palette is scheme-relative by
construction, so a hue named in prose is false under the other scheme, and it is
unreadable to a colour-blind player. If two marks differ *only* by hue, the marks
need fixing, not the sentence.

**A solid against a wash is not a hue-only pair** — it differs in *weight*, which
is what a reader who cannot compare hues is left with, and it is why Range and
Light Up may mark a cell against a cell and tie them in prose rather than
redrawing them. That exemption rests on numbers, so the numbers are asserted:
`palette.test.ts` § "keeps the three hint emphases distinct, in both schemes"
holds every hint pair above an OKLCH distance of 0.12 **in each scheme** and
`HINT_ACTION` above twice the chroma of either wash. It was measuring the light
column only until `disambiguate-hint-deixis`; the tightest pair of the six turns
out to be `HINT_FILL`/`HINT_EVIDENCE` in **dark**, at 0.124.

Tie them by something the code guarantees, cheapest first:

- **A relation.** Clusters' `contradictionAround` only ever reports the placed
  cell or one of its four orthogonal neighbours, so *"its ringed red
  **neighbour**"* identifies both squares at once and is shorter than what it
  replaced. Bricks already had the shape in one branch — *"The shaded brick
  **above** rests only on this cell"*. **Check the relation holds in code first:**
  Clusters' chain branch could *not* use it, because that break is adjacent to
  the last forced cell rather than to the target, so it ties on the chain's
  origin instead (*"forced **from it**"*). That tie survived
  `walk-tactic-hint-chains` numbering the chain: ordinals say which consequence
  fell when, which is a different question from which of three marks "this
  cell" means, so numbering the marks does not retire the deixis tie.
- **A value**, where the puzzle has one — see the next section.
- **A role word tied to the mark's shape**, where the game's other marks already
  use distinct ones ("ringed" outline vs "shaded" wash).
- **A number on the other marks.** Where the second mark is a *chain* the hint
  numbers (`walk-tactic-hint-chains`), the sentence names those cells by their
  ordinal and keeps "this cell" for the one that carries no number — so the
  reader picks the target out by the absence of a label, not by a hue. It is the
  strongest tie of the four when it is available, because it identifies *every*
  mark on screen rather than just relating two of them. Note what makes it work,
  since it is the general rule underneath all of these: **a numbered mark and an
  unnumbered one are not the same kind of thing.** The six Latin forcing chains
  rely on this and carry no other tie.

Guard it per game — *a second mark displayed ⇒ the explanation contains the tie*
— and prove the guard fails before trusting it. Exemplars: `clusters-hint`,
`bricks-hint`, `range-hint`, `lightup-hint`. Give the guard the vacuity pair the
bar now expects: a `checked` floor **and** the set of reason kinds the sweep must
have reached, since a guard that only ever saw the one already-tied branch
measures nothing.

**Ask first whether the two marks are the same kind of thing** — that is what
decides whether there is a defect at all, and it is cheap to answer. Palisade
marks an *edge* against *regions*, Spokes a *spoke* against *hubs*, Sticks a
*square* against a *clue*: in each the noun in "this edge" / "this line" / "this
square" already picks the target out, and a qualifier would be noise. Every
genuine case found by `disambiguate-hint-deixis` marked a **cell against another
cell**.

**Check the relation before you assert it, by measuring.** Every worked example
above came out of a sweep, and each sweep changed the sentence that was about to
be written: Bricks' three-in-a-row runs are 3, 4 *and* 5 long, so *"the two
ringed bricks"* would have been false; its gravity supports number 1 or 2, so the
sentence needs a singular arm; Lightup's driving clue is adjacent to its target
in **0 of 133** firings, so no positional tie exists there at all. The same
measurement found two defects that were not deixis: Lightup's discount sentence
never stated the premise its conclusion needs, and attributed the whole candidate
set to "the shaded squares" when the *ringed* square is a member of it in over
half of all firings.

**A grep only finds sentences that mention the second mark.** One that is bare
while a mark is displayed-but-unmentioned is the same defect and invisible to it.
`scripts/checks/hint-deixis.test.ts` (advisory, `npm run diff`, writes
`metrics/hint-deixis.md`) reads the frame instead — every hinting game, every
tier, mark roles counted, explanations tested for a bare deictic. **It is a
report, not a gate, and deliberately so**: it flags ~230 sentence shapes in 20
games of which the review found one genuine, because a lexical filter cannot see
a tie made by value, by line context, by a continuation leg's antecedent, or by
the marks being different kinds. Read it periodically; do not turn it into a
gate.

### Name a square by its value

**In a number puzzle the square's value is its name and its locator, so use
it** (owner-directed, 2026-06-20) — never a bare pronoun. Two failure modes,
the second subtler:

1. A hint must not *open* on a dangling *"It"* / *"They"* / *"This is…"* with
   no noun. Singles `sameLine` opened *"It shares a line with the ringed white
   square…"*: the *"It"* has no antecedent (the banner is the player's first
   sight of this sentence), so the reader must hunt the highlight before the
   sentence parses.
2. The fix is **not** *"This square shares a line…"* either — still generic.
   Name the value: *"This 3 shares a line with the ringed white 3, which
   already uses that number — so this copy must be shaded."* Now both squares
   are identified by sight, and the duplicate the deduction turns on is
   *visible in the wording*. The reference is free — the deduction already
   knows its target cell(s), so read the digit off the state
   (`numAt(targets[0])`).

**Pronouns are allowed only to avoid restating the *same* value when the
referent is obvious** — *"This 3 … so it must be shaded"* is fine. When one
firing forces **several squares of differing values**, list them (`joinNums` →
*"These squares — 3, 5 and 2 — touch a shaded square…"*); when they **share**
a value, name it once and pluralise (*"These 3s share a line…"*). For a square
that is *empty* when acted on there is no value to name — anchor it on a
concrete neighbour (*"The shaded region of N has only this one empty square to
grow into"*). Exemplar: every branch of `narrate` in
[`singles/index.ts`](../../src/games/singles/index.ts) names a value.

The same lesson, learned the hard way on the multi-link deductions:

- **Concrete values beat role words on a subtle deduction.** Distinct colours
  alone weren't enough for Singles' corner case — even ambered and shaded, the
  owner couldn't follow *"shading this square would seal off the highlighted
  corner…"*. What unblocked it was making the narration **value-aware** (read
  the numbers off the board in `narrate(reason, targets, state)`) and ordering
  it as the **proof-by-contradiction arc the deduction is**: *the signal that
  fired it → the move we're ruling out → the consequence → the deduction*.
  Result: *"A touching pair of 3s sits at the corner; one of them must be
  shaded. Shading this 5 would then force the 3 beside the corner 4 shaded as
  well, leaving the corner boxed in on both sides — so the 5 must stay
  white."* Watch dangling pronouns mid-sentence too: an early cut ended
  "…shaded as well, **trapping it**" — "it" read as the 3, not the corner;
  name the referent ("leaving **the corner** boxed in").
- **Sweep abstract pronouns out of the easy cases too.** Singles' `offset`
  once read *"Whichever paired square stays white forces the one across from
  it shaded, so both squares beside it must be white."* — grammatical, but a
  wall of deixis with not one concrete reference. Heuristic: a narration with
  *zero* digits/coordinates and three or more "this/that/it/the one" pronouns
  is almost certainly improvable.
- **Concrete *value* and concrete *geometry* are different bars — a
  value-aware narration can still lie about the layout.** A first cut of the
  offset fix said *"Two 6s and two 4s **overlap, offset by a square**…"* —
  concrete values, but geometrically **false**: `solveOffsetpair` pairs equal
  numbers *anywhere along a line*. **Describe only what's invariant** (the
  forced adjacency) and delete words that assume a tight figure ("overlap",
  "between them", "side by side"); lean on the highlight for *where*. When you
  add concrete values, re-check every spatial word against the *general*
  firing — read the solver's loop bounds, don't assume locality.

Two drafting gotchas from interpolating values: (a) **dodge the a/an trap** —
`a ${n}` becomes "a 8"; write articleless ("one of the 6s", "two of the Ns")
or branch on the digit. (b) **guard the equal-value branch** — when two groups
coincide (`n === m`), "Two 4s and two 4s …" reads broken; special-case it
("two of the 4s").

### The premise must single out the conclusion

**A narration whose stated premise doesn't discriminate *this* move from
another is a bug, even when the move is right.** Caught on Singles' all-equal
2×2 corner (`corner4`): its first cut read "the only non-touching pair that
leaves one white per line is this diagonal" — but *both* diagonals of an
all-equal 2×2 leave one white per line, so the premise doesn't justify shading
*this* diagonal. The real reason is connectivity (at a grid corner the corner
cell's only neighbours are its two sides, so shading the other diagonal
strands it). When two candidate moves both satisfy the stated premise, you're
describing the wrong reason — find the premise that actually discriminates and
say *that*. Cheap guard: assert the discriminating phrase present and the
false one absent (`singles-hint.test.ts` "corner4" checks
`not.toContain("one white per line")`).

**One technique can be forced several different ways — carry *which*, don't
pick a favourite (Crossing).** A "only one candidate is left" rung looks like
it needs one sentence, but the candidates can die of unrelated causes, and
naming the wrong one is this same bug. Crossing's whole-run placement fires
when exactly one listed number still fits a run, and the others can be out
because they are *the wrong length*, because they are *already written in
elsewhere*, or because they *contradict a digit already in the run*. The first
cut said "only one N-digit number left matches what is already in this run"
for all three — which on a **fresh board** (the opener the player sees first,
and the commonest firing) cites digits that do not exist: vacuous as a premise
and visibly false as a sentence. The fix is a `because` field on the firing,
set where the elimination is actually computed, and one sentence per cause —
the opener became *"This run is 6 squares long, and only one number in the
list is 6 digits — so it must be 197665."*, which the player can verify by
counting. Two habits: **compute the reason at the point of elimination, not at
narration time** (only the finder knows why the others died), and
**sanity-read the fresh-board firing specifically** — the degenerate-extremes
check applies to *the board*, not only to interpolated values. Guard: assert
each cause's phrasing *and* that the ones with nothing entered never say
"already in this run" (`crossing-hint.test.ts`).

### Keep the narration terse

Explaining *why* is the bar, but say it in one sentence, not three
(owner-directed). Filling's first cut spelled out the full deduction
("…without exceeding N cells — every other neighbour would overshoot. So it
must extend here: a N.") and read as a wall of text; the owner trimmed it to
*"The shaded region of N has only this one empty square to grow into."* —
same logical content, a third the length. Lean on the picture (the shaded area
carries the premise) and on implied values ("the region of N" already tells
the player to write N). **Don't repeat the number.** When a narration feels
long, cut to the single premise the highlight doesn't already show.

**Guarded cross-game** (`hint-quality.test.ts`): a hard 300-character ceiling
per step (longest shipped: 281, Undead's sightline teach). The ceiling catches
the "rulebook bled into the step" class; terseness *below* it is still an
editing judgement.

### Conclude with the action the move makes

The conclusion clause must match the move's *type* (sharpened on Towers,
owner-flagged 2026-06-22):

- **An elimination step says only which candidates are *ruled out* and why** —
  conclude with the strike action naming the value (*"…so we must cross out
  the ${n}."*), not the abstract *"…so it can't go here"* repeated across
  every technique. A **placement** step keeps the positive necessity voice
  (*"it can only be ${n}"*). The struck height is free to interpolate — the
  step already knows its marks (`marks[0].n`). Exemplar: `narrate` in
  [`towers/index.ts`](../../src/games/towers/index.ts).
- **Never imply a placement the rule doesn't establish.** Towers' line-full
  rule strikes the *shortest* heights from the cell nearest the clue — but a
  first cut said the cell *"must hold the tallest remaining one"*, which reads
  as a forced placement. It isn't. If a narration claims a unique value, the
  step must actually *place* it. Cross-check: does the conclusion match the
  move type (`pencilStrike` ⇒ "rule out", `set` ⇒ "must be")?

### Sanity-read at the degenerate extremes

A phrase tuned for the typical case can read as nonsense at a boundary value
(owner-flagged 2026-06-22). Towers' lower-bound text said *"clue ${c} can see
only ${c} towers"* — fine for a small clue, self-contradictory when `c` equals
the grid width (the clue then sees *all* towers, so "only" is wrong); its
line-full text described *"an increasing run one tower short of its count"* —
a run of *zero* at `c = 1`. Phrase counts so they hold across the whole range
(*"sees exactly ${c}"*, *"all but one of its towers deeper in the line"*).
**When a narration interpolates a clue/count, re-read it at the min and max
that value can take.** (And re-read the *fresh-board* firing — see
§ "The premise must single out the conclusion".)

### Name elements by what the player can see

A name is a claim, and "claim only what you have checked" applies to it
(owner-flagged 2026-07-14, Netslide). Netslide's hint called the immovable
tile *"the centre tile"* and its frozen lines *"the centre row / centre
column"* — but `cx` is `⌊w/2⌋`, so on a 4×4 board the tile is at row 3, column
3, and the player is looking straight at a square that is visibly **not** the
centre. Two fixes, both of which also came out *shorter*:

- **Name the element by what it does and how it's drawn.** Netslide's fixed
  tile became *"the source"* — the black box the power comes from — which the
  player can point at and which explains *why* the network grows around it.
  Rule of thumb: if the name would not survive a player checking it against
  the picture, it's the wrong name.
- **Name a line by its number, not its position.** *"Row 3 never slides"* is
  true at every board size, is shorter, and tells the player exactly which row
  to look at. Re-read a name at the degenerate size (even vs odd, `w = 1`),
  not just a value at its extremes.

If the hint introduces a word (*source*), the **help text must teach it** —
check `help/games/<game>.md`. Netslide's said "the middle square" (so the
vocabulary didn't even match) and never stated the rule the whole game turns
on. A hint and a help page that disagree are worse than either alone.

### Rules belong in the help

The premise on a step must be what makes *this move* follow. A fact that is
true of the whole board, every step, forever, is a **rule**, and repeating it
is noise the player learns to skip (owner-flagged 2026-07-14). Netslide opened
12% of its steps with

> The centre tile can never move, so the network has to be built around it —
> and this corner belongs right beside it: take it to row 2 (setting up).

The preamble is a rule the board *already shows*, and the move does not follow
from it. It became simply *"This corner belongs beside the source: take it to
row 2 (setting up)."* — 69 characters, down from 146 — while the genuinely
move-specific deduction kept its premise, because there it does work: *"Row 3
never slides, so only a column move can shift this corner."* That one **is**
the technique; the other was the rulebook.

**Diagnose before you rewrite: measure length × frequency, not frequency
alone.** A throwaway that plans N fresh boards and tallies each narration
branch (count, share, mean length) is ~40 lines and tells you which sentence
actually dominates. Netslide's offender fired on only 12% of steps but ran
1.8× the mean length, so it wrapped to two lines and read as if it were on all
of them. Guard the result with a **max-length assertion** over a scan of
boards (`netslide-hint.test.ts` holds every sentence to ≤ 120 chars), so the
preamble cannot creep back.

### Hint the move that advances the goal

A solver makes *every* forced deduction; a hint should offer the ones that
move the player toward **solving the puzzle**, in an order that leads with
progress. A recording pass that faithfully replays the solver's rung order
inherits two smells (owner-flagged on Spokes):

- **Order goal-first.** The hint is free to reorder the solver's rungs (it
  only needs each firing to be *forced*, not to match the solver's internal
  order). Lead with the moves that build the answer — Spokes hints a forced
  **connection** (line) before any **rule-out** (mark). A plan that dribbles
  out marks before the connection they enable reads as busywork even when
  every step is correct.
- **Drop the useless-but-forced move.** A move can be genuinely forced yet
  advance nothing: Spokes' rule-out of the spoke between two
  *already-satisfied* hubs is real but pointless. Find the local "does this
  help?" predicate — for Spokes, *at least one endpoint hub still needs
  lines* — and skip firings that fail it. **Verify it's safe to skip:** a move
  worth suppressing must not be load-bearing for the solve (asserted in
  `spokes-hint.test.ts`). If suppressing a move *would* stall the plan, it
  wasn't useless; narrate it instead.

The distinction from cognitive load: that's about a single hint being too much
to *read*; this is about the *plan* offering moves not worth reading at all.

## Engine mechanics

The `Game` hooks and the `Midend` lifecycle are in
[`ts-engine`](../../openspec/specs/ts-engine/spec.md); the implementation is
[`src/engine/midend.ts`](../../src/engine/midend.ts). A game implements:

- **`hint(state, aux?, ui?): HintResult`** — return `{ ok: false, error }` to
  refuse (board solved, or has mistakes — a hint off a contradictory board
  misleads), else `{ ok: true, steps }`. Each `HintStep` carries `move`,
  `explanation` and `highlights` (game-specific render data). Compute the
  **whole remaining plan** once; the midend advances steps as the player
  follows or auto-play executes them. `aux` (the generator's solution, when
  present) enables the aux-walk (§ "Non-deductive (heuristic) hints"). The
  optional third `ui` arg lets a game read a relevant preference (Towers'
  auto-pencil) — the midend passes `this.ui`; games that don't need it ignore
  it.
- **`hintKeepTrack(move, step, state): "completed" | "onTrack" | "off"`** —
  `"completed"` when the player's move matches the step's intent (advance the
  plan), `"onTrack"` for partial progress on a multi-cell step, else `"off"`
  (drop the plan to recompute). **`hintKeepTrack` is handed the PRE-move
  state.** The midend classifies a move against the plan *before* applying it
  (`Midend.processInput`), so `state` is the board the move is about to
  change — a game that needs the *result* applies the move itself (Sixteen's
  slide does `executeMove(state, m)`). For a pencil toggle this means "the
  candidate is present now" ⇒ the toggle *clears* it (the right strike to
  follow); an *absent* candidate ⇒ the toggle would re-add it ⇒ off-plan.
  (Towers once had this inverted, testing post-move state the production path
  never passes — guard against a unit test that fabricates a timing the
  midend doesn't use.)
- **`continuesPrevious`** on a `HintStep` — the midend keeps a multi-leg
  journey displayed through its legs; only an unflagged next step waits to be
  asked for. The mechanism is generic; a game just emits grouped steps.
- **`refreshHintStep(step, state)`** — validate-at-display (§ "Stale plans
  and refreshHintStep").

### The shared plan loop: deduceHintPlan

Every recording pass ends up writing the same five lines, and five games
arrived at them independently before it was extracted. Use
[`deduceHintPlan`](../../src/engine/hint-plan.ts) rather than a sixth copy:
give it the (caller-cloned) working board, a `status`/`incomplete` pair, a
`next(board)` firing finder, an optional `apply`, and the two bounds. Only the
**loop** is shared: every rung order, reason type and narration string stays
in its game. Three things worth knowing before you wire it up:

- **Both bounds are parameters on purpose.** A plan-length cap (`planCap`) and
  a `StepBudget` answer different questions ("stop nagging" vs "this rule
  isn't advancing"), and collapsing them would silently retune the games that
  chose the other.
- **`status()` is called before `next()` every iteration, and that ordering
  can be load-bearing.** Subsets' validator refills the `counts` array its
  later rungs read, so the status call is not merely a check — don't
  "optimise" it away.
- **Omit `apply` when your rungs mutate as they detect.** Re-applying a firing
  that has already been applied is not merely redundant; for a rung that reads
  its own effect it is wrong.

Adopters: Spokes, Bricks, Clusters, Subsets, Boats. Each refactor was proved
behaviour-preserving by its existing hint tests passing **unedited** — if a
test has to change, the extraction changed behaviour; stop and re-evaluate
rather than updating it.

### Recording the deduction

**A solver that *wipes the board* cannot be replayed as-is (Boats).** A
recording solver written to run from empty is not automatically resumable;
Boats is the sharp end. `solveBoats` opens with `solverInitial`, which
**clears the grid** and re-derives it from the given clues — calling it for a
hint would throw away everything the player has placed. Two consequences worth
copying:

- **Whatever the wipe folded in becomes an ordinary narratable technique.**
  The clue derivations inside `solverInitial` ("this given ▲ is a boat's top
  end, so its boat continues below") became a `givenClue` firing like any
  other — *better*, because it is a real technique a player should learn, and
  it was previously invisible.
- **So do the placement's side effects.** `placeShip` also waters the four
  diagonals. Left as a silent side effect only the deduction's board knows
  about, a later narration describes a board that isn't the player's. Boats
  emits it as a `neverTouch` firing, which also covers the player's *own*
  placements.

But **look at what the wipe wraps before moving it** (Sticks): if the wrapping
is only a loop, `deduceHintPlan` already replaces it — the hint runs the
game's per-firing function directly, the wiping wrapper is simply never
called, and the generator's solver stays byte-identical **by construction**.

**Inline (Range).** Thread an *optional* `record(cell, value, reason)`
callback through the solver's rules (built only on the hint path), plus a
`deduceHintPlan(...)` that runs the deduction from the player's current marks.
Exemplar: [`range/solver.ts`](../../src/games/range/solver.ts) +
[`range/index.ts`](../../src/games/range/index.ts).

**Through an op-queue + cascade (Singles).** A solver that **queues** ops and
**applies** them while **cascading** new ops knows the cause of a cell at two
sites — the rule that queued it and the apply step that queued a follow-on.
Attach the reason to the queued op, and record each op when it actually
changes a flag inside the apply/cascade loop; the cascade builds its own
reason at the apply site. Put the recorder + a group counter on the existing
solver state so it threads everywhere for free, and **gate every reason
allocation on it** (`if (ss.records)`) so the generator's hot solve path is
byte-for-byte unchanged. Exemplar:
[`singles/solver.ts`](../../src/games/singles/solver.ts).

**A Latin candidate cube *is* a notes representation; record off it** — see
§ "Candidate-elimination games".

**Group by a firing id, not by adjacency.** When one firing forces several
cells, give that firing's ops a shared `group` id
([`deduction-record.ts`](../../src/engine/deduction-record.ts)) and **merge
records by group into one multi-cell `HintStep`** (quality-bar rule 2).
Records of one firing are queued consecutively, so a first-seen-order bucket
keeps the plan's order. A genuine *chain* (a black → neighbours white → those
blacken line-mates → …) stays *separate* steps — each link is its own
teachable local deduction.

**One `group` must cover exactly one firing — beware a shared counter that
bumps per *pass*, not per *firing*.** If the recording solver bumps the group
once per solver invocation but a single routine loops over *every* clue/line
and records eliminations for several before returning, all those distinct
firings land under one group — the hint then narrates `group[0]`'s clue while
struck marks from *other* clues' lines bleed into the same step (the Towers
"the 5 from the next column got pulled into it" bug, 2026-06-21). Fix: make
each clue/line routine **`return` as soon as it fires on the recording path**
(gated on the recorder, so the generator's accumulate-across-clues path stays
byte-identical). Guard it: assert every struck mark of a standalone
clue-strike step lies within that step's shaded `area`
(`towers-hint.test.ts` "clue-strike marks never bleed outside the narrated
clue's line").

## Refusal wording comes from one module

**Never write a refusal message.** Import it from
[`src/engine/hint-refusal.ts`](../../src/engine/hint-refusal.ts):
`ALREADY_SOLVED`, `FIX_MISTAKES_FIRST`, `NO_DEDUCTION_LEFT`,
`CONTRADICTION_UNLOCALISED`, `NO_MOVE_WORTH_MAKING` and friends. The two-line
opening most deductive games want is `commonHintRefusal(completed, mistakes)`.

`hint-refusal.test.ts` enforces it in both directions — a new phrasing fails,
and so does an inlined copy of an approved one. A game that genuinely should
read differently adds itself to that test's `EXCEPTIONS` with the reason;
Untangle and Inertia are the two that qualify today, and both qualify because
naming their specific dead end *is* the hint's value.

The reason this is a rule: `help/features.md` §Hints teaches "there is a mistake
on the board" and "deduction has run out" as a pair, because they call for
opposite responses. That is unteachable if the wording changes between games.

**Pick the mistake message by whether anything will actually be highlighted.**
`FIX_MISTAKES_FIRST` promises a highlight, so emit it only under a
`findMistakes(state).length > 0` guard. Where the board is inconsistent but no
single entry is provably wrong — or where the game's `findMistakes` is a *rule
validator* that cannot see a wrong-but-legal entry — the honest message is
`CONTRADICTION_UNLOCALISED`, which asks the player to undo rather than pointing
at a highlight that never comes.

**Which of the two you need is decided by your own `findMistakes`, so read it
rather than copying a neighbour.** A game whose `findMistakes` re-solves the
clues and compares already catches a wrong-but-legal entry, and needs no second
check; a rule validator does not, and its `hint` must make that check itself
before deducing onward from a doomed board. Every game that needs the second
check has one — verified by reading all of them, not by grepping for a name,
which got the answer wrong twice (see AGENTS.md, "A scan that keys on a name").

## Refusal couples to the mistake overlay

A hint refused because the board is wrong lights up the same overlay **Check &
Save** uses — `Midend.computeHintPlan` calls `findMistakes()` on refusal. So a
game with both `hint` and `findMistakes` gets "fix the highlighted mistakes
first" *with the cells actually highlighted* for free.

The refusal message reaches the player via the banner on **both** paths —
manual Hint and Auto-Hint route the returned string into the transient banner
([`src/puzzle/puzzle.ts`](../../src/puzzle/puzzle.ts) `hint()` →
`setAutoHintMessage`). A hint-carrying game with `wantsStatusbar = false`
(e.g. Range) still shows and clears the banner. (Both behaviours are
requirements in the [`ts-engine`](../../openspec/specs/ts-engine/spec.md)
Hint System.)

## Rendering the hint

Render the hint in `redraw` from the displayed `HintStep` (the midend hands it
in). The base conventions: the forced cell in `COL_HINT`, equivalent moves in
the **same** colour, the hint bits folded into the per-tile `Int32Array` cache
([`rendering.md`](./rendering.md) § "The tile cache and the diff key"). Exemplar:
[`range/render.ts`](../../src/games/range/render.ts).

### Highlight, never perform

**The displayed (manual) hint must only mark the cell(s) to act on — paint the
target `COL_HINT` blue — and must NOT pre-render the move's result**
(owner-directed, 2026-06-20). Do not fill the cell with the black square /
circle / colour / digit the move would place. Two reasons, both flagged on
Singles: a pre-filled mark (a) **obscures the cell's own content** (Singles
painted a target black, hiding the `1` printed there, so the hint read as
nonsense against its own narration), and (b) **reads as already-done** when
applying the move is still the player's job. Keep the cell's number/state
visible under the blue highlight and let the **narration** say *which* mark to
place. The move is performed for real only in **animation mode**: auto-hint
calls `executeHint`, which applies the move, so the cell then renders as the
actual mark and (for fill games) plays its placement animation.

The toolbar **Hint button alternates show/apply** (`add-hint-button-stepper`):
the first press *shows* the step (highlight-only), and a second press *with
nothing done in between* calls `executeHint(true)` to apply that one step in
slow motion and then **stop** — the plan is hidden and the banner reads "Hint
applied". The *next* press shows the next step (any intervening action re-arms
the show). Applying is deliberately terminal: most players want one nudge, not
to be raced through the solution (contrast Auto-Hint, which rolls continuously
via `executeHint()`). This is a `Puzzle`-level orchestration of the two midend
primitives and needs **nothing from a game's `hint()`**; it does mean a player
experiences the plan at per-step granularity, so the "one deduction firing =
one journey" grouping is also what makes the stepper read well.

### Echo the move's shape in the hint colour

When a game's moves come in more than one visible *kind* — Spokes draws a
**line** between hubs *or* places a **rule-out mark** — the hint highlight
must use the shape that matches the move, recoloured `COL_HINT`, not force
every suggestion into one shape. Spokes' first cut drew every forced spoke as
a `COL_HINT` line; but three of its five rungs force a *mark*, and a solid
blue line for a rule-out reads as *"connect these"* — the exact opposite of
the narration, a picture-lies bug. The fix: a `SPOKE_LINE` suggestion is a
`COL_HINT` line, a `SPOKE_MARKED` suggestion is a `COL_HINT` dot at the
spoke's rim — the same two shapes the game already draws for a real line and a
real mark. Rule of thumb: **the hint borrows the game's own vocabulary for the
action, in the hint colour** — it never invents a shape the player would have
to translate, and never shows the shape of the *wrong* action. (Exemplar:
`spokes/render.ts` line-bit vs mark-bit branches. Sticks draws its forced
square as a `COL_HINT` **bar in the forced orientation** for the same reason —
a uniform tint cannot express an orientation.) This is the converse of
"highlight, never perform": you show *where and which action*, in hint colour,
without performing it.

### Show the evidence as an area

The visual half of quality-bar rule 1. A single shaded premise cell tells the
player *that* there's a reason; shading the whole area the deduction reasons
over lets them **see** it. Palisade shades the connected **region** a
clue/size argument is about; Range shades a clue's **line of sight**, the
**run it must reach along**, or the **non-black cells a cut would isolate** —
`COL_HINT_CELL` (a light blue), with the action cell still the lone `COL_HINT`
blue. Make the words and the picture agree: if the narration says "the shaded
run", a run must actually be shaded. Exemplar: `buildHighlights` in
[`range/index.ts`](../../src/games/range/index.ts).

**Compute each step's area against the board as that step fires, not the
original.** The plan is computed once, but a frozen area goes stale: a `reach`
run the player has since filled white wouldn't be shaded. Range threads the
solver's working grid through each recorded move (`HintMove.grid` — a
`dup.slice()` at record time) and builds the highlight from *that* snapshot,
so the shaded run grows as the player follows. (The snapshot has the move
applied, so filter the target out of its own area.)

**Guarded cross-game** (`hint-quality.test.ts`): every step must *show
something* — board marks or words. The stronger per-game form — this
deduction's evidence area is non-empty — is still worth a per-game test: the
"visible evidence" test in
[`range-hint.test.ts`](../../src/games/range/range-hint.test.ts) caught a
`connect` step whose known-white filter left the area empty (the connectivity
rule treats every non-black cell as white, so shade non-black neighbours, not
only marked-white ones).

**Filtering the target out of the evidence is a *per-technique* call, not a
house rule (Sticks).** Most games drop the acted-on cell from the evidence
list so the one solid target colour is never diluted — and copying that
everywhere is what emptied a Sticks `unreachable` step: the span its sentence
counts ("room for only 1 square") *was* the target square, so the frame showed
a lone blue bar and nothing else. Ask per technique whether the acted-on
square is genuinely part of the area being reasoned over. A run whose *length*
is the argument contains it; a clue's already-counted neighbours do not. Same
list, opposite answers, and the same per-game non-empty assertion catches it.

**The strongest form of "the words and the picture agree" is a count you can
assert.** Where a sentence states a number — a run's length, the room left,
the sides a clue has — make the evidence list have exactly that many entries
and assert it (`segment.length === size`, `span.length === max`,
`lines.length === value + 1`). Sharper than "non-empty", checked by the
*player* every time they look, and it fails loudly if a later edit shades a
convenient approximation instead of the deduction's own walk.

### Off-board evidence

A game whose deduction reasons over a **clue list, palette or tray** rather
than only over cells has half its premise outside the grid, and shading the
grid alone hides the part that does the work. Every Crossing technique turns
on "which listed numbers still fit this run" — a fact that lives in the number
panel under the board — so the hint highlights **both**: the run's squares as
the area, and the still-fitting numbers as a patch behind their text in the
panel, with the number a whole-run placement writes in taking the stronger
target colour. The narration and the picture then agree: *"only one number in
the list is 6 digits"* points at exactly one highlighted clue. Two things that
made it cheap and one that made it correct:

- **The layout is already shared.** Crossing's `layoutNumbers` was extracted
  during the port so `interpretMove` and `redraw` could not disagree about
  where a clue is; the hint just reads it. If your game's off-board surface is
  laid out inline in `redraw`, extract it first.
- **Its cache is separate from the per-tile one.** The `OverlaySidecar` covers
  the grid; the panel has its own per-clue state array, so the hint class has
  to be folded into *that* key too or the patch never paints
  ([`rendering.md`](./rendering.md) § "The tile cache and the diff key" applies per surface, not
  per game).
- **Ride behind the existing aid, don't replace it.** Crossing already colours
  the clue list by which run each number could go in. The hint draws its patch
  *under* that ink instead of overriding the colour, so both aids stay
  readable. Guard: assert the step names at least one clue **and** that a
  hint-coloured rect lands below the grid (`crossing-hint.test.ts`).

### Suppression must dismiss on UI_UPDATE

A bug that has shipped **twice** — Subsets first, Crossing after
(owner-reported both times). When a hint takes over a surface the game also
uses for something else (Subsets' reference aid; Crossing's selected-run wash,
suppressed so blue and green can't both mean "washed square"), the suppression
is invisible until the player touches that surface — and then **nothing
happens at all**: no wash, no aid, no change, and no way out of hint mode
short of finding the right toolbar button.

The gap in the plumbing: `hintKeepTrack` is only consulted for **moves**. In a
game whose board clicks *are* moves, going your own way returns `"off"` and
the hint drops. In a **selection-based** game (the pencil-notes family, plus
Crossing) a click is a `UI_UPDATE`, which never reaches `hintKeepTrack`, so
nothing dismisses anything.

Implement **`Game.uiUpdateClearsHint(step, state, ui)`** — the midend calls it
on every `UI_UPDATE` while a plan is stored, with the ui **after**
`interpretMove` has moved the cursor, and drops the plan when it returns true.
Two shapes:

- **`() => true`** — dismiss on any UI change. The simplest rule, and enough
  when the hint marks nothing the player has to select in order to act on it
  (Subsets).
- **Answer per step** — dismiss *unless* the player is working inside the
  squares the hint is about. Crossing does this (owner-directed): its
  whole-run placement is followed by clicking into the run and typing the
  number, and losing the explanation mid-way is the wrong trade. Everything a
  firing is about is already in `highlights.area`/`targets`, so the predicate
  is "am I inside the highlight?" and nothing new has to be stored.

**If you answer `false` anywhere the hint paints, the cursor cue becomes your
problem.** The hint owns the background on those squares, so a
*background-only* selection cue is invisible exactly when the player is about
to type there. Fall back to a **foreground** cue on hinted squares, in a
colour that reads against the hint: Crossing draws the keyboard cursor's
corner marks for a mouse selection too, in dark `COL_GRID` rather than the
near-white the green would swallow. Guard it with the *discriminator*, not
just the presence: assert the corner cue appears on a hinted square **and does
not** on a plain selection (`crossing-hint.test.ts` "keeps the cursor visible
on a square the hint has painted").

Two more things: **dropping the plan costs nothing** when the deduction is
deterministic and cheap (Crossing recomputes in milliseconds and re-shows the
same step) — weigh it if your hint is expensive. And the hook is a **method,
not a function property**: `Game` is stored type-erased in the registry, where
a function property's contravariant parameters do not survive the erasure,
while method syntax is checked bivariantly like every other hook.

The other selection-based games (Towers, Solo, Keen, Unequal, Undead, ABCD,
Group) do **not** set it: their hints suppress nothing, so a click there still
visibly moves the selection. The trigger for this rule is *suppression*, not
selection.

### The element-type colour legend

Quality-bar rule 3 ("equivalent moves share a colour") has a converse:
**premise cells that play *different* roles must NOT share a colour**, or the
highlight lies. Singles' 2×2-corner deduction is the cautionary tale — its
first cut shaded three cells one colour and called them all "two corner
squares", but those cells are *two* roles: the **matching pair** (cells that
share a number) and the **corner being protected** (a different cell that gets
sealed off). The fix: a third highlight role with its own colour
(`COL_HINT_STRAND`, amber) for the protected corner, disjoint from the shaded
`COL_HINT_CELL` matching pair and the `COL_HINT` target. Carry the roles as
separate lists on the hint type and apply them with a clear precedence in
`redraw` (target > strand > evidence); test the roles are **disjoint**.
Exemplar: `SinglesHint` + `strandOf`/`narrate` in
[`singles/index.ts`](../../src/games/singles/index.ts).

This generalises into a **stable per-game colour legend**: when a hint
narration names more than one distinct *kind* of board element, give each
*type* its own highlight colour so the words map to the picture — and keep it
stable (a "shaded square" is the *same* colour in every hint that cites one),
so the player learns it. Normative rule + scenarios:
[`ts-engine`](../../openspec/specs/ts-engine/spec.md) Hint System
("element-type colour legend"). Three non-negotiables:

- **Colour is never the sole carrier** (colourblind users). Every legend
  colour is paired with a non-colour cue — ring vs shade vs fill, the drawn
  digit, or position — and colour *names* never go in the narration text.
- **This is orthogonal to rule 3.** The legend governs *premise/element
  types*; equivalent *forced moves* still all share the one target colour.
  Don't colour two cells differently just because they're different cells —
  only different *types*.
- **A foreground highlight must contrast with the cell it sits on — never
  paint the acted-on glyph the same colour as its background fill.** A struck
  candidate *digit* must stay legible; a first cut filled its *cell*
  `COL_HINT` *and* drew the digit `COL_HINT`, so it was blue-on-blue and
  vanished — the candidate read as already-removed, exactly the "the hint
  deleted my note" bug (`fix-stale-hint-step`, owner-reported). The solid
  `COL_HINT` fill is the *placement*-target colour (a cell with no foreground
  glyph to hide); a **strike** cell keeps the lighter
  `COL_HINT_CELL`/normal background, and the struck candidate is drawn in its
  normal `COL_PENCIL` colour with a same-colour **strikethrough** as the
  "ruled out" cue. Guard with a tier-2.5 assertion that a strike frame draws
  **no** `COL_HINT` background rect (`towers-hint.test.ts`).

What each game's hints actually do — copy the matching row when you add a hint
to a similar game:

| game | move | premise type(s) → colour + cue |
| --- | --- | --- |
| Singles | forced cell, blue fill | matching number → `COL_HINT_CELL` shade + digit; cited **black** square → teal `COL_HINT_BLACKREF` ring; cited **white** circle → violet `COL_HINT_WHITEREF` ring; protected corner → amber `COL_HINT_STRAND` |
| Range | forced cell, blue fill (no mark preview) | undecided premise → `COL_HINT_CELL` shade; cited **black** square → teal `COL_HINT_BLACKREF` ring (same hue as Singles) |
| Unruly | forced cell, blue fill (grow anim only on auto-hint execution) | empty journey siblings → `COL_HINT_CELL` shade; cited premise / pivotal cells → orange `COL_HINT_REF` ring (**one** colour, not the black/white split — its rings land on black cells, a balanced both-colour row, *and* empty windows, so a state-derived colour is ill-defined) |
| Palisade | forced edge(s), blue `COL_HINT` segments (equivalent edges share it) | region → `COL_HINT_CELL` shade; clue → its drawn digit on the shaded cell |
| Filling | target square(s), *mild* `COL_HINT` fill, **no digit** | region premise → `COL_HINT_CELL` shade + digit on top |
| Towers | struck candidate digit(s) `COL_HINT` + cross-through (on a *non*-`COL_HINT` cell so the digit shows); placement target `COL_HINT` fill (no digit to hide) | driving **clue cell(s)** *and* their line of sight → `COL_HINT_CELL` shade (clue + sightline read as one premise region) |
| Pattern | forced cell(s), blue `COL_HINT` fill (highlight only, no mark) — the reasoned line's clue digits also recolour `COL_HINT` to tie clue↔line | reasoned **row/column** → `COL_HINT_CELL` shade on its *undecided* cells; an overlap run's anchoring **black** mark → teal `COL_HINT_BLACKREF` ring (white anchors → violet `COL_HINT_WHITEREF`). White ("no run reaches here") firings ring *nothing* — that deduction leans on the whole line's packing, so a ring would over-claim; the shaded line + highlighted clue is the evidence. |
| Light Up | forced square(s), blue `COL_HINT` fill (bulb *and* mark targets identical — the narration says which) | evidence squares carried as one list, cue split by the cell's own state: a **dark** square → `COL_HINT_CELL` shade, a **lit/bulb** square → teal `COL_HINT_LITREF` ring (a fill would hide the "already lit" premise); the unlit square a deduction protects → amber `COL_HINT_DARKREF` ring; the driving clue → its digit recolours `COL_HINT` (the light `COL_HINT_CELL` was tried first and is unreadable as a cue — nearly white on black) |
| Slant | forced square(s), blue `COL_HINT` fill (no slash preview); a clue firing lights all its forced squares and drops them as its multi-leg journey advances | a **clue** firing → the clue's digit recolours `COL_HINT` + its already-decided neighbour squares `COL_HINT_CELL` shade; a **loop/dead-end** firing → the connectivity chain / trapped-point components `COL_HINT_CELL` shade (plus the trapped points' incident squares); an **equivalence** firing → teal `COL_HINT_REF` ring on the cited already-filled anchor |
| Netslide | the tile being placed, `COL_HINT` fill (its wires still drawn on top); the border arrow to press, `COL_HINT` | its destination outlined `COL_HINT` — **solid** when the finished board really wants that tile's wires there, **dashed** when the plan is only passing through (the non-colour cue distinguishing *arrived* from *setting up*) |
| Crossing | the squares to write into, solid **green** `COL_HINT` (green, not the collection's blue — see below); a struck note keeps its normal `COL_PENCIL` digit + strikethrough on a *non*-target background | the run(s) reasoned over → pale-green `COL_HINT_CELL` shade; **and the still-fitting listed numbers → the same two shades as a patch behind their text in the clue panel** (§ "Off-board evidence") |
| Spokes | the forced spoke, in `COL_HINT` — **a line** when the move draws a line, **a rim dot** when the move places a mark (§ "Echo the move's shape in the hint colour") | the hubs whose clue/lines/connectivity are the argument → `COL_HINT_CELL` ring. A saturated hub forces several spokes as one multi-leg journey, all in the one colour |
| Sticks | the forced square drawn as a `COL_HINT` **bar in the forced orientation**; green `COL_LINE` stays the placed line, so the hint is never mistaken for the move | the run / span / clue-sides the argument counts → one `evidence` list, cue split by the square's own state: a **white** square is washed `COL_HINT_CELL`, a **black clue** is *ringed* the same colour (a wash would hide the blackness the argument is about). The list's length equals the number the sentence states |
| Galaxies | the **deduced** cell, solid **purple** `COL_HINT` (not blue — see below); the 180° partner the same move claims, a `COL_HINT` **outline over the ordinary evidence shading** (same hue, they share a fate; far less weight, only one is what the words are about); the wall it draws, a `COL_HINT` bar drawn *whether or not the wall exists yet*; the dot it points at, a **filled `COL_HINT` halo with the dot repainted on top** — **unless the dot stands on a cell just filled**, where a mark in the fill's own colour is invisible and the narration names the dot by position instead | the cells / walls / dots the argument reasons over → `COL_HINT_CELL` teal (a galaxy's reach, a cut-off piece, the partner across a dot, an already-drawn wall). One ring role at a time, so "the ringed dot" is never ambiguous |

**If the game has already spent the hint hue, the *hint* moves — and takes the
board with it (Crossing).** `COL_HINT` blue is the collection's default, not a
mandate, and it is the wrong choice in a game whose own legend already means
something in blue. Crossing washes a horizontal run pale blue and a vertical
one amber (**the hue *is* the information**), and the collection's hint blue
is within eight hundredths of that wash in OKLCH — a hint mark the player
reads as "across". So Crossing's hint took **green**, the far corner of the
wheel from both dimension hues, and — the half that actually settles it — **a
displayed hint suppresses the run wash entirely**, so only one meaning of
"washed square" is ever on screen. Rule of thumb: check the new hint colour
against the game's *existing* legend in OKLCH before assuming the default, and
when two washes would coexist, decide which one owns the board while it is up.

**A second thing can hold blue: a transient affordance that lands on the same
objects (Galaxies).** Its drag preview is `DRAG_ADD`, which *is* hint blue, and
the collision is not incidental — both **ring a dot**, and they are on screen
together the moment the player drags to follow the hint (a cell→dot drag rings
every dot the cell may join; the hint rings the one it must). Same shape, same
object, same instant, so the hint took **purple**. The tell that this is the
real thing and not a tidy-up: the two roles agree about *what* they point at,
which is exactly when one shared colour is most confusing rather than least.

**But when the thing holding the hue is the *cursor*, the cursor moves
(Sticks).** Crossing's blue carried *information about the puzzle*, which is
why the hint had to yield. Sticks' clash was with `COL_CURSOR` — and a cursor
is a UI affordance that is already per-game, whereas hint blue is learned
across twenty-eight games. Check *which* role is the cross-game one before
deciding who yields. The collection's answer when green and blue are both
spent is **purple**, twice already (`spokes/render.ts`,
`subsets/render.ts`) — copy the precedent, and say why at the assignment.

Two reusable legend readings: (1) **teal = "a cited black square", violet =
"a cited white square"** is a cross-game reading worth preserving — reuse
those hues for a decided black/white premise, and pick a *different* hue
(Unruly's orange) when a game's premise ring isn't a single decided colour.
(2) When the ring set is **mixed** (filled + empty, or both colours), use
**one** premise colour, not a per-cell split.

**Single-action *imperative* hints are exempt.** Movement/objective games name
only **one** element type — the tile/colour being moved — so there is no
premise type to disambiguate. The legend bites only when a hint narrates a
*premise* distinct from the *move*.

### Shade vs ring

**The acted-on cell is ringed in every game, with no exceptions**, and an
evidence area is outlined unless the game can say that nothing is drawn on it.
The mechanism is [`engine/hint-mark.ts`](../../src/engine/hint-mark.ts); this
section is the rule and the reasoning.

#### Why a fill cannot work, whatever colour it is

`HINT_FILL` behind a pencil mark scored **1.91:1** in light and **1.96:1** in
dark, and behind an entered digit 2.20 / 2.71. It is not fixable by recolouring:
the pale end of the palette holds exactly one cool wash and the evidence has it,
so the only hues clearing ~2.6:1 are the ones nearest `ERROR_WASH` — which would
make the cell the hint points at look like the cell that is *wrong*. A joint
search over both hint roles, every hue and both schemes returns **no feasible
arrangement** (owner-reported, 2026-08-22; the search is in
`walk-tactic-hint-chains` D7). The role is gone from the palette, so nobody
reopens the question by retuning a colour.

A mark drawn on the cell's **border** is read *against* a surface rather than
*through* it, so the constraint disappears instead of being traded, and the mark
can take a strong colour — **`HINT_ACTION`**, the emphatic blue this cell always
meant. It also unifies two branches the candidate games had split: they
suppressed the fill whenever candidates were struck (Towers: *"painting the cell
COL_HINT as well would hide the very digit the hint is crossing out"*), so on a
strike step the target carried **no cell-level mark at all** and the player had
to hunt for the strikethrough.

**And the target is ringed even where the fill hid nothing.** Eight games filled
a genuinely empty cell — measured, one frame at a time — and were converted
anyway (owner, 2026-08-22). Two reasons: one mark should mean one thing across
the collection, and in a shading game (Bricks, Clusters, Unruly, Singles,
Pattern, Slant) the move *is* "give this cell a colour", so a solid fill says
with the board what the narration is still proposing.

#### Where the band goes, and who rubs it out

`MarkBand` is a content box plus how far the band reaches **outside** it and how
far **inside**. That is the one thing that genuinely differs between games, and
it decides who undoes the mark:

- **Outside** (`outer > 0`) — Keen and Solo have a `2·GRIDEXTRA + 1` gutter of
  `COL_GRID` backing; Unequal has a `TILESIZE/2` gap. The mark costs the content
  nothing. **No tile owns those pixels**, so `HintMarks` is told the gutter's
  resting colour: it paints a moved mark back, and **restamps a mark that stayed
  every frame**, because a neighbour repainting for its own reasons widens its
  background into the shared gutter and would clip a side off.
- **Inside** (`outer = 0`) — Towers, Filling, Crossing, Dominosa and Salad tile
  exactly and draw their own per-cell outline, so the band replaces it. Nothing
  needs erasing: the cell whose overlay changed repaints itself and takes its
  mark with it, which is why those games can draw the mark from `drawTile`.
- **Both** — Group, Undead and Clusters have a one-pixel gutter plus a couple of
  pixels of the cell's own edge.
- **Inset** — Galaxies and Palisade put the mark *inside* the cell body, because
  in those games the cell border is where a **wall** lives and a mark there would
  read as one.

The band is the width of the border it replaces, not the heaviest line that fits:
it reads as a highlight by **colour**, not by weight. The inner reach is bounded
by the content, and the bound is arithmetic rather than taste — Undead's pencilled
monster is a circle of radius `2/5` of its `TILESIZE/2` box centred a quarter-tile
in, so it clears the edge by `TILESIZE/20`; Unequal's greater-than chevron reaches
to within `GAP/4 − 1` of the cell it points away from. Each game's `markBand`
records its own.

#### Outline or wash: what the evidence cells carry

**Outline** where the cells carry anything the player has to read — digits,
pencil marks, clue glyphs, a placed slash, an association's own black or white
background. One rule draws both shapes it needs: paint a side wherever the
neighbour across it is not also evidence, so a contiguous region (a cage, a row,
a line of sight) comes out as a single contour, concave corners and all, and a
scattered set (a forcing chain's cells) as one ring per cell — honest, because
they really are separate cells.

**Wash** only where the game can say *nothing is drawn on these*, and three games
can: **Unruly** (the journey's still-empty siblings), **Pattern** (the reasoned
line's undecided squares) and **Light Up** (dark squares, where the premise is
that the square is **not lit** — which a teal shade preserves, being not yellow).
`hint-mark.test.ts` asserts that set exactly, so a fourth game washing its
evidence fails until somebody writes down why it may.

**Filling used to be the counterexample and is not.** Its premise is a *number*,
and a digit reads perfectly well on a pale fill — 3.41:1 in light, 4.04:1 in
dark. That is true, and it is not the binding constraint. The wash also has to be
dark enough for a *derived* foreground, and at that lightness it measures
**1.15:1 against its own board in dark mode**: legible content on a tint nobody
can see. The two requirements move in opposite directions along one axis, so a
wash under content loses whichever way it is tuned; an outline is not on that
axis at all. Sticks and Boats collapsed the same way — each had *split* its
evidence, washing one kind of cell and ringing the other, and both are now one
shape for one role.

Note what is *not* an option: dropping the evidence mark. Keen's narration says
*"**This** cage"* while the target often sits in a different one, so the mark is
the only thing identifying which — the deixis rule two sections up, enforced by
geometry rather than prose.

Give an outline a **`_BOLD`** colour, not the base. `colour-dark-check` is what
settles it: a base step at the same lightness in both schemes lands close to a
pale board and far from a dark one — a soft line under one scheme and a bright
one under the other — and the check flags exactly that. The bold step is defined
as "dark in light mode, light in dark mode", which is what a line drawn *against*
a board wants. `HINT_EVIDENCE` is that step, and it covers the **chain ordinal**
too: a number saying where a cell falls in the chain is an index *into* the
evidence, not a hint role of its own, so the two are one role rather than two
that happen to agree.

#### Guarding it

Guard the *shape*, not the colour: "some rect is `COL_HINT`" is precisely what a
fill also satisfies, so it would pass unchanged through the very rewrite that
removed the fills. [`hint-mark.test.ts`](../../src/engine/hint-mark.test.ts)
sweeps the `hint-games.ts` enrolment and asserts that no rect in a game's hint
colours is cell-sized and thick in both directions, reading each game's palette
indices out of its own `render.ts` exports so there is no second list to drift.
Per-game, [`mark-shape.ts`](../../src/engine/testing/mark-shape.ts) gives
`expectRing` (four thin rects, none solid) and `expectContour` (`2w + 2` sides
for a `w`-cell region, where a per-cell renderer would give `4w`).

Exemplars: `markBand` plus the post-tile block of `redraw` in
[`keen/render.ts`](../../src/games/keen/render.ts) for a gutter game;
[`filling/render.ts`](../../src/games/filling/render.ts) for a tiling one;
[`galaxies/render.ts`](../../src/games/galaxies/render.ts) for the inset case.

### Group one firing into one step

Quality-bar rule 2 has a second form beyond `continuesPrevious` legs: when a
single deduction forces **several cells at once**, emit **one** `HintStep`
whose `Move` fills *all* of them and highlight them all as targets. Filling's
region-growth deduction is the exemplar — a region that can't reach its size
pins *every* empty square on its completion at once, so the hint points at the
whole group ("The shaded region of 5 fits exactly into these squares.")
instead of dribbling them out one per request. Exemplar: `nextRegionGroup` in
[`filling/solver.ts`](../../src/games/filling/solver.ts), `deduceHintPlan` +
`hintKeepTrack` in [`filling/index.ts`](../../src/games/filling/index.ts):

- **Find the whole forced set per firing.** Distinguish **exact** (the group
  *completes* the region — "fits exactly into these squares") from **partial**
  ("can't fully grow without these squares"); the count drives
  singular/plural.
- **Plan = apply a group, recompute, repeat**, on a working board so every
  step's narration and shaded region reflect the board as it fires. Keep a
  **single-cell fallback** so the plan still *completes the board* (verify
  with a "every generated board's plan solves it" test).
- **`hintKeepTrack` handles partial completion.** The move must set the hinted
  value into a **subset** of the step's cells (and nothing else) →
  `"completed"` when it fills the last one, else `"onTrack"` with the step
  **shrunk in place** (`step.move` / `step.highlights` updated to the
  remaining cells) so a later `executeHint` doesn't re-fill what's done. A
  non-target cell, or the wrong value, is `"off"`.

A clean seam for the `continuesPrevious`-legs form: when the solver fills a
whole line through a shared helper (Unruly's `fillRow`), thread the recorder
through it so its first cell opens a journey and the rest continue it;
per-cell techniques emit independent steps. See
[`unruly/solver.ts`](../../src/games/unruly/solver.ts) `deduceHintPlan`.

**Whether several forced squares are one step or a journey of legs is decided
by the numbers in the narration** — Sticks' firings can pen the same clue into
*different* amounts of room per square, which is what chose the per-leg-
sentence journey over the one-sentence multi-square step. And **"one firing =
one move" is a claim about the deduction — an early-returning solver cannot
tell you whether it is true.** Sticks' `sticksTry` returns at its first
success, which reads as "one contradiction decides one square"; a seed scan
said 21% of firings decide more than one. Check the forced set is computed
against the board **as handed in** (a set that only appears after applying the
first is a *chain*, and chains stay separate steps).

### A journey completes leg by leg

The midend advances the plan on `"completed"` and **holds the same step** on
`"onTrack"`. So a `hintKeepTrack` that asks "are all of this *journey's*
squares placed?" makes leg 1 permanently incomplete: the plan never advances,
and `executeHint` re-applies leg 1 on every tick. Judge the **leg** — the
squares this step's own move asks for — and let the journey advance through
its legs naturally. Boats derives the leg's squares from `step.move`'s
rectangle plus its fill value, so nothing extra is stored; the journey's full
`highlights` still ride on every leg, so the picture never shrinks mid-hint.
Guard: walk a real journey and assert *each* leg verdicts `"completed"`
(`boats-hint.test.ts`, "completes a journey leg by leg").

### A move must not reach past the squares the step claimed

Where a game's `Move` fills an *area* rather than a named set of cells —
Boats' `fill` is a rectangle that sets every still-empty square in its span —
a step that widens its span for convenience can silently decide squares the
narration never mentioned, and decide them **wrongly**. Two rules:

- **Widen the span only when every square in it is either a target or already
  decided**, checked against the board *as this step fires* — each firing
  carries its own grid snapshot (the evidence-area pattern, for the move and
  not only the shading).
- **Keep the plan's board and the player's board reconcilable.** Anything the
  deduction decides as a side effect (Boats' never-touch water) is a square
  the player's board *doesn't* have unless some step asked for it. Either emit
  it as its own firing, or fold it into the step's move and require it for
  completion — never let the deduction quietly know something the player was
  never told. Guard with "never asks for a square the step did not claim":
  apply each step and assert every square whose *decidedness* changed appears
  in that step's targets. (Compare decidedness, not raw cell bytes — Boats'
  `executeMove` rewrites a placed `SHIP_VAGUE` into its resolved shape; that
  is a byte change, not a decision.)

### Honest non-local evidence

Three of Filling's four techniques have clean local evidence; the fourth —
candidate elimination — reasons *globally* (a number is ruled out because an
orthogonal neighbour equals it **or** because no region of that size can reach
the cell). Don't fabricate a tidy area — state *both* mechanisms honestly
("it would sit next to an equal number, or belong to a region that can't reach
the right size here") and **assert the visible-evidence invariant only for the
local techniques**, relaxing it (explanation + target) for the global one.
Surfacing the step honestly beats omitting it (a gap would break the plan's
path to the solution). See `filling-hint.test.ts` "every local-technique
deduction carries evidence".

### Re-derive the named technique

A per-line solver like Pattern's (`doRow`/`doRecurse`) computes a line's
forced cells by **intersecting every legal run placement** — it returns
*which* cells are forced but carries **no reason**, so narrating "why" needs
re-derivation, not a threaded recorder. Compute the recognisable named
techniques directly from the line's **leftmost and rightmost feasible run
packings**:

- **Overlap → black.** A cell in run *i*'s leftmost∩rightmost span is covered
  by run *i* in *every* placement → forced black. Narrate per run ("this run
  of N can slide only K cells, so these must be black"); one run = one firing.
- **Unreachable → white.** A cell covered by no run's possible span in any
  placement is forced white. One firing per contiguous white segment.

Both are **subsets** of what the full intersection solver forces, so keep the
complete `doRow` solver as the **general single-line intersection** bottom
rung for any cell the two elegant techniques miss. This is **not** a "just
because" catch-all — every cell `doRow` forces is that colour in *every*
arrangement of the line's runs consistent with its marks, i.e. overlap
generalised to the whole clue, so it is a real named technique. Narrate it in
the necessity voice — *"Whichever way this row's runs fit, these cells must be
black / must stay white."* — **never** the misleading *"only one arrangement
fits"* (the deduction is all-arrangements-agree, not one-arrangement-only).
**Measure before enriching:** the bottom rung is rare per step at the shipped
sizes (0% at 10–15×15, ≤0.3% of steps at 30×30, though up to ~⅓ of 30×30
*boards* touch it once) — that measurement is what justified *promoting* it
over *rejecting* the boards that need it. Two things this shape buys:

- **The generator untouched by construction.** The hint code
  (`packLeft`/`packRight`/`analyzeLine`/`deduceHintPlan`) is *separate* from
  the generator's `solvePuzzle`/`isSoluble` — the parallel-recorder shape, not
  an `if (recorder)`-gated hot path — so the generator differential is
  unaffected by construction.
- **No new move type needed if you group by contiguity** — but Pattern added a
  `fillCells` (arbitrary-cell-set) move anyway so a firing's white cells can
  group even when non-contiguous and `hintKeepTrack` can shrink in place.
  Exemplars: [`pattern/solver.ts`](../../src/games/pattern/solver.ts),
  [`pattern/index.ts`](../../src/games/pattern/index.ts).

*Narration gotcha:* the zero-slack extreme wants a *premise* verb, and a
`\bis\b` conclusion-guard regex catches it — "run … **is** pinned" trips a
test aimed at the conclusion clause. Word the premise without a flat
state-of-being verb ("has nowhere to slide") rather than loosening the guard.

### Read the reason off the validator

When the solver forces a move by **contradiction** — tentatively set a cell,
and if the board's validity oracle returns INVALID the cell is forced the
other way — you often need *no separate recorder at all*, because the oracle
**already localises which rule broke and where**. Bricks' `bricksValidate` ORs
a per-cell `FE_*` flag for each violation; the hint's `nextForcedMove` re-runs
the rejected trial with an `errors` array and reads the flags back to build
the reason — with the evidence cells falling straight out of the flagged
positions. Two things make this clean:

- **The reason is the rejected trial's flags, not the accepted move's.** The
  move is "cell must be *unshaded*"; the *why* lives in what shading it broke.
  Set the trial colour, validate into `errors`, classify, restore. A fixed
  priority (Bricks: three → gravity → count) picks the clearest when several
  fire.
- **The recording path stays out of the generator.**
  `nextForcedMove`/`deduceBricksPlan` are hint-only functions beside the
  untouched `solveGame`, so the generator differential can't drift.

**The classifier must be TOTAL, and this is where it goes wrong (Boats).**
Reading a reason off a validator only works if you enumerate *every* way that
validator can say no — including the paths that set **no flag at all**.
Boats' `validateFullState` reports INVALID from five places, but two of them
mark nothing. The first cut returned `null` for those, the finder skipped the
trial as unclassifiable — and the **entire Hard tier silently produced zero
firings**, which showed up only as "Hard boards stall" in a convergence sweep,
never as an error. Two habits that would have caught it:

- **Mirror the oracle's own decision sequence** when writing the classifier,
  rather than listing the flags you happen to know about; then every
  `return INVALID` in the oracle has a matching branch.
- **End in an honest catch-all, never in "no reason".** Boats' last branch is
  `unfinishable` ("the rest of the fleet could no longer be placed legally") —
  vaguer than the others, still true, and infinitely better than dropping a
  sound deduction. Pair it with a per-technique coverage sweep over generated
  boards so a rung that never fires is *visible*.

**Name the flag by what it actually means.** `FE_FLEET` marks a *completed*
boat of a size the fleet has no room for, so "the fleet would need a boat it
doesn't have" was a mis-description of the very thing the classifier had just
read. A reason lifted off a flag inherits the flag's exact meaning — go read
it.

For the recursive (lookahead) rung, the honest v1 is a proof-by-contradiction
step: hypothesis on the target, contradiction ringed from the sub-solve's
final INVALID `errors` — narrated, never an un-narrated "only one fits".
Showing the whole what-if walk is the enrichment (§ "Show the what-if walk
statically"). Exemplars:
[`bricks/solver.ts`](../../src/games/bricks/solver.ts) (`nextForcedMove` +
`classify*Trial`), [`bricks/index.ts`](../../src/games/bricks/index.ts). This
is the shape for any game whose live-error/`findMistakes` validator already
marks *which* rule each cell breaks — the same pass is a ready-made reason
source.

### The honest chain tier

Sometimes a whole **technique is intrinsically a multi-step chain the game has
no vocabulary to externalise**, and the honest treatment is the only compliant
one (Slant, `add-slant-hint`). Slant's four move-producing techniques: three
are clean and glance-able — clue-counting, loop avoidance, dead-end
avoidance — and cover ~94–98% of firings (*measure first*: a throwaway
technique-tag recorder over the shipped presets gave clue ≈83%, loop ≈9%,
dead-end ≈5%, equivalence ≈4%, and showed dead-end/equivalence fire on most
boards, so the plan **cannot** drop them — every one must be narrated).

The fourth, **equivalence-to-an-already-filled-square**, is the Palisade
"share a fate" idea, but its justification is a *chain* — the lock was
established by a pairing or v-shape argument several fixpoint passes earlier —
and Slant has **no pencil mark** to accumulate that chain onto the board (the
externalisation route is closed). So compressing it into one glance-able
sentence is impossible without lying. The honest tier: name the technique and
cite the anchor — *"This square is locked to the same slant as the ringed one
— the clues around them leave no other pairing — so since that one is a
backslash, this must be a backslash too"* — ring the already-filled anchor
(`COL_HINT_REF` teal) as the visible evidence, and **do not** reconstruct the
derivation. It is a real minority of firings, so the common hint stays
first-class; flag the dip for owner acceptance.

Two mechanics worth carrying to the next connectivity game:

- **Recorder + `seedFrom`, both gated, over the real solver.** Extend the
  ported solver with an optional `record`/`seedFrom` (the generator passes
  neither ⇒ byte-identical, differential green); `seedFrom` replays the
  player's marks through the same `fillSquare` that syncs
  connectivity/exits/equivalence, so the recorded plan continues from their
  position — the seed has to walk the union-find, not just copy a grid.
  Exemplar: [`slant/solver.ts`](../../src/games/slant/solver.ts).
- **Connectivity-chain evidence must add the points' *incident squares*, not
  just the diagonal component.** A dead-end firing traps a point that may
  carry **zero placed diagonals** — the diagonal-only component comes back
  empty and the visible-evidence invariant fails. Shade the component **∪**
  the ruled-out corners' incident squares, so the trapped points are always
  located (`componentSquares` + `incidentSquares` in
  [`slant/index.ts`](../../src/games/slant/index.ts)).
- **A clue firing groups as `continuesPrevious` legs**, each leg carrying the
  necessity modal too, so the voice guard passes on *every* step, not just
  openers.

### Show the what-if walk statically

Slant's honest tier cites its chain's *anchor* and stops; Clusters
(`add-clusters-hint`) goes one step further for a **contradiction solver whose
depth-1 chains are frequent** (39–56% of boards — measured first): the whole
hypothetical is displayed **statically in one step's highlights**. The target
stays a plain `COL_HINT` fill ("suppose this cell were blue"), each cell the
hypothesis would force carries a **small centre mark of its forced colour**
(deliberately tile-unlike in size, so it reads as hypothetical, not placed —
this is NOT the "highlight, never perform" pre-placement, which governs the
*target*), and the tile where the contradiction lands gets a **double danger
ring**. Four transferable mechanics:

- **The multi-leg "what-if walk" journey is mechanically closed** without an
  engine change: `HintStep.move` is required, auto-play applies every leg's
  move for real, and the no-op-plan guard forbids dummy moves — hypothetical
  marks can never be journey legs. Static display via highlights is the
  compliant shape; don't rediscover this. (`walk-tactic-hint-chains` re-derived
  it, costed the engine widening that would open it, and the owner declined:
  holding a *hypothesis* in mind is fine, holding the *chain* is not — so the
  chain is numbered instead, see the next section.)
- **Pick the shortest chain, not the first.** At a stall, evaluate every
  candidate firing's propagation and take the shortest (tie-break scan order —
  deterministic ⇒ recompute-stable). First-in-scan-order chains averaged 6–7
  forced cells (max 32); shortest averaged ~3 (max 11), cheap enough that no
  display cap was needed.
- **Reject-at-generation has a price beyond generation time**: it changes
  which descs the generator emits, so it breaks a byte-match differential and
  every shared board ID. At a >⅓ incidence it is simply not on the table —
  measure before assuming that fallback is available.
- **One ring role only.** A read-through caught "the ringed tile" going
  ambiguous with two ring hues on screen; when every premise tile is adjacent
  to the target/danger cell, drop the premise ring entirely and let "ringed"
  refer uniquely to the danger ring (double, so it can't be confused with a
  single-frame live-error outline — deliberately the same visual language:
  "would break" vs "breaks now"). Guard: assert "ringed" is uttered iff the
  danger highlight is set (`clusters-hint.test.ts`).

Exemplars: `deduceHintPlan`/`chainToContradiction` in
[`clusters/solver.ts`](../../src/games/clusters/solver.ts) (a parallel
recorder re-deriving each firing's reason via a neighbourhood-only error
check), `narrate` in [`clusters/index.ts`](../../src/games/clusters/index.ts).

### Number the chain — the order is the fact the marks used to lose

A statically-displayed chain is a **set** of marks, and a set is not a chain. The
narration inevitably says "each forces the next" or "by the time you reach the
end", and with nothing on the board saying which came first the player can only
check that by redoing the deduction — which is the compressed-claim failure
[§ "The forcing boundary"](#the-forcing-boundary) forbids, wearing a different
costume. Eight games shipped exactly this
(`walk-tactic-hint-chains`).

**Declare each link's position and let the shared mechanism draw it.** A link
carries `order` (`OrderedCell`, `engine/overlay-sidecar.ts`), the sidecar keeps
it in an ordinal lane of its own — `hintMarkBit` already reaches bit 28 in Group,
so there is no bit budget to borrow, and an ordinal is a small integer rather
than a flag — and `drawHintOrdinal` (`engine/hint-ordinal.ts`) puts it in the
tile's bottom-right corner in `HINT_ORDER`. Three things to know:

- **Declare it as data, not as an array index.** The renderer reads `c.order`; a
  positional convention two files have to agree about is one refactor from
  silently renumbering the chain.
- **Bottom-right is the only corner free in every game that draws one.** Keen and
  Solo put a cage clue top-left, and the candidate games pack an empty cell's
  pencil marks from the top-left too — and a chain cell has exactly two
  candidates *by definition of the technique*, so its marks are always in the top
  row. One corner across the collection beats a per-game best fit: the mark can
  then be learned once.
- **Wire it in your renderer.** The mechanism is shared but the wiring is not —
  your tile painter has to take `ds.hint.order[i]` and pass it on. Forgetting
  gives you a shaded chain, a sentence citing "cell 3", and no numbers at all.
  `hint-ordinal.test.ts` guards this for every enrolled game.

**An ordinal, never an arrow.** The obvious drawing is a path through the chain,
and it was prototyped and rejected on measurement: an arrow claims *this link
forces that one*, which is false in **34%** of Clusters' links (delete the
predecessor and the successor is still forced — what forces it is its own
neighbourhood, not the cell before it in discovery order), and half its links are
not adjacent, so the arrows crossed the board. A *true* implication chain like the
Latin family's is not thereby entitled to arrows either: one mark should mean one
thing collection-wide, so every game draws the weakest claim every chain can
make. See `walk-tactic-hint-chains` design D5 for the numbers.

The numbering also **ties the deixis** — see § "Two marks on the board, one 'this
cell'". Exemplars: `forcingChainArea`/`narrateForcingChain` in
[`engine/latin-hint.ts`](../../src/engine/latin-hint.ts) (one sentence, six
games, `LatinVocab` for heights/elements/letters), and Clusters'
`buildHighlights`.

### Rule-outs as board marks

Most deductive hints only ever *place*; a game whose own move set includes a
"this can't be filled" annotation (Dominosa's **barrier edge**) can
externalise its rule-out deductions directly onto the board instead of
cramming the reasoning into a placement's narration. Dominosa's hint emits
**two kinds of step** off one recorder:

- a **placement** step — the payoff "place the N–M domino here", narrated with
  why the alternatives are gone;
- a **barrier** step (the seven rule-out techniques) — "this can't be a domino
  because …", whose move *draws the barrier*, so the deduction becomes a
  visible mark the next placement can lean on.

The recorder + driver shape that made it clean and resume-safe:

- **`firstFiring` checks for a determined-but-unplaced piece first**, then
  runs the deductions in solver order and returns after the *first* firing —
  placements always take priority over rule-outs (the payoff leads).
- **Persistent scratch across the plan build, seeded from placed pieces
  only.** `hint()` builds the whole plan on one solver scratch
  (`seedFromDominoes`), advanced after each emitted placement. Crucially it
  does **not** seed the player's *annotations* (a wrong barrier must never
  break the hint); the recorder re-derives every rule-out, and a barrier the
  player already drew is skipped for **display** while still advancing the
  scratch. Contrast Slant's `seedFrom` (which replays marks): Dominosa's
  annotations carry no validity, so they are deliberately ignored, not
  replayed.
- **Trivial boards come out all-placements**, so barriers appear only when a
  harder tier genuinely needs one — the barriers read as teaching, not
  busywork. The `hint-resume.test.ts` walk (first preset = Trivial) is
  therefore all placements; add a game-local test that walks a *Hard* board to
  solved to exercise the barrier path (`dominosa-hint.test.ts`).

The recorder is **gated** (`this.recording`), so `runSolver` — the generator's
path — is byte-identical and the differential is unaffected by construction.

### Notation and goal are different move sets (Galaxies)

Most games' hints teach in the vocabulary the win condition is written in.
Galaxies' are not the same thing: `checkComplete` reads **walls only**, while
the deduction is entirely about **which dot owns which cell** — an association
arrow, which is consequence-free notation the completion check never sees. A
plan made of arrows alone would be sound, teachable, and would *never solve the
board*, which the resume guard catches immediately. Three consequences worth
copying to any game whose notation and whose goal are different move sets:

- **The plan has to cash the notation in.** Galaxies' walls come from one rung
  — "these two cells are settled on different dots, so a wall runs between
  them" — and that rung is 62% of a plan's steps. The arrows are the reasoning;
  the walls are the answer, and a plan that teaches only the first never
  finishes.
- **Rung *order* is a narration decision, and measurement picks it.** Upstream
  runs its two wall rules as one function; in solver order the *mirror-the-wall*
  half won every race and became **58%** of the plan, longest sentence and
  hardest technique both. Split into two rungs with the mirror one demoted to
  last, it fires 7% of the time — only where it actually unsticks the board —
  and the walls it used to draw early get narrated later by the plainest
  sentence the game has. The split is a parameter defaulted to "both", so the
  generator's solver is byte-identical and the differential proves it.
- **A rule that claims a cell's partner too will under-report what it did.**
  `solverAddAssoc` associates the tile *and* its 180° image, so the image
  returns "nothing to do" when its own turn comes and a firing built from the
  progress flags lists half the cells its own move claims — a hint saying "this
  cell" while filling two. Compute the claimed set from a **before/after
  comparison**, not from the rules' return codes. This shipped past every
  test and was caught by looking at the board in a browser.

- **A cell the move *comes along to* is not the cell the words are about.**
  The same move claims a cell and its 180° partner, and painting both the
  action colour made every "this cell" ambiguous (owner-reported at
  acceptance). They are not equivalent moves in rule 3's sense — one is
  deduced, the other follows by a symmetry the player already knows — so the
  deduced cell fills solid and the partner takes an **outline of the same
  hue**: same fate, different weight. Dropping the partner's mark entirely was
  the other candidate and is wrong for a different rule: the move decides that
  cell, and a step may not change a square it never marked.
- **Then leave the demoted mark's *background* alone** — the first cut also
  filtered the partner out of the evidence area, so an outline sat on bare
  board and read as loudly as the solid fill it was deferring to (owner
  reported it a second time). It was false as well as loud: the partner is
  inside the reach the sentence describes, so a shaded area that skipped it
  was not "how far the galaxy stretches". Filter **only the acted-on cell**
  out of its own evidence; a demotion that removes context makes the mark
  *more* prominent, not less.
- **A hairline is not a highlight.** `drawCircle` strokes one pixel wide, so
  the concentric-ring trick for weight (borrowed from the drag preview) was
  nearly invisible beside a solid cell fill. A **filled halo with the dot
  repainted on top** carries weight and keeps the dot's own colour, which the
  narration names ("the ringed *white* dot") — filling the dot itself would
  have cost the sentence its noun.

- **Cap the plan by what the player can *do*, not by what the deduction
  does.** Galaxies' plan cap counted *firings*, and a dot sitting inside its
  own cell forces that cell while the game refuses to draw an arrow there — a
  firing that re-derives on every recompute and can never be shown. On a 15x15
  twenty of them in a row spent the whole budget, and the hint told the player
  "No further move can be deduced" on a board with a hundred moves left
  (owner-reported; reproduced exactly, stalling at move 25 with *20 firings, 0
  showable*). Count the steps the plan will actually offer. The general shape:
  **any bound on a plan must be a bound on its output, because a bound on its
  input silently becomes a refusal.**
- **A search is not a technique, so it is not a hint (owner, 2026-08-11).**
  Galaxies shipped a rung for the top tier that hypothesised a cell's dot, ran
  the whole deduction fixpoint from it, and concluded from the one alternative
  that did not break the board. It was sound, it was narrated, it solved every
  Unreasonable board — and it was **removed**, because "I tried them all and
  this one survived" teaches nothing a player can carry to the next board. The
  hint now refuses there, and says so in a way the player can act on ("save a
  checkpoint, try one, undo if it breaks"). **A refusal that tells the truth
  beats a step that reveals an answer.** The line is the same one
  [`solver-and-generator.md`](./solver-and-generator.md) § "Check, Tactic,
  Search" draws for tier names — and what puts this rung on the far side of it
  is that the chain is **unbounded**: it ran the *whole* fixpoint and could
  settle dozens of cells, so there is no walk to show the player. A *bounded*
  chain is a Tactic and stays hintable; this was a Search.
- **A deduction the player can run with an existing affordance is worth its
  own rung.** Galaxies' cell→dot drag rings every dot a cell could legally
  join; when exactly one lights up, the cell is forced — a sound deduction the
  *player already has the gesture for*, and a shorter story than the reach
  argument that otherwise covers those cases. It is hint-only (the generator
  never calls it, so no board changes) and it fires on 6.8% of steps. Measure
  before believing the affordance and the deduction agree, though: the drag's
  predicate is deliberately more lenient than the solver's reach, so at a
  *reach* firing a drag would still ring 2–5 dots in 63% of cases — telling
  the player "only one dot lights up" there would have been false. Adding the
  rung is what made the claim true wherever it is made: after it, every
  remaining reach firing has ≥2 rings, measured.

Two smaller ones, both from reading real frames rather than the data:

- **Don't ring what you have just filled.** The action colour on a dot standing
  inside an action-coloured cell is invisible. That firing's narration names the
  dot by position instead ("the white dot between them"), and the renderer skips
  a ring on any cell it has filled — the words and the picture change together.
- **A cell that *holds* its dot shows no arrow**, so "these two cells point at
  different dots" sends the player hunting for an arrow that was never drawn.
  One word ("go with") covers both ways a cell can be settled.

### Placement animation as hint motion

A game with no upstream move animation (`animLength` 0) can still make
auto-hint read as motion with a short **geometric** placement animation:
`drawRect` takes a palette **index**, not RGB, so don't colour-tween — grow
the new colour from the cell centre over `animTime`, drawing the previous
colour beneath (animating cells bypass the cache via the Flip 255-sentinel
idiom). Return a small base `animLength` for a single-cell change (0 for bulk
`solve`/no-ops); because it's > 0 the midend stretches a hint-executed move to
the uniform `HINT_ANIM_S`, so each auto-hint step plays as a visible fill with
no frozen gap. Exemplar: Unruly's `animLength` + the grow branch in
[`unruly/render.ts`](../../src/games/unruly/render.ts).

### Marks on tiles vs marks on cells

**First ask: does the game mark moving pieces by *identity* or by
*position*?** A mark keyed by a stable piece identity (Sixteen/Fifteen
highlight tile *number N*, painted as the tile's own background wherever the
tile is drawn) rides any animation for free and cannot get this wrong — both
are structurally immune, pinned with mid-animation-frame tests
(`sixteen.test.ts`, `fifteen-render.test.ts`). The class below exists only
where pieces are **anonymous** (Netslide's wire-mask tiles) so the hint must
mark a *cell index* — and a cell index is board-relative, which is what goes
stale.

Owner-reported on Netslide (2026-07-14): the hint's marks sat correctly on the
still board, then **both jumped a cell the instant the slide began**, snapping
back when it ended. Two different bugs wearing one symptom:

- **A mark on a tile must ride the animation.** A moving tile is drawn
  *offset* from its grid cell, so a highlight painted as part of that tile
  travels with it — which is what you want, provided you paint it on **the
  right cell**. Which brings the trap:
- **Mid-animation, the displayed step's cell indices still refer to the board
  you have just left.** The midend advances the plan when the animation
  **ends** (`settleHint`), so while the hinted move plays, the displayed
  step's "tile" field names the cell the tile set *off from*. Paint there and
  you highlight whatever slid *into* the vacated cell — a different piece.
  Resolve the tile's cell in the board actually being drawn (Netslide:
  `landing` while this step's own move is animating, `tile` otherwise).
- **A mark on a cell must NOT ride the animation.** A destination/target
  outline marks a *cell*, and cells do not move. Drawing it inside the
  per-tile paint routine makes it slide along whenever the target cell lies on
  the moving line. Draw cell marks in their own pass **after** every tile, at
  the cell's own unshifted position; painting last also stops a tile sliding
  across the cell from covering the outline. Keep the mark's bit in the
  render-cache word even so — that is what repaints the tile *under* a stale
  outline once the hint moves on.

Test it at a **mid-animation frame**, which the tier-2/2.5 harness reaches
directly: call `redraw` with `(prev = pre-move state, current = post-move
state, animTime = ANIM_TIME / 2)` and assert the *drawn coordinates* of each
mark (seed:
[`netslide-hint.test.ts`](../../src/games/netslide/netslide-hint.test.ts)).
A snapshot alone will not catch this — the still frames either side of the
animation are correct, which is exactly why it survived to a player.

## Non-deductive (heuristic) hints

Not every game is deductive, and the two poles are **Untangle** (nothing to
say) and **Inertia** (a great deal to say). Decide which you are before
writing a line: ask *what does a move here cost the player if they get it
wrong, and can I check that claim?* If the answer is "nothing you could
name" — Untangle: no move is forced, you just want fewer crossings — a
narration would fabricate a non-sequitur, and the hint ships with an **empty
`explanation`** (owner-approved). If a move has a consequence you can
*verify*, narrate it.

**Untangle's pattern** — the floor, not the ceiling. Exemplar:
[`untangle/hint.ts`](../../src/games/untangle/hint.ts):

- **Objective, not deduction.** Pick the move that most improves a cheap
  scalar objective (edge-crossing pairs from `findCrossings`). A greedy loop
  on a *working copy* — take the best strictly-improving single move, apply,
  repeat until solved / no improvement / step cap — yields a multi-step plan
  auto-hint plays as a progressive cleanup.
- **Secondary objectives as a tie-break, not a second pass.** The plain
  barycentric step collapses the layout toward the centre; give each move
  several candidate targets and, among those with the *best primary score*,
  pick the best on a secondary objective (pairwise anti-clustering). Keep the
  primary strictly primary; verify with a same-board A/B that the enhanced
  heuristic stalls no more than the plain one. A tie-break beats an
  "untangle, then spread" second pass, since the puzzle ends the instant the
  primary hits zero — the final frame must already be spacious.
- **Refuse honestly.** `{ ok: false }` when solved, and also when *no* single
  move improves the objective — never a no-op or worsening move.
- **No `hintKeepTrack`.** The default `"off"` is correct: the greedy tail was
  computed for exact targets, so any deviation should drop the plan and
  recompute.
- **Highlight = the suggestion.** Carry a `{ vertex/cell, to }` highlight and
  draw the move (a `COL_HINT` line from piece to destination + a marker). Read
  the *source* from live state so an auto-hint slide shows the line shrink to
  nothing. **Fold the hint signature into the redraw early-out** — a manual
  hint moves no piece, so a full-frame game that early-outs on "nothing moved"
  would otherwise skip the hint.
- **Animation is often free.** A game that already animates its moves needs
  nothing extra: a hint-executed move rides that pipeline and the midend
  stretches it to `HINT_ANIM_S`.

**Walk to the known solution via `aux` when a local heuristic can't finish.**
A local objective can **stall at a local minimum** and look bad doing it. If
the game *knows* its solution — the generator's `aux`, the same value `solve`
uses — walking the player there is legitimate and robust. `hint(state, aux?)`
receives `aux` (present for generated games, absent for descriptive ids), so
prefer the `aux` plan when present and keep the heuristic as a fallback.
Untangle's `deduceAuxPlan`: match the closest symmetry so the motion is
minimal; rescale freely (affine maps preserve planarity) for a spacious
reveal; order the reveal greedily so intermediate crossings stay low; share
the `aux` parse + symmetry match with `solve`.

### A non-deductive game with plenty to say

An empty `explanation` is the *floor*. **Inertia**
([`inertia/hint.ts`](../../src/games/inertia/hint.ts)) is the exemplar of the
richer shape: no move is *forced* by logic, but every move has a concrete
consequence, and the thing beginners get wrong — *you don't choose where you
stop* — is exactly what a hint can say out loud. Its narration is organised as
**verified claims**, one branch per claim it can actually check: forced (every
other direction is a mine — a genuine necessity claim), collecting (what the
slide sweeps up, and what brings it to a halt), stranding (grabbing that gem
now would leave one unreachable *for ever* — the game's one provable verdict),
positioning (nothing reachable from here; here's what this sets up).

**Find the one thing your game can prove, and lead with it.** Inertia's is
`unreachableGems`: flood the move graph and report the gems no sequence of
moves even passes over. It proves in one direction only — a *reachable* gem
may still be uncollectable — which is precisely why it is safe to lean on:
when it speaks, it is right. It powers both the best narration in the game and
an honest refusal ("a gem can no longer be reached — undo") in place of the
solver's shrug.

### Hold a stable subgoal

Narrate every move by **the goal it serves**, and hold that goal *stable*
across the run of moves that serves it — derive it once, from the plan, and
carry it. Re-deriving it per step makes the banner flip-flop — "tile 8" →
"tile 7" → "tile 8" — and read as though the hint has lost the plot.
Fifteen's `index.ts` carries the scar in a comment; Inertia holds the gem its
leg is going for. The shared sliding-tile vocabulary
([`engine/hint-vocab.ts`](../../src/engine/hint-vocab.ts) `workingOn` +
`HINT_SETTING_UP`) keeps Fifteen and Sixteen reading as one voice.

When the game has no *name* for the goal — Inertia's gems are anonymous — the
board must carry the reference: mark it, and say "the marked gem". Watch the
cache: a mark drawn **on a tile** must be in that tile's diff key, even in a
game whose other overlays ride a sprite and are repainted every frame.

### Recompute-stable plans

The one that will bite you. A plan is recomputed from scratch whenever the
player goes their own way — so a *correct* plan is not enough, it must also be
**stable across recomputes**. Inertia's first cut narrated `solveRoute`'s
tour, a heuristic TSP: two tours grown from *adjacent* positions disagreed
about which gem to fetch first, and each opened by walking to the other's
position. Hint says north-east; player follows; hint now says south-west. For
ever, collecting nothing. `hint-resume.test.ts` caught it on the day Inertia
was added to its list — which is the argument for adding your game to that
list *first*, before polishing any narration.

The fix is a **monotone potential**: make each step provably shrink some
non-negative integer. Inertia goes for the *nearest* gem it can take, so every
move shortens the distance to a still-valid goal by one. Greedy-nearest is the
usual way to get this; if greedy is *unsafe* (Inertia's greedy grab can strand
the ball), filter the candidates by a safety check — play the leg out and
re-solve — rather than abandoning the monotonicity. Don't reach for "just
cache the plan": carrying a plan hides the instability while the player
follows it, and hands them the ping-pong the moment they don't.

### Read one plan out loud

The cheapest test there is, and it found the sharpest bug in Inertia's hint:
print a whole plan and read it as a player would. Step 19 promised *"slide
south-west, and one more slide sweeps it up"*; step 20 then said *"the route
comes at it from another side"* and went elsewhere. The plan was correct — the
*narration* had made a promise about "some slide exists" when the only claim
worth making is about **the plan's own next move**. A test that asserts "the
plan solves the board" is blind to this. Reading it takes a minute.

It earned its keep again on Netslide: the very first printed plan showed the
slide that *finishes the board* narrated as **"(setting up)"**. Every test was
green and the sentence was still a lie.

### Sliding-permutation games

Fifteen, Sixteen and Netslide are one family — a toroidal grid, a move slides
a whole line — and the search is shared:
[`engine/slide-planner.ts`](../../src/engine/slide-planner.ts). It owns the
bucket-queue A\*, the exact bidirectional search, the no-progress gate and the
partial-plan return. A game supplies its board, its finished board, its legal
moves, **a `heuristic(board)`**, and when to run the exact search. Exemplar:
[`netslide/hint.ts`](../../src/games/netslide/hint.ts).

Two lessons, both of which cost a full debugging cycle and generalise past
this family:

**(a) A distance measure must be recomputed against the board it is measuring
— never frozen.** Netslide's tiles are wire masks and many are *identical*, so
a tile has no single home. The obvious move is to settle it once — assign each
tile to the nearest cell wanting its wires, then measure total travel. It is
far cheaper and it is **wrong**, twice at once: *the search wanders* (the
assignment is only cheapest for the board it was computed on; measured: a plan
taking the wrong-cell count from 16 to 17 and carrying on), and *the narration
lies* (the slide that actually finishes the board delivers tiles to
mask-compatible cells the assignment never picked, so the winning move reads
"(setting up)"). The fix is to measure the board in front of you: a min-cost
matching **per node** (per mask group — tiny, allocation-free). And for the
narration, **read each tile's home off the plan**: simulate it, and a tile's
destination is where it ends up — true by construction.

**(b) The endgame needs an exact *shortest* plan, and it must be paid for in
the right place.** The monotone potential, in its sharpest form. Netslide's
heuristic plan looped — but *not* in a two-move ping-pong the
don't-undo-the-last-move guard could see (five slides of a 5-wide row are the
identity). The culprit is the endgame Sixteen calls a **swapped pair**: two
tiles want each other's cells, so the board reads as *two* cells from finished
while really being ten moves away, and every single slide looks worse. A
distance heuristic is helpless there by construction. Only an exact search
crosses it — and a plan that is *shortest* is also what stops a recomputed
plan cycling: its first move provably shortens the true distance home. Four
load-bearing properties, **each got wrong first**:

1. **It must actually return a shortest path.** Answering on the first meet
   mid-level gives a path that can be one move too long — and one move too
   long has *no* monotonicity. Finish the level; take the cheapest meet.
2. **Enforce the budget *inside* the level, not between levels.** One level
   expands to many times the frontier; a frontier near the cap balloons far
   past it before anyone looks again — a single hint was measured at 13.7 s
   against a cap it had long since blown through.
3. **Prune commuting moves.** Slides of the same axis commute, so a plain BFS
   generates every permutation of a run of row-slides. Restricting a same-axis
   run to non-decreasing index order keeps one representative and loses
   nothing.
4. **Fire it only when the heuristic is *helpless***
   (`exactSearch: { when: "no-progress" }`), then give it a *big* budget.
   Running it on every board costs its whole budget on every board it cannot
   reach (5×5 hints went from ~1 s to 4–5 s). It is affordable as a last
   resort precisely because **a plan, once found, is carried**: `hintKeepTrack`
   keeps it while the player follows it. Do not split the difference with a
   small search plus a bigger one in reserve — the big one opens a descent
   from ten moves out, the player takes one step, and the small one cannot
   sustain it from nine. **The search that opens a descent must be the one
   that finishes it.**

And a structural note: **the planner works on the board the player sees, not
on labelled pieces.** For a game with identical pieces that is *necessary* —
every slide on an odd-width torus is an even permutation, so a target that
distinguishes identical tiles can sit in a coset the board cannot reach, while
the finished *picture* is two moves away.

**Test it the way the midend plays it.** A followed hint keeps its plan, so
the honest walk is "ask, follow the whole plan, ask again"
(`netslide-hint.test.ts`), not "ask, take one move, throw the plan away" — the
latter demands a guarantee the app never needs and pays the worst cost on
every step. Keep the strict recompute-every-move walk for the small presets;
`hint-resume.test.ts` runs it for every game on the *first* preset only.

### Recover the answer from the board

Netslide has no solver: `solve` and `hint` both replay the generator's `aux`.
A game arriving as a **descriptive id** (a shared link, a bookmark, a save)
carries no `aux`, and both simply gave up: *"Solution not known for this
puzzle"*, on a board a player was staring at. Owner-reported, and not
acceptable — that is an ordinary way to play.

The answer was recoverable all along, because the board constrains it savagely
(`netslide/reconstruct.ts`): the tiles are the same tiles, the centre tile
cannot have moved, wires must meet and may not cross a barrier, and the
network is a tree. Fill the grid **most-hemmed-in cell first** — every placed
neighbour *forces* one of a tile's wires — and the search is under a
millisecond on most boards. Two lessons generalise:

- **The recovered answer is slide-invariant, and that is where its stability
  comes from.** It turns only on the tile multiset, the barriers and the
  centre tile — none of which a slide changes — so it is the *same* grid for
  the whole game. Free stability, by construction. The enumeration order must
  not depend on the current board: picking "the finished grid nearest to where
  the tiles are now" would hand the instability straight back.
- **Check the answer is *reachable*, and check your reachability test against
  brute force.** A slide of a line of length `k` is a `k`-cycle — even exactly
  when `k` is odd — so on a 3×3 every move is even and only *half* the
  arrangements exist at all. A repeated tile buys a parity flip for free —
  **but only if both copies are movable**; a duplicate that merely matches the
  *centre* tile buys nothing, which is the bug the brute-force check caught.
  Do not reason your way to a parity rule and trust it: enumerate a small
  board's entire reachable set and assert the predicate agrees.

## The cross-game guards

### A hint must resume from any position

The single most important behavioural guarantee, and the one most easily
missed: **a hint asked from a board the player reached by their own play must
still make progress and lead to a solved board** (as long as it's solvable
with no mistakes). In the app a self-played move drops any stored plan, so the
*next* hint **recomputes from the current state** — the plan-carrying
machinery does not save you. Three shipped bugs, all invisible to "the plan
solves the board" tests that only ran from the *empty* start:

- **Singles** — its deductive solver was a faithful port of upstream, which
  only solves from empty; its cascade propagates only from cells it changes
  *this run*, so resumed from the player's marks it stalled. Fix: prime the
  cascade from existing marks (`primeCascadeFromMarks`). Lesson: **a recording
  deductive solver written to run from empty is not automatically
  resumable** — seed it from the current decided cells.
- **Untangle** — its `aux`-walk re-suggested a *no-op* forever: a vertex sat
  on its target *pixel*, but the unrounded target jittered between recomputes
  by more than the fine tolerance. Fix: treat a vertex as placed when the move
  is a no-op **at the stored pixel resolution** (`isNoOpMove`). Lesson: **for
  a heuristic/`aux` hint whose target is recomputed each call, the recompute
  must converge** — never emit a move that doesn't change the board.
- **Inertia** — the ping-pong (§ "Recompute-stable plans").

This is enforced for **every** hint-bearing game by
[`hint-resume.test.ts`](../../src/engine/hint-resume.test.ts): it walks a
fresh board to solved one *freshly-recomputed* hint at a time (apply only
`steps[0]`, recompute, repeat), asserting a hint never gives up before solved.

**Enrollment is one line, and it covers every cross-game guard at once.** The
guards all iterate the shared list in
[`testing/hint-games.ts`](../../src/engine/testing/hint-games.ts) — add the
new game there **as part of the change** and it is covered by
`hint-resume.test.ts` (resume, purity, no-op-free plans, Latin naked-single
honesty), [`hint-overlay.test.ts`](../../src/engine/hint-overlay.test.ts)
(the overlay reaches the render cache — the paint-twice class), and
[`hint-quality.test.ts`](../../src/engine/hint-quality.test.ts) (voice,
length, show-something). A per-game "plan solves from empty" test is *not* a
substitute.

### The step budget

The resume test catches a hint that *gives up* or whose move-walk *loops*.
What it can't catch cheaply is a hang **inside one `hint()` call** — a "repeat
until no progress" fixpoint where a rule reports progress without changing the
board never returns, and the only backstop is a wall-clock timeout (slow,
opaque, load-sensitive). Tick a
[`stepBudget`](../../src/engine/step-budget.ts) once per fixpoint iteration so
a non-terminating loop throws a labelled error in milliseconds. Make it
**opt-in on the hint path** — gate it on the recorder/hint signal the function
already carries — so the generator runs the same fixpoint *unguarded and
byte-for-byte unchanged* (a budget that fired during generate-and-check would
break board generation — never guard that path). The limit
(`DEFAULT_HINT_STEP_LIMIT`) is generous: an honest fixpoint converges in ~one
iteration per cell, so the guard only catches a future regression. Exemplars:
`applyRules` in `range/solver.ts` (gated on `rec`), `deduceForcedEdges` in
`palisade/solver.ts` (a hint-only function, so unconditional). Search-based
hints (the slide planners, Flood's BFS) are bounded by their visited sets and
need no budget.

If your solver/hint is an ordered rung ladder, don't hand-roll the loop: run
it through
[`runDeductionFixpoint`](../../src/engine/deduction-fixpoint.ts)
([`solver-and-generator.md`](./solver-and-generator.md)), which ticks the
budget for you and takes it only on the recording path — pass
`budget: stepBudget(...)` on the hint call, omit it on the generator call.

### Stale plans and refreshHintStep

A plan is computed **once** and *kept* while the player follows it. A followed
move can have side effects the plan didn't author — most concretely, **the
player toggling a preference mid-solve**: a Towers plan built with auto-pencil
*off* bakes explicit dup-strike legs, but if the player then turns auto-pencil
*on*, a placement silently strikes those same candidates, so the stored strike
step names notes that are **already gone**. The midend re-displaying the
stored step without re-checking it ⇒ a hint telling the player to remove
something already removed (owner-reported, `fix-stale-hint-step`). The engine
guarantee is **validate-at-display**: implement
`Game.refreshHintStep(step, state)` — return the step with dead marks dropped
(rebuild `highlights` to match; return the SAME object when nothing changed),
or `null` when it is fully resolved. The `Midend` calls it before every
(re-)display and advances past / recomputes resolved steps. Towers' is ~20
lines. **Every candidate-elimination game with note-clearing side effects
needs one.** Cross-game coverage: `hint-resume.test.ts` asserts no plan step
is ever a no-op when reached (the intrinsic form);
`towers-stale-hint.test.ts` drives the real `Midend` through an auto-pencil
flip (the side-effect form).

## Verifying a hint in-process

Use the tier-2.5 render-scenario harness
([`render-scenario.ts`](../../src/engine/testing/render-scenario.ts)):
`renderScenario({ game, id, moves?, showHint?, hintUntil? })` drives a real
`Midend` to the hint frame (walk a multi-step plan with `hintUntil`), then
assert targeted ops (`COL_HINT` present, clues still drawn) **plus**
`toMatchSnapshot`. Seed: `palisade-render-scenario.test.ts` reaches the
`equivalentEdges` frame the browser harness couldn't. To reach a specific
deduction without its desc, do a fixed-seed scan (loop ids, keep the first
whose `result.hint` matches). See [`testing.md`](./testing.md) for the tier
definitions.

Two testing gotchas worth internalising:

- **A narration substring can match more than one deduction.** Predicating
  `hintUntil` on a phrase is handy, but pick a phrase *unique to that
  deduction*: several Singles narrations share generic words, so a loose
  predicate stops on the wrong frame. Predicate on a phrase only one reason
  uses ("can't be adjacent" for `adjBlack`). If the strings get retuned,
  re-pick.
- **The easiest rule pre-empts hand-crafted boards.** A solver that tries
  techniques easiest-first means a crafted board often fires a *different*
  rule than intended (an alternating Unruly row is a three-in-a-row deduction,
  not a count completion). Craft for the per-cell techniques, but validate
  **grouping** on a *generated* board (scan a few seeds for a
  `continuesPrevious` leg, then check it shares its predecessor's firing). See
  `unruly-hint.test.ts`.

## Candidate-elimination games

A game whose signature techniques **narrow a cell's set of possible values**
rather than directly forcing one teaches in **pencil-notes** terms: the hint
sets and strikes notes, and a placement is the moment a cell's notes collapse
to one. All the general narration rules, the engine mechanics and the
stale-plan guard apply; this section is the pencil-note-*specific* machinery.
Exemplar: [`towers/`](../../src/games/towers/) +
[`engine/latin.ts`](../../src/engine/latin.ts).

### The shared candidate-hint machinery

**The reusable mechanics live in
[`engine/candidate-hint.ts`](../../src/engine/candidate-hint.ts)** — import
them rather than copying: the pure plan helpers (`nakedSingle`,
`anyEmptyLacksNotes`, `firstUnreflectedPlaceIndex`, `nextStrike` —
whole-firing, dup-excluded — `nextPlace`, `joinNums`) and the generic
`keepCandidateHintTrack` / `refreshCandidateHintStep` over the shared
`CandidateMove` / `CandidateHighlights`. A game wires
`hintKeepTrack`/`refreshHintStep` as one-line wrappers passing
`state.pencil`/`state.grid` + the grid order.

**A cell's *uniqueness regions* are one definition per game — `regionsOf`.**
Three sites used to recompute "which cells share a uniqueness constraint with
`(x, y)`, and which still note value `n`?" — the placement classifier, the
bulk obvious-clean opening, and the placement dup-cull. Write a single
per-game `regionsOf(state, x, y)` returning the cell's tagged uniqueness
regions and feed all three from it, so they can never disagree. Row/column
games import the shared `rowColRegions(x, y, w)` from
[`latin-hint.ts`](../../src/engine/latin-hint.ts); Solo writes its own
(`[row, col, block, diag0, diag1]`). The bulk opening is
`emitObviousCleanStep(steps, grid, pencil, w, regionsOf, text)`; the placement
cull is `regionDuplicateMarks(...)` — all de-dup a cell reachable via two
regions. **A Keen cage is *not* a uniqueness region** — it is an arithmetic
constraint a digit may legally repeat under; `regionsOf` returns row+col only,
and the cage logic stays its own deduction.

**What stays in the game — and why no shared driver.** The `buildSteps` *walk*
is per-game on purpose: the games diverge in step order, strike-split policy
(by-height / by-target-cell / by-cell / intersect-single — dictated by what
the narration names singular) and journey-continuation tracking. A
`buildCandidatePlan` driver was evaluated and **deliberately not built** — it
would be a callback shell over a ~6-line loop skeleton. The reason union is
per-game; narration is *mostly* per-game — except:

**The `hint()` entry and the generic-Latin narration arms are shared.** (a)
The `Game.hint` *entry* — completed-board refusal, `findMistakes` refusal,
`autoPencil ?? false` default, empty-plan refusal, the three refusal
strings — is `candidateHint(state, ui, findMistakes, buildSteps)`; every
candidate game's `hint` is a one-line call to it. (b) The *generic Latin
reason* narration arms (`single` / `hiddenSingle` / `forcedSingle` / `dup` /
`set` / `forcing`) read byte-identically across the **row/column** Latin
games, so `narrateLatinReason(reason, ns)` in `latin-hint.ts` owns them; Keen
and Unequal narrate their game-specific arms then
`default: return narrateLatinReason(reason, ns)`. **Solo and Towers keep
their own `narrate`** — Solo's generic arms name "row, column **and block**",
and Towers narrates in "height" vocabulary with a single value not an `ns`
list; forcing either onto the shared narrator would mean per-game overrides
for half its arms, which reads worse than the duplication. The rule that
held: extract the entry/arms that are *verbatim* across ≥2 games, leave the
ones that diverge local. (Normative:
[`ts-engine`](../../openspec/specs/ts-engine/spec.md) "A shared narrator for
generic Latin deduction reasons" — a recorded local-narrate decision is a
conforming outcome.)

**…and the *value vocabulary* is a parameter**, which brought Group and Salad
onto the shared arms: `narrateLatinReason(reason, ns, vocab?)` takes an
optional `LatinVocab { noun, value(n), cell? }`; omit it and you get plain
numbers, byte-identical to before (the guardrail: Keen's and Unequal's
assertions pass unedited). The shared `dup` arm picks **"a"/"an" by the
rendered value** — which Group's local copy had reworded around ("already
contain a" reads as an article for element `a`) and which also quietly fixed
"a 8" for the digit games. One vocabulary cannot express a *per-arm*
difference, so Towers and Solo still decline. Measured verdict, not assumed:
extract when the only difference is the vocabulary; decline when an arm's
*shape* differs.

**The move *dialect* is a parameter — don't rename a game's moves to fit.**
`keepCandidateHintTrack` / `refreshCandidateHintStep` used to read a
hard-coded `type` discriminator and a `1 << n` pencil bit. That is the Latin
family's dialect, not a property of the pattern: Crossing discriminates on
`kind` and stores candidate `n` at bit `n − 1`; Group's `set`/`pencil` carry a
*cell list*. Renaming either is not an option — the save format replays the
**move log**, so a discriminator rename breaks every existing save — so both
helpers take an optional `CandidateMoveAdapter<M>`: `read(m)` maps a game move
onto the canonical `CandidateMove` (or `null` for "not one of these, so
off-plan"), `strike(marks)` builds a strike in the game's own shape, an
optional `bit(n)` supplies the mask encoding. Omit it and the Latin games'
call sites are untouched. Crossing wires both hooks in ~10 lines; Group's
hand-rolled ~78-line copy was deleted for a 12-line adapter (its tests passing
unedited proved the extraction behaviour-preserving).

**The note *encoding* is a parameter too — and only the half that had a
consumer.** The mark helpers take an optional
`NoteEncoding { bit?(n), values? }`: `values` is the highest candidate a cell
may note when that is *shorter* than the grid order (Salad notes `nums`
symbols plus one "might be empty" mark on an `order`-strided grid).
**`nextStrike`/`nextPlace`/`firstUnreflectedPlaceIndex` also take a `placed`
grid distinct from `grid`** — "which cells are already decided" versus "which
cells can still take notes". They coincide everywhere but Salad, where a
square the player settles with an *empty-square marker* stays blank in `grid`
for ever — judging by `grid` alone leaves that op permanently unreflected and
walls off every strike recorded after it. If your game can decide a cell
without writing a value into the grid, you need this.

**Not every candidate game fits, and Undead is the recorded no-go.** The
shared helpers assume `0`-empty, `{x, y}` cells on a `w`-strided grid, and a
plain `{...highlights, targets, marks}` shrink. Undead breaks all three at
once (`MON_NONE = 7` empty sentinel, `{cell, monster}` marks over a 1-D
border-ringed board, a highlight shrink that re-projects cell → x/y). It was
re-evaluated when the adapter landed and **declined**: fitting it would mean
an adapter method that rebuilds the highlights, at which point the game
supplies the logic and the "helper keeps all the logic" property is gone. A
documented non-migration is a fine outcome; don't contort a game onto the
shared shape.

### The recorder and the soundness boundary

- **Record off the candidate cube.** A Latin-style solver already carries
  `cube[cubepos(x,y,n)]` ("can `n` still go here?"). Thread a
  `DeductionRecorder` through the generic deductions **and** the game's
  user-solvers so each *candidate cleared* (`elim`) and each *cell placed*
  (`place`) is recorded in solver order with its reason + premise. Gate every
  reason allocation and the strike-record on `solver.recorder` so the
  generator/solve path is byte-for-byte unchanged (verify with the
  differential). A `group` id, bumped once per top-level deduction attempt,
  ties one firing's records together — beware bumping per *pass* not per
  *firing* (§ "Recording the deduction").
- **The soundness boundary is non-negotiable: seed the working cube from the
  placed grid only — never the player's notes.** A note can be wrong (crossing
  out the correct height is exactly what Check-&-Save flags), so feeding it
  back as a fact would let the solver "prove" nonsense. The notes are used
  only to *diff* (which already-true elimination to surface next, what is
  done) and to *render*. Run the recording solver at the board's own
  difficulty, **deductive only** (cap below recursion — a guess isn't a
  teachable note strike).

### Persist, populate, and the moves

- **Persist + populate.** Express the recorded script against the live notes
  as steps: (1) a conditional **populate** (only when some empty cell lacks
  notes) reusing the existing fill-all (`pencilAll`) move, so the hint's start
  state is the fill-all button the player already knows; (2) **eliminate**
  journeys; (3) **place** steps. Skip any operation already reflected on the
  board so a fresh recompute resumes from any mid-game position.
- **Open with a bulk obvious-candidate clean — one step, the Mark-all second
  press.** The recording solver enables its recorder *after* the cube is
  seeded from the givens (seeding isn't a teachable deduction) — but
  `pencilAll` fills *every* candidate, so after populate a cell can show a
  value the grid-seeded cube already excluded, and the recorded script never
  strikes it. Don't bake it into a "smart" populate (keep `pencilAll` a plain
  fill so the player sees the same notes Mark-all gives). Instead emit **one**
  bulk cleanup step via the shared `emitObviousCleanStep(...)`: it strikes
  every pencilled value already placed in a region as one `pencilStrike`,
  flagged `continuesPrevious` when it follows the populate fill and standalone
  otherwise. Gate it to fire **once** and run it *as a step in the walk* — not
  inside `ensurePopulated` — so it also cleans a **pre-noted board**: a clean
  tucked inside `ensurePopulated` never runs when notes already exist,
  silently regressing that case. Exemplar: the one-shot call in
  [`unequal/index.ts`](../../src/games/unequal/index.ts). *Gotcha:* the clean
  step is a multi-cell **and** multi-digit setup step, not a deductive
  strike — exempt it (by its narration) from any per-firing test asserting "a
  strike's marks share one cell or one digit" or "every step uses the
  necessity voice."
- **`pencilStrike` — the one-firing-one-step note move.** A `set { pencil }`
  toggle is *one* cell and *not idempotent* (a re-applied strike would re-add
  the candidate). So add a move that **clears** a list of candidate bits
  atomically (`{ type: "pencilStrike"; marks }`): one firing forcing several
  strikes is one multi-cell step, idempotent, resume-safe. Populate stays on
  `pencilAll`; placement stays on the real `set`. `hintKeepTrack` treats a
  pencil toggle that *clears* a subset of the step's marks as `onTrack`
  (shrink in place) / `completed`, a placement of the hinted value as
  `completed`, else `off`.
- **A placement's own row/column eliminations continue its journey.** Record
  those as `dup` strikes and emit them as a `continuesPrevious` strike step
  after the placement ("a 5 now sits in this row and column, so strike it from
  these notes"). On recompute after a real placement they bake into the cube
  and drop out — so the resume walk sees mostly placements, while auto-hint
  still teaches the cleanup.
- **Notes are first-class markings in `findMistakes`.** Flag an empty cell
  whose **non-empty** notes *exclude* the solution value (`kind: "note"`);
  notes with merely *extra* candidates are ordinary mid-solve state.
  Check-&-Save inherits the rejection through its existing `findMistakes`
  gate.

### Re-derive a placement's why

The shared `latin.ts` records every forced placement under one reason,
`{ kind: "single" }` — but its `elim` fires on **three** slice kinds: a *cell*
slice (a genuine **naked single**), a *row* slice and a *column* slice (a
**hidden single** — digit `n` fits only one cell of that line, while the cell
itself still shows several candidates). Narrating all of them as "every other
number has been ruled out in this cell" is **wrong for a hidden single**: the
player is looking at a cell that visibly still has 1, 2, 3, 4 pencilled
(owner-flagged on Keen, 2026-06-23). A hidden single must instead name its
line — *"In this row, 3 can go in only this cell — every other cell in the row
has ruled it out — so it must be 3"* — and shade the whole row/column as
evidence, so the player can *see* that no other cell takes the digit.

**Re-derive the placement reason from the working board at emit time; never
trust the recorded `single`.** The shared classifier
[`engine/latin-hint.ts`](../../src/engine/latin-hint.ts)
`classifyPlacement` returns **naked** (the cell's notes are exactly `{n}`),
**hidden** (no other *empty* cell of the row — or column — still has `n`;
only empty cells compete), or **forced** (neither — the notes lag behind a
deeper set/forcing deduction, so narrate honestly without claiming the cell's
notes are down to one, rather than lie); `singlePlacementReason` maps those to
the `single` / `hiddenSingle` / `forcedSingle` reasons every Latin game's
narration and evidence shading share. `classifyPlacementInRegions` is the
same classifier over arbitrary regions — pass the regions your game reasons
over. Reclassify **only** when the recorded reason is `single` — Towers'
clue-driven placements keep their own reasons.

Shared, not per-game: this shipped for Towers, Unequal and Keen together
(`fix-latin-hidden-single-narration`) — a probe had mis-narrated 37/96 Towers
and 13/82 Unequal placements as naked singles; all three now route through the
one classifier and read 0. Guards: `keen-hint.test.ts` "narrates a hidden
single by its line", `latin-hint.test.ts`, and `hint-resume.test.ts` "a
Latin-family placement never falsely claims a naked single".

### Solve the way a human does

The first cut emitted the raw recorded script and buried the player in trivial
"strike this number from the rest of its row/column" steps. The fixes, all
owner-driven and worth copying:

- **An auto-pencil preference (default on)** that, on a real placement,
  strikes the placed value from the rest of its row and column automatically.
  Bake the decision into the *move* at `interpretMove` time
  (`set { autoElim }` read off the Ui pref) so `executeMove` stays pure and
  replay is deterministic. When on, the hint folds those trivial eliminations
  into the placement (no step); when off, it teaches them as an explicit
  `continuesPrevious` strike. The hint needs the pref, so `Game.hint` takes
  the optional third `ui` arg — `const autoClean = ui?.autoPencil ?? true`.
- **A naked-single-first plan builder.** Don't express the recorded script
  verbatim — walk a *working copy* of the board (notes + grid) and at each
  step take the most natural move: (1) a **naked single** (an empty cell whose
  working notes have collapsed to one candidate — on a mistake-free board that
  candidate is the truth, so placing it is sound and is what a person does
  next); else (2) the next **clue elimination** (the deduction worth
  teaching); else (3) a forced **placement**. Re-record from the working grid
  after each placement; advance through strikes by filtering to still-live
  marks. **Gotcha that hid every clue deduction:** the recording solver
  commits the facing-clue placement *first*, so a naive "strikes before the
  first recorded placement" window is empty. Fix: the strike window extends to
  the first *unreflected* placement (one whose cell isn't yet on the working
  grid). Exemplar: `buildSteps` / `firstUnreflectedPlaceIndex` in
  [`towers/index.ts`](../../src/games/towers/index.ts).
- **Surface a *whole-line forcing* as one ordered placement journey, before
  populate; pencil in notes lazily.** A clue at an extreme value can force a
  whole line (or a single cell) outright, needing *no* notes. Emitting that as
  the recorded per-cell elimination cascade buries an obvious move; detect it
  directly in the plan builder and emit the forced cells as one journey
  (first leg unflagged, the rest `continuesPrevious`, continuation legs
  narrated tersely). Because these placements need no notes, make **populate
  lazy**: do the note-free forced placements first and only emit the fill-all
  step when an *elimination* first needs something to cross out. Detect off
  `state.clues`, not the recording solver, so the generate/solve path stays
  byte-identical. Exemplar: `nextExtremeClueLine` + the lazy `ensurePopulated`
  in [`towers/index.ts`](../../src/games/towers/index.ts); guard:
  `towers-hint.test.ts` "populates before the first elimination".
- **The split axis is dictated by what the narration names singular.** A clue
  firing that rules out *different* heights in different cells must not be one
  `pencilStrike` step: the narration names a single height ("a tower of height
  5…") but the cell would show 4 *and* 5 crossed out — a visible
  contradiction. Group a firing's marks **by struck height**, one step per
  height, further heights flagged `continuesPrevious` (Towers). Conversely a
  **region/cage** firing whose premise is the whole region (Keen's per-cage
  candidate pruning) splits **by cell**, one leg each, the shaded area — the
  whole cage — constant across the journey; a value *list* within a leg is
  fine because the cage narration never names a single value ("No way to make
  this cage multiply to 120 leaves room for 1, 2 and 3 in this cell").
  Exemplars: `nextClueStrike` in
  [`towers/index.ts`](../../src/games/towers/index.ts),
  `emitStrikeJourney` in [`keen/index.ts`](../../src/games/keen/index.ts);
  guards: `towers-hint.test.ts` "a strike step never mixes heights",
  `keen-hint.test.ts` "a cage-strike step's marks all lie in one cell".

### A non-Latin candidate game (Undead)

Undead is the first candidate-elimination hint that does **not** ride
`engine/latin.ts`: its candidate state is the per-cell monster bitmask, and
its deductions are mirror-bouncing **sightline** clues + monster **totals**.
Everything else transfers unchanged — the soundness boundary, `pencilStrike`,
the naked-single-first walk with lazy populate, `refreshHintStep`. What's
specific:

- **Write a parallel recorder, don't bolt one onto the grader.**
  `recordUndeadDeductions(common, placed)` in
  [`undead/solver.ts`](../../src/games/undead/solver.ts) is *separate code*
  from the grading/solve path, reusing the shared building blocks. Because the
  generate/solve/`findMistakes` paths never call it, the differential stays
  byte-identical *by construction* — no recorder flag to thread. Prefer this
  to an `if (recorder)`-gated grader when the deduction logic is cheap to
  re-run.
- **One pass = one firing = one `group`.** Each ladder pass returns after its
  first firing and bumps the group; the recorder loops to a fixpoint. The
  planner splits a **sightline** firing **by cell** into a `continuesPrevious`
  journey (the whole bounce path stays shaded, each leg names one cell), while
  a **total** firing is one step striking one monster across every cell.
- **Two deduction kinds beyond the cube games.** `total` (a monster type fully
  placed ⇒ struck everywhere) and its dual `onlyCells` (exactly as many cells
  can still hold a type as remain ⇒ each is forced) come straight from the
  global count equality. Surface them **honestly** as their own narrated
  steps — folding a total into a sightline narration would state a premise
  that doesn't discriminate the move.
- **The plan is deductive-only — no solution-walk.** The strengthened ladder
  solves every shipped tier guess-free, so `buildSteps` always has a real
  deduction ([`solver-and-generator.md`](./solver-and-generator.md)
  § "Guess-free generation" carries the Undead strengthening story).

### Narrate by what survives (Subsets)

Subsets is another parallel-recorder game, but its cube is **doubly hidden**:
the player sees per-*letter* tri-state marks, never the `cube[cell][value]` of
candidate *set-values* the solver reasons over. Three of its six rules
eliminate set-values the player can't see and have no letter move to attach
to, so they are **not steps** — they set up a collapse whose firing is the
narratable letter conclusion. The trap is narrating a collapse by its
**evidence** (the eliminated candidates): measured, that set is large (avg
4.4, max 14), so enumerating it is both unreadable and dishonestly precise.

The resolution three rounds of owner review converged on — **one slot per
step, and make the counting *visible***:

1. **One slot per step, structured attention → deduction → action.** Decide
   one letter per step with its own string ("The highlighted set contains C —
   so mark C present"), never a lumped "mark A and C present and clear B" nor
   a shared "for the same reason". A cell becoming a set is a **sub-goal
   journey** (`continuesPrevious` legs), but each leg's string is about *its
   own* slot — the reconciliation of "one slot at a time" with "one deduction
   = one journey".
2. **The set→placement spotlight — build it as a real player aid, and reuse it
   in hints.** A Subsets set must be placed exactly once, so "where can this
   set still go?" is the counting made visible. Compute candidate cells
   **shallowly from the board** (`candidateCells` — no solver, no solution
   leak), light them `COL_HINT_SPOT`, and make the tally band clickable so
   the player can ask it directly. Because the aid is shallow, a
   **hidden-single** hint ("this set can go nowhere but here") uses the *same*
   computation and its "only this cell" claim is verifiable against the same
   spotlight.
3. **Prefer the crisp counting form, and measure.** The deduction has a dual:
   a *hidden single* ("this set fits only one cell" — spotlight-shaped) vs a
   collapse ("this cell fits only one set" — tally-shaped). Try the hidden
   single **before** the collapse. Measured: it moved ≈38% of counting
   deductions (319 of ~830) into the verifiable spotlight form, with
   completeness unchanged. *Measure the shift* — the shallow test is weaker
   than the cube's, so the win isn't obvious a priori.

**The general lesson:** when a candidate-elimination collapse reads as "trust
me, only this fits", look for the **dual counting deduction** ("this value has
one place left"), which is usually cleaner to show, and give the game a
**reference-aid affordance** that renders where a value can go — then both the
player and the hint reason from the same visible picture. Where the collapse
still fires, narrate it per-slot against the surviving set(s) highlighted in
the tally.

Refinements worth copying to any counting game with a reference aid: (a)
**make the aid two-way** — value→locations *and* location→values, over one
shared "can this go here?" predicate (`whyCantPlace`), as one
mutually-exclusive UI focus, suppressed while a hint is on screen; (b) **when
a collapse still fires, name one *excluded* competitor and why**
(`pickExclusion`) — prefer the concrete "already placed elsewhere" reason and
highlight the blocker so "the highlighted cell" has a referent; (c)
**distinguish "is placed here" from "could go here"** with a separate colour;
(d) a **location→values inspect affordance must be a dedicated, touch-sized,
inspect-only control**, not a side effect of an editing tap. And a cross-game
narration note that bit here: **a continuation leg must name its referent in
full** ("the highlighted set"), never a bare "them"/"it", and signal the
sub-goal it continues ("Still filling this cell — …").

Three Subsets-specific mechanics: the recorder's `cube` **and** its
elimination-provenance array must both persist across fixpoint iterations
(refilling the provenance mis-attributes a collapse's evidence); a firing
decides a cell's letters as one journey with per-slot legs; and the tally-set
tint plus the `HINT_SPOT` bit live in the game's overlay arrays and must each
join their cache-miss test. Exemplars:
[`subsets/solver.ts`](../../src/games/subsets/solver.ts),
[`subsets/index.ts`](../../src/games/subsets/index.ts),
[`subsets/render.ts`](../../src/games/subsets/render.ts).

### Thread the recorder (Solo)

Solo is the first Latin-family hint whose solver is **bespoke** (a faithful
port of `solo.c`, not `engine/latin.ts`). Two ways exist to record off a
bespoke solver: thread a gated recorder through the live solver (this
section), or write a *parallel* recorder (Undead). **Pick by whether the
deduction logic is cheap to re-run.** Undead's was, so a separate recorder
kept the differential byte-identical by construction. Solo's is **not** —
~1200 lines with mutating killer cages, four region types and a recursion
tier — so re-deriving it would risk diverging the byte-match. Thread instead,
and lean on the gate:

- **Gate every behavioural change on `this.recorder`, enabled only *after* the
  givens are placed.** A nullable `recorder` field (promoted from a
  `pendingRecorder` stash right after the given-clue placement loop) means the
  generator/solve path runs the original code untouched (the existing
  differential is the regression guard, and it MUST stay green). Seeding the
  cube from the givens is *not* a teachable deduction, so recording starts
  after it — the soundness boundary enforced by *when* the recorder turns on.
- **The "return per firing" gate is usually already there.** Solo's main loop
  already restarts after the first firing of most techniques — bump `group`
  once at the top of the loop and every record of one firing shares it for
  free. The only loops that *accumulate* across several regions before
  continuing are the killer min/max and sums passes; make those `break` after
  the first cage **when `this.recorder` is set** (gated, so the generate path
  still sweeps every cage byte-identically).
- **Record placements only; recompute dup strikes in the plan.** A `place`
  records just the placement op — the region copies it rules out are
  recomputed from the working notes via the shared `regionDuplicateMarks` +
  the bulk `emitObviousCleanStep` opening over Solo's `regionsOf`.
- **More region types ⇒ a richer reason union + a game-local placement
  re-deriver.** Solo reasons over row, column, sub-block (rectangular or
  jigsaw) and two diagonals, so it carries its own `regionsOf` and a
  `soloPlacementReason` running `classifyPlacementInRegions` over it. The
  re-derive rule still holds — only the **killer** placements keep their
  recorded reason, because the working board can't re-derive a cage-sum
  forcing.
- **The split axis follows the premise, and Solo has both shapes.** An
  `intersect` firing crosses a *single digit* from several cells (premise
  names the digit) → one multi-cell step; a cage or `set` firing strikes a
  *cell's* candidates (premise names the region) → split by cell into a
  `continuesPrevious` journey.
- **Killer is heavy on the hint path.** A from-empty killer resume is ~0.8 s /
  ~120 moves — fine for a single hint, slow-but-correct in a killer-walking
  test. Do **not** give such a test its own timeout ([`testing.md`](./testing.md)
  § "Seed-deterministic, never clock-gated"). `hint-resume.test.ts` only walks Solo's *trivial* first
  preset; variant breadth lives in `solo-hint.test.ts`.

### Placement-first letter games (Group)

Group is the Latin family's odd corner, and each way it differs changes one
decision:

- **Placement-first, not elimination-first.** Group's signature deductions —
  associativity (`(a·b)·c = a·(b·c)` forces the fourth product) and the
  identity fill — are **placements**, not candidate culls. So the plan leads
  with placements and only populates when an *elimination* is the next thing
  to teach. The gate that keeps this honest is
  `firstUnreflectedPlaceIndex(ops, wGrid, w) === 0`: when a placement is the
  solver's *immediate* next deduction, emit it directly (no populate).
  **Don't gate populate on `nextStrike` returning a strike** — `nextStrike`
  only counts a strike whose candidate is *present in the notes*, so with no
  notes yet it returns null and you deadlock. That chicken-and-egg was the one
  real bug in the port; the fix is the `firstUnreflectedPlaceIndex` peek,
  which reads solver order without needing notes.
- **The identity fill is one firing → one multi-leg journey.** Learning the
  identity forces its whole row and column at once; emit those as
  `continuesPrevious` legs with the revealing cell shaded on every leg, not
  `2w−1` disjoint hints.
- **Letter values ⇒ the vocabulary parameter.** Group's values are the
  elements a–z; it rides `narrateLatinReason`'s `LatinVocab` (see the shared
  machinery above). Watch the a/an trap: an element `a` after "There's
  already…" reads as the article.
- **The game's move shape needn't match `CandidateMove`.** Group's interactive
  `set`/`pencil` carry a *cell list* (for its diagonal multifill) and it had
  no fill-all move. The hint **reuses the pure readers/mechanics** but **emits
  placements as the native `set {cells:[{x,y}], n}`** (so a player following a
  hint produces the exact move the plan expects), adding only
  `pencilAll`/`pencilStrike` for the hint-execution path. Contorting the
  game's moves to fit the shared contract is the wrong trade — reuse the
  mechanics, keep the meaning; the `CandidateMoveAdapter` makes both hooks
  one-line delegations over a 12-line adapter.
- **Re-adding a dropped play move for the hint is fine (with owner
  sign-off).** The populate step wants a fill-all a player can follow by hand,
  so upstream's `'M'` (mark-all) was re-added as a real `pencilAll` move. Its
  elements being letters, only **uppercase `'M'` (77)** is intercepted
  (lowercase `'m'` is element 13 for `w ≥ 13`).

### Non-uniform value sets (Salad)

Salad is the first candidate-elimination game where several solver values
collapse onto **one** player note, and the first where a deduction's
conclusion is often not a placement at all. Five points a game shaped like it
will hit:

1. **Find where the game's values *are* uniform, and put the collapse only at
   the edge.** Salad fakes "some squares stay empty" with a complete
   order-`o` square whose symbols above `nums` are holes — so **in the cube
   the holes are perfectly Latin**, and only the *player-facing projection* is
   many-to-one. That observation is what kept the abstraction small: a
   proposed `valuesFor(bit)` collapse arm found **no consumer**, because a
   shared helper only ever asks "which note bit does this *placed* value
   occupy?" — and no hole symbol is ever placed on the player's grid. **Look
   for the uniform view before generalising the helper.**
2. **A conclusion that writes no value into the grid is a fourth move
   shape.** Salad settles a square's *emptiness* with a marker
   (`set { value: "cross" | "circle" }`) — neither a placement nor a strike.
   The `CandidateMoveAdapter` reads it as `null` (⇒ off-plan) and the game's
   `hintKeepTrack` / `refreshHintStep` judge it in ~12 lines *before*
   delegating — in particular `refreshHintStep` must resolve a marker step by
   reading the **marker array**, because the shared placement arm waits for
   `grid[cell] !== 0`, which for a cross never comes.
3. **Re-derive a marker's *why* from the visible board, cheapest first — and
   measure how often the honest weak arm fires.** The plan re-derives marker
   conclusions in order — a line's *counts* first (visible and countable),
   then a note collapse, and only then a `forcedCross`/`forcedCircle` arm. A
   60-board sweep showed the weak arms firing **zero** times — so the plan is
   entirely concrete techniques in practice, with the weak arms kept as the
   backstop that stops a step ever being wordless (their wording pinned by a
   direct `narrate` unit test, since the walk never reaches them). **Do the
   sweep; "there is a fallback" and "the fallback is what the player sees" are
   very different situations.**
4. **Only record the deduction whose *premise* you could not otherwise
   recover.** Salad threads the recorder through the border scan **alone** —
   the one deduction whose premise (which clue, how far its symbol reaches,
   what shortened it) the working board can't reconstruct. Sync/count need no
   recorder at all. That kept the gated surface to one function, and the
   28-fixture byte-match differential green unedited.
5. **The "group per firing, not per pass" trap bites hard here, and a
   *highlight* test is what caught it.** Salad's whole rung is one
   `usersolvers[0]` call doing sync + all `4·order` clue scans + the counts,
   so one group covered every clue on the board — and a hint step gathered
   strikes from unrelated clues under one clue's narration. The fix is the
   gated early return at *both* levels, per clue and per sub-deduction. It was
   invisible in the narration and in "does the plan solve the board"; what
   surfaced it was a tier-1 assertion that **a step's targets lie inside the
   area it shades**. Assert the premise/conclusion geometry, not just the
   words.

Also of note: Salad's "placed grid" for the soundness boundary is `grid`
**plus** `holes` — a cross or ball is a real entry that Check & Save flags
when wrong, so the working cube may assume it. Pencil notes still never seed
it. Exemplars: [`salad/hint.ts`](../../src/games/salad/hint.ts),
[`salad/solver.ts`](../../src/games/salad/solver.ts) (the gated border
recorder).

### A populate step never resets notes

**A populate step must never *reset* the player's notes — and the shared
mark-all move used to (owner-reported 2026-07-29).** The opener reused the
game's mark-all move, which reset every fillable cell to the full candidate
set. Fine for a *player* to ask for; destructive for a *hint* to do on their
behalf: on any board with some pencilled cells and some blank ones it threw
away deductions already made — and the "populate is needed" latch (*some* cell
lacks notes) meant one blank cell triggered a whole-board reset.

The fix, collection-wide (owner-directed 2026-07-30): an **additive**
`pencilAll` (fill only cells with no mark yet), used by the opener *and* by
the Mark-all press via the shared `adaptiveMarkAll`, so a press only ever adds
or removes; the resetting move stays in the union for replay of saved move
logs and is documented as unreachable from input. **The working copy must
mirror the additive fill exactly**, or the plan goes on to teach strikes on
candidates the player had already crossed out. All ten games offering the
press fill additively, as does the shared `lazyPopulate`; guarded by
`engine/mark-all.test.ts`, which every such game joins with one row. The guard
was **mutation-checked against all ten** — worth knowing because its *first*
cut passed against the old behaviour, since a fill that resets writes back
exactly what was there unless some cell is genuinely **narrowed**. A test for
this class must narrow a cell by hand.

**Known follow-up, not a defect:** Salad has no auto-pencil preference, so —
like Group — its plan teaches every placement's row/column note cull as an
explicit `continuesPrevious` strike. If Salad ever gains the pref, those legs
fold away for free (the walk already honours `autoClean`).

## Probe before trusting a diagnosis

Twice in one hint session a plausible mechanism diagnosis ("the second leg
reads as off-plan", "the plan is being dropped") was wrong and dissolved by a
~20-line probe test. When a hint misbehaves, write the smallest probe that
observes the actual `activeHintStep()`/state rather than reasoning forward
from the suspected cause. See "Hint-UX session" in
[`AGENTS.md`](../../AGENTS.md).
