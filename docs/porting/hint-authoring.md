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

### When the evidence is *filled*, ring it — don't shade it

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
