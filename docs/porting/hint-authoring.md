# Hint Authoring Guide

> **v2 (2026-06-22) — restructured live wiki.** Codified from the Sixteen,
> Palisade, Range, Singles, Filling, Unruly and Towers hints. The genuinely
> *general* narration/engine lessons that the first version buried inside the Towers
> candidate-elimination section have been lifted into the shared sections (§2.6,
> §2.7, §3, §7.3); §9 keeps only the pencil-note-specific mechanics. **Update this
> file whenever you work on a hint** — a new one, or iterating an existing one — and
> hit something it didn't tell you, got wrong, or could say better; that edit is part
> of "done," in the same change. See `add-game-dev-guides`.
>
> **This guide is the *how*. The *what* lives in the specs — links are
> authoritative.** Anti-drift rule: state a normative rule briefly + link it; point
> at an exemplar rather than pasting code.

Authoritative spec: the Hint System requirements in
[`ts-engine`](../../openspec/specs/ts-engine/spec.md). Quality bar:
[`palisade`](../../openspec/specs/palisade/spec.md) + the "Hint quality bar
(exemplar: Palisade)" section of [`AGENTS.md`](../../AGENTS.md). **Exemplars to
read:** Palisade (grouped multi-leg deductions),
[`src/native/games/range/`](../../src/native/games/range/) (`solver.ts` recording →
`index.ts` `hint`/`hintKeepTrack` → `render.ts` highlight), and
[`src/native/games/towers/`](../../src/native/games/towers/) (candidate-elimination,
§9).

Explained hints are a **core deliberate-divergence product value** of this fork, not
a nicety. Upstream's `'h'` returns one next move with no explanation; that is below
the bar. Adding a hint to a ported game is its **own openspec change**
(`add-<game>-hint`), parity-gated like a port.

---

## 1. The quality bar (Palisade exemplar) — meet all four

The full statement is in [`AGENTS.md`](../../AGENTS.md); the bar a `hint()` must
clear:

1. **Explain *why* the move is forced, not just *what* to do.** Narrate the actual
   deduction ("both edges border the same region, so they share a fate; walling both
   exceeds clue 2 — so neither is a wall"). If a narration's conclusion doesn't
   follow from its own stated premises, the deductive coupling is missing — surface
   it. A good hint *teaches the technique*.
2. **One deduction firing = one journey.** A single deduction that forces several
   moves is emitted as one multi-leg `HintStep` journey (continuation legs flagged
   `continuesPrevious`), so it reads and auto-plays as one coherent hint, not N
   disjoint ones.
3. **Equivalent moves share a colour.** Moves that share a fate render identically
   (Palisade: all `COL_HINT`); a distinct colour reads as "different roles" and
   misleads.
4. **Pace auto-hint uniformly.** `AUTO_HINT_STEP_MS` (1s) per step in
   [`src/puzzle/puzzle.ts`](../../src/puzzle/puzzle.ts), floored by the move's own
   animation so animated moves still play out fully.
5. **One deductive step per hint; externalize the rest onto the board.** A hint must
   land *at a glance* — at most one inferential step's worth of reasoning. Multi-step
   reasoning (including single-level forcing) is spread across **gradual board marks**
   — one mark per step, the accumulated marks carrying the state — never crammed into
   one dense sentence. See §1B.

---

## 1A. Guess-free generation — the hint's precondition

An explained hint can exist only if the board is **solvable by pure deduction**. A
hint that falls back on the known solution or a backtracking search isn't teaching a
*why* — it's revealing the answer (quality-bar rule 1 has nothing to narrate). So
this is a **generation policy**, not merely a hint policy (owner decision,
2026-06-24):

- **Every difficulty tier a logic puzzle ships MUST be solvable by its deductive
  solver with zero guessing**, enforced at *generation* time — a board is accepted
  only if the deductive solver (no recursion/backtracking) solves it uniquely. Range
  and Unequal already do this (`range/solver.ts` keeps a board "only if uniquely
  solvable without any guessing"; `unequal/generator.ts:155` caps assembly below the
  recursive level).
- **The one sanctioned exception is a tier explicitly named "Unreasonable".** An
  Unreasonable preset MAY require guess-and-backtrack, and its hint is correspondingly
  allowed to be non-deductive on those boards. Towers and Keen ship a `6×6
  Unreasonable` preset on this basis (`towers/index.ts:115`, `keen/index.ts:110`).
  **No other tier name** (Easy/Normal/Hard/Tricky/Extreme/…) may require guessing —
  "Extreme" must still be pure deduction (forcing chains *are* deduction; recursion is
  not — see §1A note below).
- **Movement / objective games are out of scope.** Fifteen, Sixteen, Flood and
  Untangle are always solvable and carry no deductive "why", so their hints are
  imperative/heuristic by design (§6), and Untangle's `aux`-walk is the sanctioned
  non-deductive form. The guess-free policy governs *logic puzzles* only.

**The deduction/guessing line:** *single-level forcing* — tentatively fix one cell's
candidate, run pure propagation, and eliminate the candidate if it forces an immediate
contradiction — is **deduction** (it's how the Latin family's `Extreme` tier works,
`DIFF_EXTREME` forcing chains). *Nested* speculation (assume A, then within that assume
B, …) is **recursion** = guessing = Unreasonable-only.

**Practical consequence when porting/hinting a deductive game:** before writing the
hint, confirm the generator can't emit a board the deductive solver can't crack at the
shipped tiers. If it can, you have three moves: gate generation to deduction-only,
**strengthen the deductive solver so the hard tier survives guess-free**, or move the
guessing boards under an explicitly-named Unreasonable tier. The normative home for
this rule is a generation-policy spec requirement (to be added); this note is the
followable summary.

**Worked example — strengthening a non-Latin solver (Undead,
`strengthen-undead-deduction`).** Undead originally graded difficulty by *how much
brute force a board needs* — its solver had only two rungs (per-sightline
arc-consistency, then full backtracking), so most Normal/Tricky boards needed
guessing. The fix was the *strengthen* move, and it generalises to any non-Latin
candidate game (Undead doesn't ride `engine/latin.ts`): build the two intermediate
**deductive** rungs between arc-consistency and the brute-force oracle —

- **Exact counting** (`undead/solver.ts` `countingPass`): when a global tally is an
  equality (Undead's three monster totals sum to the cell count), apply Hall-type
  deductions — a type whose full count is placed is struck everywhere; a type whose
  candidate cells equal its remaining need forces them all; too few candidate cells is
  a contradiction.
- **Depth-1 forcing** (`forcingPass`): hypothesise one cell's candidate, run the
  arc-consistency + counting fixpoint, eliminate the candidate on contradiction. This
  is *deduction* (the `DIFF_EXTREME` technique); the inner fixpoint **never forces**,
  which is the deduction/recursion line above.

Then **re-grade by which rung is needed** (Easy = arc-consistency, Normal = counting,
Tricky = forcing) and accept a board only when the deductive ladder solves it uniquely
with zero recursion — verified independently against the brute-force oracle. Two
lessons worth carrying: (1) **cap the ladder at the tier's rung when grading** —
forcing is the expensive rung, and a board the tier can't use is rejected anyway, so
don't pay for forcing while grading Easy/Normal (`solveDeductive`'s `maxRung` cut 7×7
Normal generation ~6×). (2) **Measure the recursion-only residual before deciding to
ship an Unreasonable tier** — Undead's came out *exactly zero* (every uniquely-solvable
board is cracked by the ladder; the boards it can't solve are precisely the non-unique
ones the uniqueness oracle rejects anyway), so no Unreasonable tier was needed. Don't
add a guess-allowed tier on a hunch; the data may say the ladder already suffices.

---

## 1B. Cognitive load — one deductive step per hint; externalize the rest onto the board

Owner principle (2026-06-26): **every hint a non-`Unreasonable` tier shows must be
understandable at a glance — at most one inferential step of reasoning.** A hint the
player has to *work through* (holding a chain of "…and therefore… and therefore…") has
failed, even when it's correct. The product value is a hint that lands immediately, not
a proof to parse.

The corollary is the mechanism: **when a deduction's justification spans more than one
inferential step, externalize the chain as gradual marking on the board — one mark per
step — instead of cramming it into one dense sentence.** The board's accumulated marks
(pencil notes, for candidate-elimination games — §9) carry the state, so the player
never holds the chain in their head; each individual hint then narrates a single,
self-evident step. This is exactly the §9 pattern (populate → strike one candidate with
a one-line reason → … → place a naked single): each strike is one step, the marks are
the externalised memory.

### 1B.1 The forcing boundary (read before hinting a hard tier)

*Single-level forcing* — "suppose X here; propagate; it hits a contradiction; so not
X" — is sound deduction (§1A), but it is **not** one glance-able step. Arc-consistency
and counting already catch every *direct*, single-constraint contradiction, so a
contradiction that *survives* to the forcing rung necessarily comes from **combining
several constraints** (the hypothesis forces another cell, which then breaks a
clue/count elsewhere). A forcing deduction is therefore intrinsically a short chain.
Two compliant options, one non-option:

- **Externalize it as a guided "what-if" walk** — tentative marks the player watches
  accumulate ("suppose vampire here → then this cell must be a ghost → now the left
  clue of 2 can't be met → so cross vampire out here"), each leg one glance-able step,
  only the final strike real. Buildable on the existing multi-leg journey
  (`continuesPrevious`) + pencil-strike machinery, but it introduces *tentative*
  (hypothetical) marks — a visual state distinct from real notes.
- **Keep the shipped tiers direct-only** — arc-consistency + counting (or
  positional + set for Latin), and don't ship forcing-tier boards at a
  non-`Unreasonable` difficulty. Simpler hints; a less-hard top tier.
- **Not allowed:** compress the forcing chain into a single "if X then contradiction"
  sentence and call it one step. It reads as a glance-able hint but isn't one — it asks
  the player to run the propagation in their head. (Existing forcing/`Extreme`-tier
  hints in the Latin family should be reviewed against this when next touched.)

---

## 2. Writing the narration

The narration *is* the product value, so most of this guide's hard-won lessons are
about prose. The arc every nontrivial hint follows:

> **indication** (the spotted pattern, named in board terms and generalisable) →
> **reasoning** (why that pattern forces the move) → **conclusion** (the action, in
> the necessity voice of §2.1).

### 2.1 Action-clause voice: necessity for deductions, imperative for moves

A hint exists to tell the player **the next action to take**, so the clause that
states the conclusion (the "so …" tail) must read as a decision, not a description.
The collection has **two houses**, chosen by whether the move is *logically forced*
(owner-decided 2026-06-19):

- **Deductive games** (Singles, Range, Filling, Unruly, Palisade, Towers — the move
  is *forced* by the rules): state the conclusion with a **modal of necessity** —
  `must be` / `can only be` / `can't be` / `must stay` / `must cross out`. **Never** a
  static state-of-being verb (`is` / `are` / `stays` / `it's`): "so it **stays**
  white" and "this cell **is** black" describe a continuing state instead of a forced
  decision and read as flat — rewrite to "so it **must be** white". The necessity is
  the *teaching*. Keep the modal in the **conclusion clause only** — *premise* clauses
  still state facts plainly ("One of these matching neighbours **stays** white …, so
  every other copy **must be** shaded").
- **Movement / objective games** (Fifteen, Sixteen, Flood — the suggested move is
  *not* a logical necessity, just the recommended next action): use the **imperative**
  ("slide it into place", "move it to column 5", "fill with red"). A necessity modal
  would be wrong. Untangle's heuristic hint carries an empty explanation (§6) and is
  exempt entirely.

Pick the house by the *nature of the move*, not the genre: a deductive game whose hint
ever recommends a non-forced move uses the imperative for that step. Palisade shows
the houses can co-exist in one string — its necessity premise ("Clue c reaches its
count only if every remaining edge is a wall") can carry an imperative tail ("draw
them all"), because the forced-ness is already explicit in the premise. Cheap guard: a
hint test asserting the conclusion contains a modal and **not** a bare "stays/is" (as
the Singles `corner4` test does). When a game has two conclusion *kinds* — a strike vs
a placement (§9) — both stay in the necessity house ("must cross out the 5" / "can only
be 5"); the guard regex just admits both phrasings.

### 2.2 Lead with the indication — teach the pattern, don't just prove it

**Every nontrivial hint SHALL open by naming the *indication* — the recognisable board
pattern that triggered the deduction — before any reasoning.** The player should come
away able to *spot this pattern themselves next time*, not merely convinced that this
one instance is valid (owner-directed, 2026-06-19).

A hint is **pedagogy, not a terse textbook proof**. A proof that jumps straight to
"shading either of these would force a contradiction, so both are white" leaves
understanding *as an exercise to the reader*. Good teaching states **what you noticed**
first. So the **signal comes first**, phrased as a pattern the player can learn to
recognise ("there's a pair of 5s in one column and a pair of 1s in the next"), not
buried mid-sentence or left implicit in the highlight.

Worked example — Singles `offset`. Even after the concrete-values fixes it still
*opened on the conclusion* (*"Shading either of these two squares would force…"*): a
valid proof, but the player never learns **what to look for**. Leading with the
indication fixes it: *"There's a pair of 5s in one column and a pair of 1s in the next,
lined up so that shading either of these two squares would force one of the 5s and one
of the 1s to be shaded next to each other — and shaded squares can't touch. So both
must be white."* Now the first clause is a teachable recognition cue (two equal-pairs in neighbouring
lines). (Read the orientation off `reason.quad` so "column"/"row" is concrete; `singles-hint.test.ts`
"offset" asserts it opens `/^There's a pair of \d+s in one (column|row)/`.)

What counts as "nontrivial": anything past a single local rule application. The
simplest cascade hints satisfy this for free because their *signal is the move* —
Singles `adjBlack` opens *"These squares touch a shaded square…"*, `sameLine` *"These
squares share a line with the ringed white square…"*. The ones that need care are the
multi-element deductions (offset, the corners, the sandwich/pair pattern). When in
doubt, lead with the indication; it is never wrong to.

### 2.3 Refer to a square by the value it shows — never a bare pronoun

**In a number puzzle the square's value is its name and its locator, so use it**
(owner-directed, 2026-06-20). Two failure modes, the second subtler:

1. A hint must not *open* on a dangling *"It"* / *"They"* / *"This is…"* with no noun.
   The owner flagged Singles `sameLine` opening *"It shares a line with the ringed
   white square…"*: the *"It"* has no antecedent (the banner is the player's first
   sight of this sentence), so the reader must hunt the highlight before the sentence
   parses.
2. The fix is **not** *"This square shares a line…"* either — *"this square"* is still
   generic. Name the value: *"This 3 shares a line with the ringed white 3, which
   already uses that number — so this copy must be shaded."* Now both squares are
   identified by sight, and the duplicate the deduction turns on is *visible in the
   wording*. The reference is free — the deduction already knows its target cell(s),
   so read the digit off the state (`numAt(targets[0])`).

**Pronouns are allowed only to avoid restating the *same* value when the referent is
obvious** — *"This 3 … so it must be shaded"* is fine, and better than re-saying "the
3". When one firing forces **several
squares of differing values**, list them (`joinNums` → *"These squares — 3, 5 and 2 —
touch a shaded square…"*) rather than collapsing to *"these squares"*; when they
**share** a value, name it once and pluralise (*"These 3s share a line…"*). For a square
that is *empty* when acted on (Filling's target, Range's forced mark) there is no value
to name — anchor it on a concrete neighbour (*"The shaded region of N has only this one
empty square to grow into"*). Exemplar: every branch of `narrate` in
[`singles/index.ts`](../../src/native/games/singles/index.ts) names a value.

The same lesson, learned the hard way on the multi-link deductions:

- **Concrete values beat role words on a subtle deduction.** Distinct colours alone
  weren't enough for Singles' corner case — even ambered and shaded, the owner couldn't
  follow *"shading this square would seal off the highlighted corner…"*. What unblocked
  it was making the narration **value-aware** (read the numbers off the board in
  `narrate(reason, targets, state)`) and ordering it as the **proof-by-contradiction
  arc the deduction is**: *the signal that fired it → the move we're ruling out → the
  consequence → the deduction*. Result, opening on the spotted pattern (§2.2): *"A
  touching pair of 3s sits at the corner; one of them must be shaded. Shading this 5
  would then force the 3 beside the corner 4 shaded as well, leaving the corner boxed in
  on both sides — so the 5 must stay white."* Watch dangling pronouns mid-sentence too:
  an early cut ended "…shaded as well, **trapping it**" — "it" read as the 3, not the
  corner; name the referent ("leaving **the corner** boxed in").
- **Sweep abstract pronouns out of the easy cases too.** Singles' `offset` once read
  *"Whichever paired square stays white forces the one across from it shaded, so both
  squares beside it must be white."* — grammatical, but a wall of deixis with not one
  concrete reference. Name both values (`reason.quad` via `numAt`). Heuristic: a
  narration with *zero* digits/coordinates and three or more "this/that/it/the one"
  pronouns is almost certainly improvable.
- **Concrete *value* and concrete *geometry* are different bars — a value-aware
  narration can still lie about the layout.** A first cut of the offset fix said *"Two
  6s and two 4s **overlap, offset by a square**…"* — concrete values, but geometrically
  **false**: `solveOffsetpair` pairs equal numbers *anywhere along a line*, so the two
  6s can sit at opposite ends of a column. **Describe only what's invariant** (the
  forced adjacency) and delete words that assume a tight figure ("overlap", "between
  them", "side by side"); lean on the highlight for *where*. When you add concrete
  values, re-check that every spatial word is true for the *general* firing — read the
  solver's loop bounds, don't assume locality.

Two drafting gotchas from interpolating values: (a) **dodge the a/an trap** — `a ${n}`
becomes "a 8"; write articleless ("one of the 6s", "two of the Ns") or branch on the
digit. (b) **guard the equal-value branch** — when two groups coincide (`n === m`), "Two
4s and two 4s …" reads broken, so special-case it ("two of the 4s").

### 2.4 The premise must single out the conclusion

**A narration whose stated premise doesn't discriminate *this* move from another is a
bug, even when the move is right.** Caught on Singles' all-equal 2×2 corner (`corner4`):
its first cut read "the only non-touching pair that leaves one white per line is this
diagonal" — but *both* diagonals of an all-equal 2×2 leave one white per line, so the
premise doesn't justify shading *this* diagonal. The real reason is connectivity (at a
grid corner the corner cell's only neighbours are its two sides, so shading the other
diagonal strands it — the box-in argument `corner3` already uses). Lesson: when two
candidate moves both satisfy the stated premise, you're describing the wrong reason —
find the premise that actually discriminates and say *that*. Cheap guard: assert the discriminating
phrase present and the false one absent (`singles-hint.test.ts` "corner4" checks
`not.toContain("one white per line")`).

### 2.5 Keep the narration terse

Explaining *why* is the bar, but say it in one sentence, not three (owner-directed).
Filling's first cut spelled out the full deduction ("…without exceeding N cells — every
other neighbour would overshoot. So it must extend here: a N.") and read as a wall of
text; the owner trimmed it to *"The shaded region of N has only this one empty square to
grow into."* — same logical content, a third the length. Lean on the picture (the shaded
area carries the premise) and on implied values ("the region of N" already tells the
player to write N). **Don't repeat the number** — say "the region of N" once and let
"these squares" / "a 1" carry the rest. When a narration feels long, cut to the single
premise the highlight doesn't already show.

### 2.6 Conclude with the *action* the move actually makes — never a stronger one

The conclusion clause must match the move's *type* (the §2.4 lesson, sharpened on
Towers, owner-flagged 2026-06-22):

- **An elimination step says only which candidates are *ruled out* and why** — conclude
  with the strike action naming the value (*"…so we must cross out the ${n}."*), not the
  abstract *"…so it can't go here"* repeated across every technique (jarring when it
  recurs string after string). A **placement** step keeps the positive necessity voice
  (*"it can only be ${n}"*, *"height ${n} can only sit here"*). The struck height is
  free to interpolate — the step already knows its marks (`marks[0].n`). Exemplar:
  `narrate` in [`towers/index.ts`](../../src/native/games/towers/index.ts).
- **Never imply a placement the rule doesn't establish.** Towers' line-full rule strikes
  the *shortest* heights from the cell nearest the clue — but a first cut said the cell
  *"must hold the tallest remaining one"*, which reads as a forced placement. It isn't
  (nearest ∈ {3,4} when the 1 and 2 are struck, not pinned to 4). If a narration claims
  a unique value, the step must actually *place* it. Cross-check: does the conclusion
  match the move type (`pencilStrike` ⇒ "rule out", `set` ⇒ "must be")?

### 2.7 Sanity-read a clue/count narration at its degenerate extremes

A phrase tuned for the typical case can read as nonsense at a boundary value
(owner-flagged 2026-06-22). Towers' lower-bound text said *"clue ${c} can see only ${c}
towers"* — fine for a small clue, self-contradictory when `c` equals the grid width (the
clue then sees *all* towers, so "only" is wrong); its line-full text described *"an
increasing run one tower short of its count"* — a run of *zero* at `c = 1`. Phrase counts
so they hold across the whole range (*"sees exactly ${c}"*, *"all but one of its towers
deeper in the line"*). **When a narration interpolates a clue/count, re-read it at the
min and max that value can take.**

---

## 3. Engine mechanics (already built)

The `Game` hooks and the `Midend` lifecycle are in
[`ts-engine`](../../openspec/specs/ts-engine/spec.md); the implementation is
[`src/native/engine/midend.ts`](../../src/native/engine/midend.ts). A game implements:

- **`hint(state, aux?, ui?): HintResult`** — return `{ ok: false, error }` to refuse
  (board solved, or has mistakes — a hint off a contradictory board misleads), else
  `{ ok: true, steps }`. Each `HintStep` carries `move` (the forced move), `explanation`
  (the *why* string), and `highlights` (game-specific render data). Compute the **whole
  remaining plan** once; the midend advances steps as the player follows or auto-play
  executes them. `aux` (the generator's solution, when present) enables the §6 aux-walk.
  The optional third `ui` arg lets a game read a relevant preference (Towers'
  auto-pencil, §9) — the midend passes `this.ui`; games that don't need it ignore it.
- **`hintKeepTrack(move, step, state): "completed" | "onTrack" | "off"`** — `"completed"`
  when the player's move matches the step's intent (advance the plan), `"onTrack"` for
  partial progress on a multi-cell step (§5.5), else `"off"` (drop the plan to
  recompute). **`hintKeepTrack` is handed the PRE-move state.** The midend classifies a
  move against the plan *before* applying it (`Midend.processInput`), so `state` is the
  board the move is about to change — a game that needs the *result* applies the move
  itself (Sixteen's slide does `executeMove(state, m)`). For a pencil toggle this means
  "the candidate is present now" ⇒ the toggle *clears* it (the right strike to follow);
  an *absent* candidate ⇒ the toggle would re-add it ⇒ off-plan. (Towers once had this
  inverted, testing post-move state the production path never passes, so following a
  strike silently dropped the plan — guard against a unit test that fabricates a timing
  the midend doesn't use.)
- **`continuesPrevious`** on a `HintStep` — the midend keeps a multi-leg journey
  displayed through its legs; only an unflagged next step waits to be asked for. The
  mechanism is generic; a game just emits grouped steps.
- **`refreshHintStep(step, state)`** — validate-at-display (see §7.3). The midend calls
  it before every (re-)display so a kept plan step that has gone stale is repaired or
  dropped. Needed by candidate-elimination games with note-clearing side effects.

### Recording the deduction

**Inline (Range).** The solver's rules already drive the board to a solution; thread an
*optional* `record(cell, value, reason)` callback through them (built only on the hint
path) plus a `deduceHintPlan(...)` that runs the deduction from the player's current
marks and returns the ordered forced moves, each tagged with the rule + premise.
Exemplar: [`range/solver.ts`](../../src/native/games/range/solver.ts) +
[`range/index.ts`](../../src/native/games/range/index.ts).

**Through an op-queue + cascade (Singles).** A solver shaped like Singles' (`singles.c`)
**queues** ops and a separate processor **applies** them while **cascading** new ops (a
new black queues "circle my neighbours"; a new circle queues "blacken my line-mates").
The cause of a cell is known at two sites — the rule that queued it and the apply step
that queued a follow-on. So: **attach the reason to the queued op, and record each op
when it actually changes a flag** inside the apply/cascade loop; the cascade builds its
own reason at the apply site (`adjBlack` → the new black; `sameLine` → the new circle).
Put the recorder + a group counter on the existing `SolverState` so it threads
everywhere for free, and **gate every reason allocation on it** (`if (ss.records)`) so
the generator's hot solve path is byte-for-byte unchanged — verify with the C
differential. Exemplar: [`singles/solver.ts`](../../src/native/games/singles/solver.ts).

**A Latin candidate cube *is* a notes representation; record off it.** A Latin-style
solver carries `cube[cubepos(x,y,n)]` ("can `n` still go here?"); thread a recorder
through the generic deductions + the game's user-solvers (§9). The same recorder-gating
discipline applies.

**Group by a firing id, not by adjacency.** When one firing forces several cells
(Singles' four-in-a-corner, an offset-pair's two whites, a doubles pair shading *all*
other copies, the cascade itself), give that firing's ops a shared `group` id and **merge
records by group into one multi-cell `HintStep`** (quality-bar rule 2). Records of one
firing are queued consecutively, so a first-seen-order bucket keeps the plan's order. A
genuine *chain* (a black → neighbours white → those blacken line-mates → …) stays
*separate* steps — each link is its own teachable local deduction, like Range.

**One `group` must cover exactly one firing — beware a shared `group` counter that bumps
per *pass*, not per *firing*.** If the recording solver bumps the group once per solver
invocation (Towers/the shared `latin` solver bump it once per difficulty level per
fixpoint pass) but a single routine loops over *every* clue/line and records eliminations
for several of them before returning, all those distinct firings land under one group.
The hint then narrates `group[0]`'s clue while struck marks from *other* clues' lines
bleed into the same step (the Towers "the 5 from the next column got pulled into it" bug,
2026-06-21). Fix: make each clue/line routine **`return` as soon as it fires on the
recording path** so one pass records one firing (Towers `solverEasy` already returned per
clue for `lineFull`; its `lowerBound` block didn't — the fix added
`if (solver.recorder && ret) return ret;`, gated on the recorder so the generator's
accumulate-across-clues solve path stays byte-identical to C). Guard it: assert every
struck mark of a standalone clue-strike step lies within that step's shaded `area` (its
clue's line of sight) — `towers-hint.test.ts` "clue-strike marks never bleed outside the
narrated clue's line".

---

## 4. Refusal couples to the mistake overlay + banner

A hint refused because the board is wrong lights up the same overlay **Check & Save**
uses — `Midend.computeHintPlan` calls `findMistakes()` on refusal. So a game with both
`hint` and `findMistakes` gets "fix the highlighted mistakes first" *with the cells
actually highlighted* for free.

The refusal message reaches the player via the banner on **both** paths — manual Hint and
Auto-Hint route the returned string into the transient banner
([`src/puzzle/puzzle.ts`](../../src/puzzle/puzzle.ts) `hint()` → `setAutoHintMessage`). A
hint-carrying game with `wantsStatusbar = false` (e.g. Range) still shows and clears the
banner. (Both behaviours are codified as requirements added by `add-range-hint`, merging
into the Hint System requirement in
[`ts-engine`](../../openspec/specs/ts-engine/spec.md) on archive.)

---

## 5. Rendering the hint

Render the hint in `redraw` from the displayed `HintStep` (the midend hands it in). The
base conventions: the forced cell in `COL_HINT`, equivalent moves in the **same** colour,
the hint bits folded into the per-tile `Int32Array` cache (§3.2 of the
[port playbook](./game-port-playbook.md)). Exemplar:
[`range/render.ts`](../../src/native/games/range/render.ts).

### 5.1 A hint *highlights* where to act — it never performs the move

**The displayed (manual) hint must only mark the cell(s) to act on — paint the target
`COL_HINT` blue — and must NOT pre-render the move's result** (owner-directed,
2026-06-20). Do not fill the cell with the black square / circle / colour / digit the
move would place. Two reasons, both flagged on Singles: a pre-filled mark (a) **obscures
the cell's own content** (Singles painted a target black, hiding the `1` printed there,
so the hint read as nonsense against its own narration), and (b) **reads as already-done**
when applying the move is still the player's job. Keep the cell's number/state visible
under the blue highlight and let the **narration** say *which* mark to place (this is why
a forced-black and forced-white target now look identical). The move is performed for real
only in **animation mode**: auto-hint calls `executeHint`, which applies the move, so the
cell then renders as the actual mark and (for fill games) plays its placement animation
(§5.7).

Per-game status: Singles, Range, Unruly had their per-cell mark previews deleted to meet
this. Filling already complied — its target is a *mild* `COL_HINT` highlight with **no
digit**. Palisade is a different modality: its forced *edge* is recoloured `COL_HINT`
blue, which marks where to draw a wall without obscuring any cell content. **Any new
game's hint follows this rule.**

The toolbar **Hint button alternates show/apply** (`add-hint-button-stepper`): the first
press *shows* the step (highlight-only), and a second press *with nothing done in between*
calls `executeHint(true)` to apply that one step in slow motion and then **stop** — the
plan is hidden (not previewed) and the banner reads "Hint applied". The *next* press shows
the next step, so the rhythm is show → apply → show → apply (any intervening action
re-arms the show). Applying is deliberately terminal: most players want one nudge, not to
be raced through the solution (contrast Auto-Hint, which *does* roll continuously via
`executeHint()` with no `hideAfter`). This is a `Puzzle`-level orchestration of the two
midend primitives and needs **nothing from a game's `hint()`**; it does mean a player
experiences the plan at **per-step granularity**, so the same "one deduction firing = one
journey" grouping (rule 2) that makes auto-hint read well is also what makes the stepper
read well.

### 5.2 Show the evidence as an *area*, not one premise cell

This is the visual half of quality-bar rule 1. A single shaded premise cell tells the
player *that* there's a reason; shading the whole area the deduction reasons over lets
them **see** it. Palisade shades the connected **region** a clue/size argument is about;
Range shades a clue's **line of sight**, the **run it must reach along**, or the
**non-black cells a cut would isolate** — `COL_HINT_CELL` (a light blue), with the action
cell still the lone `COL_HINT` blue. Make the words and the picture agree: if the narration
says "the shaded run", a run must actually be shaded. Exemplar: `buildHighlights` in
[`range/index.ts`](../../src/native/games/range/index.ts).

**Compute each step's area against the board as that step fires, not the original.** The
plan is computed once, but a frozen area goes stale: a `reach` run the player has since
filled white wouldn't be shaded. Range threads the solver's working grid through each
recorded move (`HintMove.grid` in
[`range/solver.ts`](../../src/native/games/range/solver.ts) — a `dup.slice()` at record
time, this move and all prior deductions applied) and builds the highlight from *that*
snapshot, so the shaded run grows as the player follows. (The snapshot has the move
applied, so filter the target out of its own area.)

**Invariant worth a test: every step carries visible evidence** — a non-empty area or a
ringed premise, never a bare conclusion (the "visible evidence" test in
[`range-hint.test.ts`](../../src/native/games/range/range-hint.test.ts)). It caught a
`connect` step whose cut-vertex neighbours were all still *undecided* (a known-white filter
left the area empty): the connectivity rule treats every non-black cell as white, so shade
non-black neighbours, not only marked-white ones.

### 5.3 Distinct *roles* get distinct colours — the element-type legend

Quality-bar rule 3 ("equivalent moves share a colour") has a converse: **premise cells that
play *different* roles must NOT share a colour**, or the highlight lies. Singles'
2×2-corner deduction is the cautionary tale — its first cut shaded three cells one colour
and called them all "two corner squares", but those three cells are *two* roles: the
**matching pair** (cells that share a number) and the **corner being protected** (a
different cell that gets sealed off). The fix: a third highlight role with its own colour
(`COL_HINT_STRAND`, amber) for the protected corner, disjoint from the shaded
`COL_HINT_CELL` matching pair and the `COL_HINT` target. Carry the roles as separate lists
on the hint type and apply them with a clear precedence in `redraw` (target > strand >
evidence); test the roles are **disjoint**. Exemplar: `SinglesHint` + `strandOf`/`narrate`
in [`singles/index.ts`](../../src/native/games/singles/index.ts), the `DS_HINT_STRAND`
branch in [`singles/render.ts`](../../src/native/games/singles/render.ts).

This generalises into a **stable per-game colour legend**: when a hint narration names more
than one distinct *kind* of board element (a filled cell as premise *and* the forced cell as
conclusion; a clue *and* a region), give each *type* its own highlight colour so the words
map to the picture — and keep it stable (a "shaded square" is the *same* colour in every
hint that cites one), so the player learns it. Normative rule + scenarios:
[`ts-engine`](../../openspec/specs/ts-engine/spec.md) Hint System ("element-type colour
legend"); per-game e.g. [`singles`](../../openspec/specs/singles/spec.md) "Singles hint
colour legend". Three non-negotiables:

- **Colour is never the sole carrier** (colourblind users). Every legend colour is paired
  with a non-colour cue — ring vs shade vs fill, the drawn digit, or position — and colour
  *names* never go in the narration text. The cell's own appearance often *is* the cue:
  Singles rings a cited **black** premise `COL_HINT_BLACKREF` (teal) and a cited
  **white/circle** premise `COL_HINT_WHITEREF` (violet), but the cell underneath is still
  visibly black/white.
- **This is orthogonal to rule 3.** The legend governs *premise/element types*; equivalent
  *forced moves* still all share the one target colour. Don't colour two cells differently
  just because they're different cells — only different *types*.
- **A foreground highlight must contrast with the cell it sits on — never paint the
  acted-on glyph the same colour as its background fill.** A struck candidate *digit* must
  stay legible; the first cut filled its *cell* `COL_HINT` (the placement-target fill) *and*
  drew the digit `COL_HINT`, so it was blue-on-blue and vanished — the candidate read as
  already-removed, exactly the "the hint deleted my note" bug (`fix-stale-hint-step`,
  owner-reported). The solid `COL_HINT` fill is the *placement*-target colour (a cell with
  no foreground glyph to hide); a **strike** cell keeps the lighter `COL_HINT_CELL`/normal
  background, and the struck candidate is drawn in its **normal `COL_PENCIL`** colour with a
  same-colour **strikethrough line** as the "ruled out" cue. Filling sidesteps the whole
  problem by drawing **no digit** on its `COL_HINT` fill; Towers must not, because the
  struck digit *is* the message. Guard it with a tier-2.5 assertion that a strike frame
  draws **no** `COL_HINT` background rect (only placement frames do) — `towers-hint.test.ts`.

What each game's hints actually do — copy the matching row when you add a hint to a similar
game:

| game | move | premise type(s) → colour + cue |
| --- | --- | --- |
| Singles | forced cell, blue fill | matching number → `COL_HINT_CELL` shade + digit; cited **black** square → teal `COL_HINT_BLACKREF` ring; cited **white** circle → violet `COL_HINT_WHITEREF` ring; protected corner → amber `COL_HINT_STRAND` |
| Range | forced cell, blue fill (no mark preview) | undecided premise → `COL_HINT_CELL` shade; cited **black** square → teal `COL_HINT_BLACKREF` ring (same hue as Singles) |
| Unruly | forced cell, blue fill (grow anim only on auto-hint execution) | empty journey siblings → `COL_HINT_CELL` shade; cited premise / pivotal cells → orange `COL_HINT_REF` ring (**one** colour, not the black/white split — its rings land on black cells, a balanced both-colour row, *and* empty windows, so a state-derived colour is ill-defined) |
| Palisade | forced edge(s), blue `COL_HINT` segments (equivalent edges share it) | region → `COL_HINT_CELL` shade; clue → its drawn digit on the shaded cell |
| Filling | target square(s), *mild* `COL_HINT` fill, **no digit** | region premise → `COL_HINT_CELL` shade + digit on top |
| Towers | struck candidate digit(s) `COL_HINT` + cross-through (on a *non*-`COL_HINT` cell so the digit shows); placement target `COL_HINT` fill (no digit to hide) | driving **clue cell(s)** *and* their line of sight → `COL_HINT_CELL` shade (clue + sightline read as one premise region; a facing pair shades both clues) |

Two reusable lessons from the rollout: (1) **teal = "a cited black square", violet = "a
cited white square"** is a cross-game reading worth preserving — reuse those hues for a
decided black/white premise (Singles, Range) and pick a *different* hue (Unruly's orange)
when a game's premise ring isn't a single decided colour. (2) When the ring set is **mixed**
(filled + empty, or both colours), use **one** premise colour, not a per-cell split —
the split only works when every ringed cell is a single decided colour.

**Single-action *imperative* hints are exempt.** Movement/objective games (Sixteen, Fifteen,
Flood) name only **one** element type — the tile/colour being moved — plus the move itself;
there is no premise type to disambiguate, so the legend doesn't apply. The legend bites only
when a hint narrates a *premise* distinct from the *move*.

### 5.4 Shade vs ring is about whether the fill *hides the premise*

The choice between shading evidence (`COL_HINT_CELL` background) and ringing it (`COL_HINT`
outline) turns on one question: **would a light-blue fill hide the information that makes the
cell evidence?**

- **Range** shades — its premises are *undecided* cells (a line of sight, a reach run);
  nothing to hide.
- **Unruly** rings — its premises are *filled black/white tiles* whose **colour is the
  reason**; a fill would paint over it. So split the highlight: shade still-empty cells (the
  journey's forced siblings, so the player sees the line fill) and ring filled premise cells
  in `COL_HINT`. For a fill-style game this is the *common* case.
- **Filling** shades *even though its evidence cells are filled* — because the premise is a
  **number**, and a digit draws *on top of* a light background. So Filling shades the region
  (`COL_HINT_CELL`) and the digits stay readable (`buildHighlight` + `narrate` in
  [`filling/index.ts`](../../src/native/games/filling/index.ts), the `HINT_*` bits +
  no-digit target branch in
  [`filling/render.ts`](../../src/native/games/filling/render.ts)).

So "is the premise filled?" is the wrong question; "would the area fill hide the premise?" is
the right one — a *colour* premise yes (ring), a *number* premise no (shade). **When a game
has both kinds, decide in `redraw` from the cell's own state — one `evidence` list, not
two.** Rather than splitting the payload into `area` + `rings` (Range's shape, right
when the split is known at build time), Singles carries one flat `evidence: Pt[]` and
the renderer branches per cell:
**black/circle ⇒ ring `COL_HINT`, else ⇒ shade `COL_HINT_CELL`**. Exemplars: the
`DS_HINT_EVID` branch in [`singles/render.ts`](../../src/native/games/singles/render.ts);
`buildHighlights` in [`unruly/index.ts`](../../src/native/games/unruly/index.ts) + the
`FF_HINT_*` bits in [`unruly/render.ts`](../../src/native/games/unruly/render.ts).

### 5.5 Group one firing into one multi-square step

Quality-bar rule 2 has a second form beyond `continuesPrevious` legs: when a single
deduction forces **several cells at once**, emit **one** `HintStep` whose `Move` fills *all*
of them and highlight them all as targets. Filling's region-growth deduction is the exemplar
— a region that can't reach its size pins *every* empty square on its completion at once, so
the hint points at the whole group ("The shaded region of 5 fits exactly into these
squares.") instead of dribbling them out one per request. Pattern (exemplar: `nextRegionGroup`
in [`filling/solver.ts`](../../src/native/games/filling/solver.ts), `deduceHintPlan` +
`hintKeepTrack` in [`filling/index.ts`](../../src/native/games/filling/index.ts)):

- **Find the whole forced set per firing.** The empty cells a region *can't complete without*
  (each fails the capacity flood when blocked) are all simultaneously forced — return them as
  one group. Distinguish **exact** (the group *completes* the region — "fits exactly into
  these squares") from **partial** ("can't fully grow without these squares"); the count
  drives singular/plural.
- **Plan = apply a group, recompute, repeat**, on a working board (like Range's per-step grid)
  so every step's narration and shaded region reflect the board as it fires. Keep a
  **single-cell fallback** (run the per-cell solver, take its first move) for cells no group
  covers, so the plan still *completes the board* (verify with a "every generated board's plan
  solves it" test).
- **`hintKeepTrack` handles partial completion.** The move must set the hinted value into a
  **subset** of the step's cells (and nothing else) → `"completed"` when it fills the last one,
  else `"onTrack"` with the step **shrunk in place** (`step.move` / `step.highlights` updated to
  the remaining cells) so a later `executeHint` doesn't re-fill what's done. A non-target cell,
  or the wrong value, is `"off"`.

A clean seam for the `continuesPrevious`-legs form: when the solver fills a whole line through a
shared helper (Unruly's `fillRow`), thread the recorder through it so its first cell opens a
journey (`continuesPrevious: false`) and the rest continue it (`true`); per-cell techniques emit
independent steps. See `fillRow` +
[`unruly/solver.ts`](../../src/native/games/unruly/solver.ts) `deduceHintPlan`.

### 5.6 When the evidence is genuinely non-local — say so honestly

Three of Filling's four techniques have clean local evidence; the fourth — candidate
elimination (`learn_bitmap_deductions`) — reasons *globally* (a number is ruled out because an
orthogonal neighbour equals it **or** because no region of that size can reach the cell). The
adjacency eliminations are local (shade the filled neighbours); the reachability ones aren't
cleanly localisable. Don't fabricate a tidy area — state *both* mechanisms honestly ("it would
sit next to an equal number, or belong to a region that can't reach the right size here") and
**assert the visible-evidence invariant only for the local techniques**, relaxing it
(explanation + target) for the global one. Surfacing the step honestly beats omitting it (a gap
would break the plan's path to the solution). See `filling-hint.test.ts`'s "every local-technique
deduction carries evidence" test.

### 5.7 Placement animation as hint motion (fill-style games)

A game with no upstream move animation (`animLength` 0) can still make auto-hint read as motion
with a short **geometric** placement animation: `drawRect` takes a palette **index**, not RGB,
so don't colour-tween — grow the new colour from the cell centre over `animTime`, drawing the
previous colour beneath (animating cells bypass the cache via the Flip 255-sentinel idiom).
Return a small base `animLength` for a single-cell change (0 for bulk `solve`/no-ops); because
it's > 0 the midend stretches a hint-executed move to the uniform `HINT_ANIM_S`, so each
auto-hint step plays as a visible fill with no frozen gap. Exemplar: Unruly's `animLength` + the
grow branch in `drawTile`
([`unruly/render.ts`](../../src/native/games/unruly/render.ts)).

---

## 6. Non-deductive (heuristic) hints

Not every game is deductive. **Untangle** has no logical "why" — no move is *forced*, you just
want fewer crossings — so quality-bar rule 1 doesn't apply, and forcing a narration would
fabricate a non-sequitur. By owner approval such a game ships a hint with an **empty
`explanation`**: the visual highlight plus the existing move animation *are* the whole hint.
Pattern (exemplar: [`untangle/hint.ts`](../../src/native/games/untangle/hint.ts)):

- **Objective, not deduction.** Pick the move that most improves a cheap scalar objective
  (Untangle: edge-crossing *pairs* from `findCrossings`). A greedy loop on a *working copy* —
  take the best strictly-improving single move, apply, repeat until solved / no improvement /
  step cap — yields a multi-step plan auto-hint plays as a progressive cleanup.
- **Secondary objectives as a tie-break, not a second pass.** Untangle's plain barycentric step
  collapses the layout toward the centre; fix it by giving each move several candidate targets
  (centroid + outward-pushed variants) and, among those with the *best primary score*, picking
  the best on a secondary objective (pairwise anti-clustering, Σ 1/(dist+ε)). Keep the primary
  strictly primary (the plain centroid stays a candidate); verify with a same-board A/B that the
  enhanced heuristic stalls no more than the plain one. A tie-break beats a "untangle, then
  spread" second pass, since the puzzle ends the instant the primary hits zero — the final frame
  must already be spacious.
- **Refuse honestly.** `{ ok: false }` when solved, and also when *no* single move improves the
  objective (a local minimum the player must break) — never a no-op or worsening move.
- **No `hintKeepTrack`.** The default `"off"` is correct: the greedy tail was computed for exact
  targets, so any deviation should drop the plan and recompute.
- **Highlight = the suggestion.** Carry a `{ vertex/cell, to }` highlight and draw the move
  (Untangle: a `COL_HINT` line from piece to destination + a `COL_HINT` marker). Read the
  *source* from live state so an auto-hint slide shows the line shrink to nothing. **Fold the
  hint signature into the redraw early-out** — a manual hint moves no piece, so a full-frame game
  that early-outs on "nothing moved" would otherwise skip the hint.
- **Animation is often free.** A game that already animates its moves (Untangle's `mix()`) needs
  nothing extra: a hint-executed move rides that pipeline and the midend stretches it to
  `HINT_ANIM_S`.

**Walk to the known solution via `aux` when a local heuristic can't finish.** A local objective
can **stall at a local minimum** and look bad doing it (Untangle's centroid heuristic clustered
vertices and failed to untangle larger boards). If the game *knows* its solution — the
generator's `aux`, the same value `solve` uses — walking the player there is legitimate and
robust. `hint(state, aux?)` receives `aux` (present for generated games, absent for descriptive
ids), so prefer the `aux` plan when present and keep the heuristic as a fallback. Pattern
(`untangle/hint.ts` `deduceAuxPlan`):

- **Match the closest symmetry.** Pick the solved layout closest to current positions so the
  motion is minimal (`dihedralSolvedUnits`, shared with `solve`).
- **Rescale to taste — affine maps preserve planarity.** A uniform transform of a crossing-free
  straight-line layout stays crossing-free, so freely rescale the solution to fill the play box
for a spacious reveal.
- **Order for a pleasing reveal.** Emit one move per vertex, greedily choosing the next whose
  placement keeps intermediate crossings lowest.
- **Share the solution-decoding with `solve`** — extract the `aux` parse + symmetry match into
  `state.ts` so the two don't duplicate it.

---

## 7. The cross-game correctness guards

### 7.1 A hint MUST resume from any mid-game position

The single most important behavioural guarantee, and the one most easily missed: **a hint asked
from a board the player reached by their own play must still make progress and lead to a solved
board** (as long as it's solvable with no mistakes). In the app a self-played move drops any
stored plan (`hintKeepTrack` → `"off"`, or no `hintKeepTrack`), so the *next* hint **recomputes
from the current state** — the plan-carrying machinery does not save you. Two ported games shipped
a real bug here, both invisible to "the plan solves the board" tests that only ran from the
*empty* start:

- **Singles** — its deductive `solveSpecific` was a faithful port of upstream, which only solves
  from empty; its cascade propagates only from cells it changes *this run*, so resumed from the
  player's marks it never fired their implications and stalled. Fix: prime the cascade from
  existing marks (`primeCascadeFromMarks`). General lesson: **a recording deductive solver written
  to run from empty is not automatically resumable** — seed it from the current decided cells.
- **Untangle** — its `aux`-walk re-suggested a *no-op* forever: a vertex sat on its target *pixel*,
  but the unrounded target jittered between recomputes by more than the fine tolerance, so it never
  counted as "placed". Fix: treat a vertex as placed when the move is a no-op **at the stored pixel
  resolution** (`isNoOpMove`). General lesson: **for a heuristic/`aux` hint whose target is
  recomputed each call, the recompute must converge** — never emit a move that doesn't change the
  board.

This is enforced for **every** hint-bearing game by
[`hint-resume.test.ts`](../../src/native/engine/hint-resume.test.ts): it walks a fresh board to
solved one *freshly-recomputed* hint at a time (apply only `steps[0]`, recompute, repeat),
asserting a hint never gives up before solved. Any new game is covered the moment its export is
added to that test's list — **do so as part of the port**; a per-game "plan solves from empty"
test is *not* a substitute.

### 7.2 Guard the deduction fixpoint with a step budget

The resume test catches a hint that *gives up* or whose move-walk *loops* (its `cap` move limit
fires with a per-seed diagnostic). What it can't catch cheaply is a hang **inside one `hint()`
call** — a "repeat until no progress" fixpoint where a rule reports progress without changing the
board never returns, so no move is produced and the only backstop is a wall-clock timeout (slow,
opaque, load-sensitive). Tick a [`stepBudget`](../../src/native/engine/step-budget.ts) once per
fixpoint iteration so a non-terminating loop throws a labelled error in milliseconds. Make it
**opt-in on the hint path** — gate it on the recorder/hint signal the function already carries
(`rec`, `ss.records`, `ctx.record`), so the generator runs the same fixpoint *unguarded and
byte-for-byte unchanged* (a budget that fired during generate-and-check would break board generation
— never guard that path). The limit (`DEFAULT_HINT_STEP_LIMIT`) is generous: an honest fixpoint
converges in ~one iteration per cell, so the guard only catches a future regression. Exemplars:
`applyRules` in `range/solver.ts` (gated on `rec`), `solveSpecific` in `singles/solver.ts` (gated on
`ss.records`), `deduceForcedEdges` in `palisade/solver.ts` (a hint-only function, so unconditional).
Search-based hints (Fifteen/Sixteen A*-style, Flood's BFS) are bounded by their visited sets and
need no budget.

### 7.3 A kept plan can go stale — implement `refreshHintStep`

A plan is computed **once** and *kept* while the player follows it. A followed move can have side
effects the plan didn't author — most concretely, **the player toggling a preference mid-solve**: a
Towers plan built with auto-pencil (§9) *off* bakes explicit `continuesPrevious` dup-strike legs, but
if the player then turns auto-pencil *on*, a placement silently strikes those same candidates, so the
stored strike step (or any later clue strike naming one of them) names notes that are **already
gone**. The midend re-displaying the stored step without re-checking it ⇒ a hint telling the player to
remove something already removed (owner-reported, `fix-stale-hint-step`). The engine guarantee is
**validate-at-display**: implement `Game.refreshHintStep(step, state)` — return the step with dead
marks dropped (rebuild `highlights` to match), or `null` when it is fully resolved. The `Midend` calls
it before every (re-)display and advances past / recomputes resolved steps. Towers' is ~20 lines (filter
`pencilStrike` marks to present candidates; a placement step resolved once its cell is filled; populate
resolved once every empty cell has notes). **Every candidate-elimination game with note-clearing side
effects needs one.** Cross-game coverage: `engine/hint-resume.test.ts` asserts no plan step is ever a
no-op when reached (the intrinsic form); `towers-stale-hint.test.ts` drives the real `Midend` through an
auto-pencil flip (the side-effect form).

---

## 8. Verifying a hint in-process (no eyeballing)

Use the tier-2.5 render-scenario harness
([`render-scenario.ts`](../../src/native/engine/testing/render-scenario.ts)):
`renderScenario({ game, id, moves?, showHint?, hintUntil? })` drives a real `Midend` to the hint frame
(walk a multi-step plan with `hintUntil`), then assert targeted ops (`COL_HINT` present, clues still
drawn) **plus** `toMatchSnapshot`. Seed: `palisade-render-scenario.test.ts` reaches the `equivalentEdges`
frame the Playwright harness couldn't. To reach a specific deduction without its desc, do a fixed-seed
scan (loop ids, keep the first whose `result.hint` matches).

Two testing gotchas worth internalising:

- **A narration substring can match more than one deduction.** Reaching a frame by predicating
  `hintUntil` on a phrase is handy, but pick a phrase *unique to that deduction*: several Singles
  narrations share generic words ("shaded square", "stays white"), so a loose predicate stops on the
  wrong frame. Predicate on a phrase only one reason uses ("can't be adjacent" for `adjBlack`, "share a
  line" for `sameLine`). If the strings get retuned, re-pick.
- **The easiest rule pre-empts hand-crafted boards.** A solver that tries techniques easiest-first means
  a crafted board often fires a *different* rule than intended (an alternating Unruly row is a
  three-in-a-row deduction, not a count completion). Craft for the per-cell techniques, but validate
  **grouping** on a *generated* board (scan a few seeds for a `continuesPrevious` leg, then check it
  shares its predecessor's firing). See `unruly-hint.test.ts`.

---

## 9. Candidate-elimination (pencil-note) games — Towers exemplar

A game whose signature techniques **narrow a cell's set of possible values** rather than directly
forcing one (Towers' clue line-of-sight deductions, Unequal's two-mode inequality/adjacency
eliminations, and Solo / Keen / Undead when ported) teaches in **pencil-notes** terms: the hint
sets and strikes notes, and a placement is the moment a cell's notes collapse to one. The general narration rules (§2.6 strike-vs-place voice, §2.7 degenerate
extremes), the engine mechanics (§3 recording off the cube, `hintKeepTrack` pre-move state), and the
stale-plan guard (§7.3) all apply here; this section is the pencil-note-*specific* machinery. Exemplar:
[`towers/{solver,index,render}.ts`](../../src/native/games/towers/index.ts) +
[`engine/latin.ts`](../../src/native/engine/latin.ts).

### 9.1 The recorder and the soundness boundary

- **Record off the candidate cube.** A Latin-style solver already carries
  `cube[cubepos(x,y,n)]` ("can `n` still go here?"). Thread a `DeductionRecorder` through the generic
  deductions (`place`/`set`/`forcing`) **and** the game's user-solvers so each *candidate cleared*
  (`elim`) and each *cell placed* (`place`) is recorded in solver order with its reason + premise. Gate
  every reason allocation and the strike-record on `solver.recorder` so the generator/solve path is
  byte-for-byte unchanged (verify with the C differential). A `group` id, bumped once per top-level
  deduction attempt, ties one firing's records together (§3 — beware bumping per *pass* not per
  *firing*).
- **The soundness boundary is non-negotiable: seed the working cube from the placed grid only — never
  the player's notes.** A note can be wrong (crossing out the correct height is exactly what
  Check-&-Save flags), so feeding it back as a fact would let the solver "prove" nonsense. The notes
  are used only to *diff* (which already-true elimination to surface next, what is done) and to
  *render*. Run the recording solver at the board's own difficulty, **deductive only** (cap below
  recursion — a guess isn't a teachable note strike).

### 9.2 Persist, populate, and the moves

- **Persist + populate.** Express the recorded script against the live notes as steps: (1) a conditional
  **populate** (only when some empty cell lacks notes) reusing the existing fill-all (`pencilAll`) move,
  so the hint's start state is the fill-all button the player already knows and the basic Latin
  eliminations are taught honestly rather than baked into the fill; (2) **eliminate** journeys;
  (3) **place** steps. Skip any operation already reflected on the board so a fresh recompute resumes
  from any mid-game position (§7.1 — `towersGame` and `unequalGame` are in `hint-resume.test.ts`).
- **A givens-bearing Latin game needs a basic-Latin opening — the recorded script won't carry it.** The
  recording solver enables its recorder *after* `latinSolver.alloc` (so seeding the cube from the givens
  isn't mistaken for a teachable deduction). Fine for Towers (≈ zero givens), but Unequal carries a few
  givens, and `pencilAll` fills *every* candidate, so after populate a cell shows a value that the
  grid-seeded cube already excluded (the given's row/column duplicate) — and the recorded script never
  strikes it (it was culled, unrecorded, during `alloc`). Don't bake it into a "smart" populate (that's
  the bake-into-fill §9.2 avoids); instead emit the row/column cull directly in the plan builder as the
  opening journey *after* populate and *before* the clue eliminations — one `dup`-reasoned `pencilStrike`
  per placed/given value with live line-duplicates. It re-derives from the current filled cells each
  recompute, so it stays resume-safe. Exemplar: `basicLatinStrike` in
  [`unequal/index.ts`](../../src/native/games/unequal/index.ts).
- **`pencilStrike` — the one-firing-one-step note move.** A `set { pencil }` toggle is *one* cell and
  *not idempotent* (a re-applied strike would re-add the candidate). So add a move that **clears** a list
  of candidate bits atomically (`{ type: "pencilStrike"; marks }`): one firing forcing several strikes is
  one multi-cell step (§5.5), idempotent, resume-safe. Populate stays on `pencilAll`; placement stays on
  the real `set`. `hintKeepTrack` treats a pencil toggle that *clears* a subset of the step's marks as
  `onTrack` (shrink in place) / `completed`, a placement of the hinted value as `completed`, else `off`.
- **A placement's own row/column eliminations continue its journey.** `place()` strikes the placed
  height from the rest of its row and column; record those as `dup` strikes and emit them as a
  `continuesPrevious` strike step after the placement ("a 5 now sits in this row and column, so strike it
  from these notes"). On recompute after a real placement they bake into the cube and drop out — so the
  resume walk sees mostly placements, while auto-hint (following the stored plan) still teaches the
  cleanup.
- **Notes are first-class markings in `findMistakes`.** See the playbook's pencil-mark-games note: flag
  an empty cell whose **non-empty** notes *exclude* the solution height (`kind: "note"`); notes with
  merely *extra* candidates are ordinary mid-solve state. Check-&-Save inherits the rejection through its
  existing `findMistakes` gate — no quick-save change.

### 9.3a A placement's *why* must be re-derived — the recorded `single` reason lies

The shared `latin.ts` records every forced placement (its generic `elim`) under one
reason, `{ kind: "single" }` — but `elim` fires on **three** slice kinds: a *cell*
slice (a genuine **naked single** — the cell's own candidates collapsed to one), a
*row* slice and a *column* slice (a **hidden single** — digit `n` fits only one cell
of that line, while the cell itself still shows several candidates). Narrating all of
them as "every other number has been ruled out in this cell" is **wrong for a hidden
single**: the player is looking at a cell that visibly still has 1, 2, 3, 4 pencilled
(owner-flagged on Keen, 2026-06-23). A hidden single must instead name its line —
*"In this row, 3 can go in only this cell — every other cell in the row has ruled it
out — so it must be 3"* — and shade the whole row/column as evidence (not the cell
alone), so the player can *see* that no other cell in the line takes the digit.

**Re-derive the placement reason from the working board at emit time; never trust the
recorded `single`.** The naked-single *step* already re-derives (it scans the working
notes for a one-candidate cell), so do the same for the recorded placements
`nextPlace` surfaces. The shared classifier
[`engine/latin-hint.ts`](../../src/native/engine/latin-hint.ts) `classifyPlacement`
returns one of three kinds: **naked** (the cell's notes are exactly `{n}`), **hidden**
(no other *empty* cell of the row — or the column — still has `n`; only empty cells
compete, a filled one doesn't block), or **forced** (neither — the notes lag behind a
deeper set/forcing deduction, so narrate honestly without claiming the cell's notes
are down to one, rather than lie). `singlePlacementReason` maps those to the
`single` / `hiddenSingle` / `forcedSingle` reasons every Latin game's narration and
evidence shading share. Reclassify **only** when the recorded reason is `single` —
Towers' clue-driven placements (facing, full-line) keep their own reasons. Exemplars:
the three games' placement sites + `hiddenSingleLine` evidence shading; guards:
`keen-hint.test.ts` "narrates a hidden single by its line", `latin-hint.test.ts`
(the classifier), and `hint-resume.test.ts` "a Latin-family placement never falsely
claims a naked single" (the cross-game regression guard).

> **Shared, not per-game.** This shipped for Towers, Unequal and Keen together
> (`fix-latin-hidden-single-narration`): a probe had mis-narrated 37/96 Towers and
> 13/82 Unequal placements (and the Keen case the owner caught) as naked singles; all
> three now route through the one shared classifier and read 0. Solo / Undead get it
> for free when they port.

### 9.3 Solve the way a human does — naked single first, never narrate a Latin trivial

The first cut emitted the raw recorded script and buried the player in trivial "strike this number from
the rest of its row/column" steps. The fixes, all owner-driven and worth copying:

- **An auto-pencil preference (default on)** that, on a real placement, strikes the placed value from the
  rest of its row and column automatically. Bake the decision into the *move* at `interpretMove` time
  (`set { autoElim }` read off the Ui pref) so `executeMove` stays pure and replay is deterministic. When
  on, the hint folds those trivial eliminations into the placement (no step); when off, it teaches them as
  an explicit `continuesPrevious` strike. The hint needs the pref, so `Game.hint` takes an optional third
  `ui` arg (the midend passes `this.ui`; other games ignore it) — `const autoClean = ui?.autoPencil ?? true`.
- **A naked-single-first plan builder.** Don't express the recorded script verbatim — walk a *working
  copy* of the board (notes + grid) and at each step take the most natural move: (1) a **naked single** (an
  empty cell whose working notes have collapsed to one candidate — on a mistake-free board that candidate is
  the truth, so placing it is sound and is what a person does next); else (2) the next **clue elimination**
  (the deduction worth teaching); else (3) a forced **placement** (facing clue, or a cube collapse the notes
  lag). Re-record from the working grid after each placement; advance through strikes by filtering to
  still-live marks. **Gotcha that hid every clue deduction:** the recording solver commits the facing-clue
  placement *first*, so a naive "strikes before the first recorded placement" window is empty and every clue
  elimination gets buried inside a generic "every other height is ruled out" placement. Fix: the strike
  window extends to the first *unreflected* placement (one whose cell isn't yet on the working grid) — a
  facing place you've already applied no longer blocks the clue strikes recorded after it. Exemplar:
  `buildSteps` / `firstUnreflectedPlaceIndex` in
  [`towers/index.ts`](../../src/native/games/towers/index.ts).
- **Surface a *whole-line forcing* as one ordered placement journey, before populate; pencil in notes
  lazily.** A clue at an extreme value can force a whole line (or a single cell) outright, needing *no* notes
  — Towers' clue equal to the grid width pins the line to `1, 2, …, w` from the clue; a clue of `1` pins the
  tallest tower next to it (owner-requested 2026-06-22). Emitting that as the recorded per-cell elimination
  cascade buries an obvious move; instead detect it directly in the plan builder and emit the forced cells as
  one journey (first leg unflagged, the rest `continuesPrevious`, continuation legs narrated tersely so the
  premise isn't restated each leg). Because these placements need no notes, make **populate lazy**: do the
  note-free forced placements first and only emit the fill-all step when an *elimination* first needs
  something to cross out (a naked single still out-ranks everything — an unpopulated board has none, so the
  ordering is moot there). Detect off `state.clues`, not the recording solver, so the generate/solve path
  stays byte-identical. Exemplar: `nextExtremeClueLine` + the lazy `ensurePopulated` in
  [`towers/index.ts`](../../src/native/games/towers/index.ts); guard: `towers-hint.test.ts` "populates before
  the first elimination".
- **One firing, multiple struck heights → one step per height, narrated per height.** A clue firing can
  rule out *different* heights in different cells at once (Towers' lower-bound rule strikes both 4 and 5 along
  a line). Don't emit that as one `pencilStrike` step: the narration names a single height ("a tower of height
  5…") but the cell would show 4 *and* 5 crossed out — a visible contradiction the owner flagged. Group a
  firing's marks **by struck height**; emit one step per height (narrated with *that* height), and flag the
  further heights `continuesPrevious` so the firing still reads/auto-plays as one journey.
  `nextClueStrike`/`buildSteps` in [`towers/index.ts`](../../src/native/games/towers/index.ts); guard:
  `towers-hint.test.ts` "a strike step never mixes heights".

  - **A region/cage firing that spans many cells → split by *cell*, one leg each.** When the firing's premise
    is a whole *region* (Keen's per-cage candidate pruning: enumerate the cage's clue-consistent layouts, then
    rule out every cell-candidate no layout uses), one firing legitimately strikes several candidates across
    several of the cage's cells. Split the firing's live ops **by cell** and emit one leg per cell, each leg
    narrating "this cell" and highlighting a single target, the legs flagged `continuesPrevious` so the cage's
    whole implication reads as one journey (the shaded *area* — the whole cage — stays constant across the
    journey). Within a leg, a value *list* is fine here because the cage narration never names a single value
    in its premise (Keen: "No way to make this cage multiply to 120 leaves room for 1, 2 and 3 in this cell" —
    contrast Towers' per-height split, forced because *its* premise says "a tower of height 5"). So the
    split axis is dictated by the *narration*: split by whatever the premise names singular (Towers: height;
    Keen: cell). Exemplar: `emitStrikeJourney` + `nextStrike` in
    [`keen/index.ts`](../../src/native/games/keen/index.ts); guard: `keen-hint.test.ts` "a cage-strike step's
    marks all lie in one cell".

---

## 10. Method lesson: probe before trusting a mechanism diagnosis

Twice in one hint session a plausible mechanism diagnosis ("the second leg reads as off-plan", "the plan is
being dropped") was wrong and dissolved by a ~20-line probe test. When a hint misbehaves, write the smallest
probe that observes the actual `activeHintStep()`/state rather than reasoning forward from the suspected
cause. See "Hint-UX session" in [`AGENTS.md`](../../AGENTS.md).
