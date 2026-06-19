# Hint Authoring Guide

> **Provisional v1 (2026-06-16) — live wiki.** Codified from the Sixteen,
> Palisade, and Range hints. **Update this file whenever you work on a hint** (a
> new one, but also iterating an existing one — e.g. the in-flight Range
> refinements) and hit something it didn't tell you, got wrong, or could say
> better — that edit is part of "done," in the same change. See
> `add-game-dev-guides`.
>
> **This guide is the *how*. The *what* lives in the specs — links are
> authoritative.** Anti-drift rule: state a normative rule briefly + link it;
> point at an exemplar rather than pasting code.

Authoritative spec: the Hint System requirements in
[`ts-engine`](../../openspec/specs/ts-engine/spec.md). Quality bar:
[`palisade`](../../openspec/specs/palisade/spec.md) + the "Hint quality bar
(exemplar: Palisade)" section of [`AGENTS.md`](../../AGENTS.md). **Exemplars to
read:** Palisade (grouped multi-leg deductions) and
[`src/native/games/range/`](../../src/native/games/range/) (`solver.ts`
recording deduction → `index.ts` `hint`/`hintKeepTrack` → `render.ts`
highlight).

Explained hints are a **core deliberate-divergence product value** of this fork,
not a nicety. Upstream's `'h'` returns one next move with no explanation; that is
below the bar. Adding a hint to a ported game is its **own openspec change**
(`add-<game>-hint`), parity-gated like a port.

---

## 1. The quality bar (Palisade exemplar) — meet all four

The full statement is in [`AGENTS.md`](../../AGENTS.md); the bar a `hint()` must
clear:

1. **Explain *why* the move is forced, not just *what* to do.** Narrate the
   actual deduction ("both edges border the same region, so they share a fate;
   walling both exceeds clue 2 — so neither is a wall"). If a narration's
   conclusion doesn't follow from its own stated premises, the deductive
   coupling is missing — surface it. A good hint *teaches the technique*.
2. **One deduction firing = one journey.** A single deduction that forces
   several moves is emitted as one multi-leg `HintStep` journey (continuation
   legs flagged `continuesPrevious`), so it reads and auto-plays as one coherent
   hint, not N disjoint ones.
3. **Equivalent moves share a colour.** Moves that share a fate render
   identically (Palisade: all `COL_HINT`); a distinct colour reads as "different
   roles" and misleads.
4. **Pace auto-hint uniformly.** `AUTO_HINT_STEP_MS` (1s) per step in
   [`src/puzzle/puzzle.ts`](../../src/puzzle/puzzle.ts), floored by the move's
   own animation so animated moves still play out fully.

## 2. The mechanics (engine side already exists)

The `Game` hooks and the `Midend` lifecycle are in
[`ts-engine`](../../openspec/specs/ts-engine/spec.md); the implementation is
[`src/native/engine/midend.ts`](../../src/native/engine/midend.ts). A game
implements:

- **`hint(state): HintResult`** — return `{ ok: false, error }` to refuse (board
  solved, or has mistakes — a hint off a contradictory board misleads), else
  `{ ok: true, steps }`. Each `HintStep` carries `move` (the forced move),
  `explanation` (the *why* string), and `highlights` (game-specific render
  data). Compute the **whole remaining plan** once; the midend advances steps as
  the player follows or auto-play executes them.
- **`hintKeepTrack(move, step, state): "completed" | "off"`** — `"completed"`
  iff the player's move matches the step's intent (advance the plan), else
  `"off"` (drop the plan to recompute).
- **`continuesPrevious`** on a `HintStep` — the midend keeps a multi-leg journey
  displayed through its legs; only an unflagged next step waits to be asked for.
  The mechanism is generic; a game just emits grouped steps.

**Recording deduction pattern (Range):** the solver's rules already drive the
board to a solution; thread an *optional* `record(cell, value, reason)` callback
through them (built only on the hint path) and a `deduceHintPlan(...)` that runs
the deduction from the player's current marks and returns the ordered forced
moves, each tagged with the rule + premise that forces it. Exemplar:
[`range/solver.ts`](../../src/native/games/range/solver.ts) +
[`range/index.ts`](../../src/native/games/range/index.ts).

**Recording through an op-queue + cascade solver (Singles).** Range's rules call
`makeMove` and record inline. A solver shaped like Singles' (`singles.c`) is
different: the rules **queue** ops and a separate processor **applies** them while
**cascading** new ops (a new black queues "circle my neighbours"; a new circle
queues "blacken my line-mates"). The cause of a cell is known at two sites — the
rule that queued it, and the apply step that queued a follow-on. So: **attach the
reason to the queued op, and record each op when it actually changes a flag**
inside the apply/cascade loop. The cascade builds its own reason at the apply
site, referencing the just-decided source cell (`adjBlack` → the new black;
`sameLine` → the new circle). Put the recorder array + a group counter on the
existing `SolverState` so it threads everywhere for free, and **gate every
reason allocation on it** (`if (ss.records)`) so the generator's hot solve path
is byte-for-byte unchanged — verify with the existing C differential. Exemplar:
[`singles/solver.ts`](../../src/native/games/singles/solver.ts) (`deduceHintPlan`,
`recordOp`, the cascade reasons in `solverOpsDo`).

**Group by a firing id, not by adjacency.** When one firing forces several cells
(Singles' four-in-a-corner, an offset-pair's two whites, a doubles pair shading
*all* other copies, and naturally the cascade itself — one new black forces its
≤4 neighbours white as one firing; one new circle blackens every line-mate as one
firing), give that firing's ops a shared `group` id and **merge records by group
into one multi-cell `HintStep`** (quality-bar rule 2). Records of one firing are
queued consecutively and so applied consecutively, so a first-seen-order bucket
keeps the plan's order. A genuine *chain* (a black → neighbours white → those
blacken line-mates → …) stays *separate* steps — each link is its own teachable
local deduction, like Range.

## 3. Refusal couples to the mistake overlay + banner

A hint refused because the board is wrong now lights up the same overlay
**Check & Save** uses — `Midend.computeHintPlan` calls `findMistakes()` on
refusal. So a game that has both `hint` and `findMistakes` gets "fix the
highlighted mistakes first" *with the cells actually highlighted* for free.

The refusal message reaches the player via the banner on **both** paths — manual
Hint and Auto-Hint route the returned string into the transient banner
([`src/puzzle/puzzle.ts`](../../src/puzzle/puzzle.ts) `hint()` →
`setAutoHintMessage`). A hint-carrying game with `wantsStatusbar = false` (e.g.
Range) still shows and clears the banner.

(Both behaviours are codified as requirements added by the `add-range-hint`
change — they merge into the Hint System requirement in
[`ts-engine`](../../openspec/specs/ts-engine/spec.md) on its archive.)

## 4. Render conventions + verification

Render the hint in `redraw` from the displayed `HintStep` (the midend hands it
in). Conventions: the forced cell in `COL_HINT`, equivalent moves in the **same**
colour, a preview of the move it forces (Range: black inset square / white dot).
Fold the hint bits into the per-tile `Int32Array` cache (§2 of the
[port playbook](./game-port-playbook.md)). Exemplar:
[`range/render.ts`](../../src/native/games/range/render.ts).

### Highlight the deduction's *evidence as an area*, not one premise cell

This is the visual half of quality-bar rule 1 (explain *why*). A single shaded
premise cell tells the player *that* there's a reason; shading the whole area the
deduction reasons over lets them **see** it. Palisade shades the connected
**region** a clue pair / size argument is about; Range shades a clue's **line of
sight** (the run of known-white cells it already counts), the **run it must reach
along**, or the **non-black cells a cut would isolate** — `COL_HINT_CELL` (a light
blue), with the action cell still the lone `COL_HINT` blue. Make the words and the
picture agree: if the narration says "the shaded run", a run must actually be
shaded. A premise cell that *can't* take the area fill (Range's adjacent **black**
square, which must stay black) is **ringed** in `COL_HINT` instead — see
`drawCell`'s `hintKind === 4` branch and `buildHighlights` in
[`range/index.ts`](../../src/native/games/range/index.ts).

### Distinct *roles* in one deduction get distinct colours — and distinct words

Quality-bar rule 3 ("equivalent moves share a colour") has a converse:
**premise cells that play *different* roles in the deduction must NOT share a
colour**, or the highlight lies. Singles' 2×2-corner deduction is the cautionary
tale — its first cut shaded three cells one colour and the narration called them
all "two corner squares": but those three cells are *two* roles — the **matching
pair** (the cells that share a number) and the **corner being protected** (a
different cell that gets sealed off). One colour + one label made it unreadable
(the owner: "it says two corner squares, but there's only one corner, and one of
the highlighted cells is a number that doesn't share"). The fix: a third
highlight role with its own colour (`COL_HINT_STRAND`, amber) for the protected
corner, kept disjoint from the shaded `COL_HINT_CELL` matching pair and the
`COL_HINT` target. Carry the roles as separate lists on the hint type (`targets`
/ `evidence` / `strand`) and apply them with a clear precedence in `redraw`
(target > strand > evidence). Exemplar: `SinglesHint` + `strandOf`/`narrate` in
[`singles/index.ts`](../../src/native/games/singles/index.ts), the `DS_HINT_STRAND`
branch in [`singles/render.ts`](../../src/native/games/singles/render.ts). Test
that the roles are **disjoint** (no cell is two roles).

**For a subtle multi-link deduction, name the concrete values and walk the
contradiction arc — generic "this square / its other neighbour" fails.**
Distinct colours alone weren't enough for the corner case: even with the corner
ambered and the pair shaded, the owner couldn't follow *"shading this square
would seal off the highlighted corner — a matching number forces its other
neighbour shaded"* (which also wrongly said "already", implying an immediate
fact when it's a hypothetical). What unblocked it was making the narration
**value-aware** (read the actual numbers off the board in `narrate`, passing it
`state`) and ordering it as the **proof-by-contradiction arc the deduction
actually is**: *the signal that fired it* → *the move we're ruling out* → *the
consequence* → *the deduction*. Owner's wording, now generated for any corner:
*"One of the two touching 3s must be shaded. Shading this 5 would force the 3
beside the corner 4 shaded as well, leaving the corner boxed in on both sides —
so the 5 stays white."*
Concrete values ("the corner 4", "the two touching 3s") plus the highlight
disambiguate far better than role words, and the arc lets the reader follow each
link. Watch dangling pronouns: an early cut ended "…force the 3 beside the corner
4 shaded as well, **trapping it**" — "it" read as the 3, not the corner, so name
the referent ("leaving **the corner** boxed in"). Lesson: when a one-liner with
pronouns won't land, the fix is usually *concrete references + the reasoning
order*, not more words. (Colour names still
don't go in the text — colourblind users — the numbers + highlight carry it.)

**Compute each step's area against the board as that step fires, not the original
board.** The plan is still computed once, but a frozen area goes stale: a `reach`
run the player has since filled white wouldn't be shaded. Range threads the
solver's working grid through each recorded move (`HintMove.grid` in
[`range/solver.ts`](../../src/native/games/range/solver.ts) — a `dup.slice()` at
record time, this move and all prior deductions applied) and builds the highlight
from *that* snapshot, so the shaded run grows as the player follows along. (The
snapshot has the move applied, so filter the target out of its own area.)

**Invariant worth a test: every step carries visible evidence** — a non-empty area
or a ringed premise, never a bare conclusion. See the "visible evidence" test in
[`range-hint.test.ts`](../../src/native/games/range/range-hint.test.ts). It caught
a `connect` step whose cut-vertex neighbours were all still *undecided* (so a
known-white filter left the area empty) — the connectivity rule treats every
non-black cell as white, so shade non-black neighbours, not only marked-white ones.

### Shade vs ring is about whether the fill *hides the premise*, not whether it's filled

The choice between shading evidence (`COL_HINT_CELL` background) and ringing it
(`COL_HINT` outline) turns on one question: **does a light-blue fill hide the
information that makes the cell evidence?**

- **Range** shades — its premises are *undecided* cells (a clue's line of sight,
  a reach run); there's nothing to hide.
- **Unruly** rings — its premises are *filled black/white tiles* whose **colour
  is the reason**; a fill would paint over it (see the next section).
- **Filling** shades *even though its evidence cells are filled* — because the
  premise is a **number**, and a digit draws *on top of* a light background
  (exactly as Range's clue numbers draw on their shaded line of sight). So
  Filling shades the region a deduction reasons about (`COL_HINT_CELL`) and the
  region's digits stay readable. This keeps the picture clean — no per-cell ring
  noise over an already bold-bordered region. The forced target cell takes a
  **mild `COL_HINT` highlight with *no digit drawn in it*** — owner-directed: a
  dark fill with the answer pre-printed reads as a *filled-in answer*, not a
  *call to action*; a gentle highlight on an empty cell says "input a number
  here". The forced value is read off the narration ("the region of N", "a 1"),
  so the cell needs no preview digit (contrast Range, whose forced *mark* — a
  black square / white dot — is non-numeric and so *is* previewed). Exemplar:
  `buildHighlight` + `narrate` in
  [`filling/index.ts`](../../src/native/games/filling/index.ts), the `HINT_*`
  bits + target-digit branch in
  [`filling/render.ts`](../../src/native/games/filling/render.ts).

So: "is the premise filled?" is the wrong question. "Would the area fill hide the
premise?" is the right one — a *colour* premise yes (ring), a *number* premise no
(shade).

**When a game has both kinds, decide shade-vs-ring in `redraw` from the cell's
own state — one `evidence` list, not two.** Singles' premises are sometimes
undecided number cells (the equal numbers of a sandwich, a 2×2 corner block) and
sometimes already-decided cells whose colour *is* the reason (the new black a
neighbour sits beside; the circled white a line-mate duplicates). Rather than
splitting the highlight payload into `area` + `rings` (Range's shape, right when
the split is known at build time), Singles carries one flat `evidence: Pt[]` and
the renderer branches per cell: **black/circle ⇒ ring `COL_HINT`, else ⇒ shade
`COL_HINT_CELL`** (numbers draw on top). This is the general form of Range's
"a premise that can't take the fill is ringed" and keeps the hint type tiny.
Exemplar: the `DS_HINT_EVID` branch in
[`singles/render.ts`](../../src/native/games/singles/render.ts).

**Testing gotcha — a narration substring can match more than one deduction.**
Reaching a specific deduction's frame by predicating `hintUntil` on a phrase from
its narration is handy, but pick a phrase *unique to that deduction*: several
Singles narrations share generic words ("shaded square", "stays white"), so a
loose predicate stops on the wrong frame. Predicate on a phrase only one reason
uses (e.g. "can't be adjacent" for `adjBlack`, "between them" for the sandwich,
"ringed white square" for `sameLine`). If the strings get retuned, re-pick.

**Keep the narration terse (owner-directed).** Explaining *why* is the bar, but
say it in one sentence, not three. Filling's first cut spelled out the full
deduction ("…without exceeding N cells — every other neighbour would overshoot.
So it must extend here: a N.") and read as a wall of text; the owner trimmed it
to "This is the only empty square that the shaded region of N could grow into."
— same logical content, a third the length. Lean on the picture (the shaded
area carries the premise) and on implied values ("the region of N" already tells
the player to write N), so the words only need to name the *one* reason. **Don't
repeat the number** — say "the region of N" once and let "these squares" / "a 1"
carry the rest. When a narration feels long, cut to the single premise the
highlight doesn't already show.

### Group one firing into one multi-square step — fill a `Move` with several cells

Quality-bar rule 2 (one firing = one journey) has a second form beyond
`continuesPrevious` legs: when a single deduction forces **several cells at
once**, emit **one** `HintStep` whose `Move` fills *all* of them, and highlight
them all as targets. Filling's region-growth deduction is the exemplar — a
region that can't reach its size pins *every* empty square on its completion at
once, so the hint points at the whole group ("The shaded region of 5 fits
exactly into these squares.") instead of dribbling them out one per request.
This reads far better than N single-cell steps and is what the owner asked for.

Pattern (exemplar: `nextRegionGroup` in
[`filling/solver.ts`](../../src/native/games/filling/solver.ts),
`deduceHintPlan` + `hintKeepTrack` in
[`filling/index.ts`](../../src/native/games/filling/index.ts)):

- **Find the whole forced set per firing.** For each incomplete region, the
  empty cells it *can't complete without* (each fails the capacity flood when
  blocked) are all simultaneously forced — return them as one group. Distinguish
  **exact** (the group *completes* the region — "fits exactly into these
  squares") from **partial** (the region still needs more — "can't fully grow
  without these squares"); the count drives singular/plural.
- **Plan = apply a group, recompute, repeat.** Build the plan on a working board
  (like Range's per-step grid), applying each group before finding the next, so
  every step's narration and shaded region reflect the board as that step fires.
  Keep a **single-cell fallback** (run the per-cell solver, take its first move)
  for cells no group covers (Filling's lonely / candidate-elimination, plus the
  rare only-one-flood-path case) — this guarantees the plan still *completes the
  board* (verify with a "every generated board's plan solves it" test).
- **`hintKeepTrack` handles partial completion.** A multi-square step the player
  fills one cell at a time should advance gracefully: the move must set the
  hinted value into a **subset** of the step's cells (and nothing else) →
  `"completed"` when it fills the last one, else `"onTrack"` with the step
  **shrunk in place** (`step.move` / `step.highlights` updated to the remaining
  cells, which the interface explicitly permits on `"onTrack"`) so a later
  `executeHint` doesn't re-fill what's done. Touching a non-target cell, or the
  wrong value, is `"off"`.

### One technique's evidence may be genuinely non-local — say so honestly

Three of Filling's four solver techniques have clean local evidence (the region
that must grow / can't complete, or the neighbours that pin a lonely cell). The
fourth — candidate elimination (`learn_bitmap_deductions`) — reasons *globally*:
a number is ruled out because an orthogonal neighbour equals it **or** because no
region of that size can reach the cell. The adjacency eliminations are local (the
filled neighbours, which the hint shades); the reachability eliminations are not
cleanly localisable. Don't fabricate a tidy area for them — the narration states
*both* mechanisms honestly ("it would sit next to an equal number, or belong to a
region that can't reach the right size here"), and the **visible-evidence
invariant is asserted only for the three local techniques** and relaxed
(explanation + target) for the global one. Surfacing the step honestly beats
omitting it (a gap would break the plan's path to the solution). See
`filling-hint.test.ts`'s "every local-technique deduction carries evidence" test.

### When the evidence is *filled and is a colour*, ring it — don't shade it

Range shades its evidence because its premises are usually *undecided* cells (a
clue's line of sight, a reach run). Other games are the opposite: Unruly's
evidence is the **already-placed** cells — the same-colour pair a three-in-a-row
deduction reads, the completed quota of a finished count, the near-complete
reserved window. A light-blue fill over a black/white tile would hide the very
colour that *is* the reason. So split the highlight: **shade only still-empty
cells** (the journey's forced siblings, so the player sees the whole line fill),
and **ring filled premise cells in `COL_HINT`** (their colour stays visible).
This is the general form of Range's "a premise that can't take the area fill is
ringed" — for a fill-style game it's the *common* case, not the exception.
Exemplar: `buildHighlights` in
[`unruly/index.ts`](../../src/native/games/unruly/index.ts) (target / area / ring)
+ the `FF_HINT_*` bits in
[`unruly/render.ts`](../../src/native/games/unruly/render.ts).

### Grouping a fill-helper firing into one journey

Quality-bar rule 2 (one firing = one journey) has a clean seam when the solver
fills a whole line through a shared helper: thread the recorder through that
helper (Unruly's `fillRow`) so its first cell opens a journey
(`continuesPrevious: false`) and the rest continue it (`true`); per-cell
techniques (Unruly's threes/unique) emit independent steps. The midend then keeps
the journey displayed across its legs. See `fillRow` +
[`unruly/solver.ts`](../../src/native/games/unruly/solver.ts) `deduceHintPlan`.

### Non-deductive games: a heuristic hint with no narration

Not every game is deductive. **Untangle** has no logical "why" — no move is
*forced*, you just want fewer crossings — so quality-bar rule 1 (explain *why*)
doesn't apply, and forcing a narration would only fabricate a non-sequitur.
By owner approval, such a game ships a hint with an **empty `explanation`**: the
visual highlight plus the existing move animation *are* the whole hint.

Pattern (exemplar: [`untangle/hint.ts`](../../src/native/games/untangle/hint.ts)):

- **Objective, not deduction.** Pick the move that most improves a cheap scalar
  objective (Untangle: the number of edge-crossing *pairs*, returned from
  `findCrossings`). A greedy loop on a *working copy* of the state — take the best
  strictly-improving single move, apply, repeat until solved / no improvement /
  step cap — yields a multi-step plan that auto-hint plays as a progressive
  cleanup. Untangle's per-move candidate is "move a tangled vertex to the centroid
  of its graph-neighbours" (a barycentric step); any heuristic that reliably
  improves the objective is fine.
- **Secondary objectives as a tie-break, not a second pass.** Untangle's plain
  barycentric step works but *collapses the layout toward the centre* (the Tutte
  smoothing fixed point with no pinned boundary). Fix it by giving each move
  several candidate targets (the centroid plus outward-pushed variants) and, among
  the targets achieving the *best primary score*, picking the one that best
  satisfies a secondary objective (here: a pairwise anti-clustering score, Σ
  1/(dist+ε)). Keep the primary strictly primary — the plain centroid stays a
  candidate, so untangling power isn't sacrificed for spread (verify with a
  same-board A/B: the enhanced heuristic should stall no more than the plain one).
  A multi-objective tie-break beats a "untangle, then spread" second pass, since
  the puzzle ends the instant the primary hits zero (a solved board clears the
  hint) — the final solved frame must already be spacious.
- **Refuse honestly.** `{ ok: false }` when solved, and also when *no* single move
  improves the objective (a local minimum the player must break themselves) —
  don't emit a no-op or a worsening move.
- **No `hintKeepTrack`.** The default `"off"` verdict is correct: the greedy tail
  was computed for exact targets, so any player deviation should drop the plan and
  the next request recomputes.
- **Highlight = the suggestion.** Carry a `{ vertex/cell, to }` highlight and, in
  `redraw`, draw the move (Untangle: a `COL_HINT` line from the piece to its
  destination + a `COL_HINT` marker at the destination). Read the *source* from
  the live state so an auto-hint slide shows the line shrink to nothing as the
  piece arrives. **Fold the hint signature into the redraw early-out** — a manual
  hint moves no piece, so a full-frame game that early-outs on "nothing moved"
  would otherwise skip painting the hint entirely.
- **Animation is often free.** A game that already animates its moves (Untangle's
  `mix()` vertex interpolation) needs *nothing* extra: a hint-executed move rides
  that pipeline and the midend stretches it to `HINT_ANIM_S`.

#### Walk to the known solution via `aux` (when a local heuristic can't finish)

A local objective heuristic is appealing but can **stall at a local minimum** and
look bad doing it (Untangle's centroid heuristic clustered vertices centrally and
failed to fully untangle larger boards). If the game *knows* its solution — the
generator's `aux`, the same value `solve` uses — walking the player there is a
legitimate, robust hint. The `hint(state, aux?)` hook receives `aux` (the midend
passes its stored value; present for generated games, absent for descriptive ids /
some loads), so prefer the `aux` plan when present and keep the heuristic as a
fallback. Pattern (exemplar: `untangle/hint.ts` `deduceAuxPlan`):

- **Match the closest symmetry.** A solution unique up to symmetry has several
  equivalent layouts; pick the one closest to the current positions so the
  suggested motion is minimal (`dihedralSolvedUnits` — shared with `solve`).
- **Rescale to taste — affine maps preserve planarity.** A uniform (or any affine)
  transform of a crossing-free straight-line layout stays crossing-free, so you can
  freely **rescale the solution to fill the play box** for spacing without
  reintroducing crossings. This is how Untangle satisfies "space them apart" while
  guaranteeing a solved result.
- **Order for a pleasing reveal.** Emit one move per vertex, greedily choosing the
  next vertex whose placement keeps intermediate crossings lowest, so auto-hint
  reads as a steady untangle that ends solved.
- **Share the solution-decoding with `solve`.** Extract the `aux` parse + symmetry
  match into the game's `state.ts` so `solve` and `hint` don't duplicate it.

### Placement animation as hint motion (fill-style games)

A game with no upstream move animation (`animLength` 0) can still make auto-hint
read as motion by adding a short **geometric** placement animation: `drawRect`
takes a palette **index**, not RGB, so don't colour-tween — grow the new colour
from the cell centre over `animTime`, drawing the previous colour beneath
(animating cells bypass the cache via the Flip 255-sentinel idiom). Return a small
base `animLength` for a single-cell change (0 for bulk `solve`/no-ops); because
it's > 0, the midend stretches a hint-executed move to the uniform `HINT_ANIM_S`,
so each auto-hint step plays as a visible fill with no frozen gap. Exemplar:
Unruly's `animLength` (count changed cells) + the grow branch in `drawTile`
([`unruly/render.ts`](../../src/native/games/unruly/render.ts)).

**Testing gotcha — the easiest rule pre-empts hand-crafted boards.** A solver that
tries techniques easiest-first means a crafted board often fires a *different*
rule than intended: an alternating `O_E_O_E` Unruly row is a three-in-a-row
deduction (`O_O`), not a count completion. Craft for the per-cell techniques
(threes/unique/near-complete have isolating layouts), but validate **grouping**
on a *generated* board (scan a few seeds for a `continuesPrevious` leg, then check
it shares its predecessor's firing). See `unruly-hint.test.ts`.

**Verify in-process (no eyeballing)** with the tier-2.5 render-scenario harness
([`src/native/engine/testing/render-scenario.ts`](../../src/native/engine/testing/render-scenario.ts)):
`renderScenario({ game, id, moves?, showHint?, hintUntil? })` drives a real
`Midend` to the hint frame (walk a multi-step plan with `hintUntil`), then assert
targeted ops (`COL_HINT` present, clues still drawn) **plus** `toMatchSnapshot`.
Seed: `palisade-render-scenario.test.ts` reaches the `equivalentEdges` frame the
Playwright harness couldn't. To reach a specific deduction without its desc, do a
fixed-seed scan (loop ids, keep the first whose `result.hint` matches).

## 5. Method lesson: probe before trusting a mechanism diagnosis

Twice in one hint session, a plausible mechanism diagnosis ("the second leg reads
as off-plan", "the plan is being dropped") was wrong and dissolved by a ~20-line
probe test. When a hint misbehaves, write the smallest probe that observes the
actual `activeHintStep()`/state rather than reasoning forward from the suspected
cause. See "Hint-UX session" in [`AGENTS.md`](../../AGENTS.md).
