# Design — the hint framework audit

**Status: hypotheses, not decisions.** Everything below is what the *current* evidence
suggests. Phase 0 confirms or kills each one. A fresh session should be able to pick this
up cold: every claim points at a file or a commit.

## The decision criteria (apply to every candidate seam)

A seam is worth extracting only if it clears **all four**:

1. **It has already bitten twice.** Not "a game might want this" — *two or more shipped
   games got it wrong, or two or more re-derived it*. Cite the commits.
2. **The game-specific part survives intact.** The exemplars (Palisade's deduction bar,
   Inertia's stable subgoal, Towers' recorded eliminations, Filling's grouped multi-square
   step) must be expressible through the seam **without losing a word of what they say**.
   If the seam flattens a good hint, the seam is wrong — the hint is the product.
3. **It removes work from the *next* port**, measurably: "a new hinting game writes N
   fewer lines and cannot make bug class X."
4. **It retires a rule from `hint-authoring.md`** — turning a rule a human must remember
   into something the types, the engine, or a shared guard enforce. A seam that leaves the
   guide the same length has probably just moved code around.

Criterion 4 is the sharpest one and the one to lead with. **The guide is a list of ways we
have been hurt. Every line of it is a defect waiting for a new port.**

## Candidate seams (hypotheses, in rough confidence order)

### S1 — Hint marks and animation (highest confidence)

*Evidence:* `edadec1` (Netslide, this session — two distinct bugs in one symptom);
`hint-authoring.md` §5.8, written from it. The underlying facts are engine facts, not game
facts: (a) the midend advances the plan at animation **end** (`settleHint`), so a
displayed step's cell indices refer to the **pre-move** board while its own move animates;
(b) a mark on a *moving thing* must ride the animation and a mark on a *fixed cell* must
not.

*Hypothesis:* the engine can own this. A game declares its marks as **typed** — "this
marks a piece" vs "this marks a cell" — and the engine resolves position and paint order,
instead of each game hand-threading indices through its `redraw`. Sixteen and Fifteen have
the identical structure and should be checked for the same latent bug **as part of Phase 0**
(they may be sitting on it right now, unreported).

*Open question:* Netslide's fix needed to know "is *this step's own* move the one
animating". Is that knowable generically from the midend (which knows the move it is
animating and the step it is displaying) — i.e. should the midend simply hand `redraw` a
step whose marks are already resolved against the board being drawn? That would delete the
whole class rather than document it.

### S2 — The solver-narrator (the deduction engine)

*Evidence:* three different answers to one question — `latin.ts`'s gated recorder (Towers,
Keen, Unequal), Solo's bespoke recorder, and the *parallel* recorders in Pattern and Undead
(a second implementation of the deduction, running beside the solver, kept in sync by hand).
The `narratable-deduction-engine` doctrine already says there should be **one engine per
logic game, with the solver and the hint as two projections of it**.

*Hypothesis:* a shared "deduction recorder" contract — a solver emits *firings* (rule
name, premises, forced conclusions); the hint narrates them; the generator ignores them
(recorder off ⇒ byte-identical, which is the existing gate and must stay). `deduction-fixpoint.ts`
(3 users) and `candidate-hint.ts` (4 users) are the two halves of this already half-built.

*Risk (state it plainly):* this is the seam most likely to be **over-abstracted**. Pattern's
enumeration and Palisade's region arithmetic are genuinely different kinds of deduction. The
test is criterion 2 — if Palisade's "both edges share a fate" cannot be said through it, stop.

### S3 — Narration vocabulary and the quality bar

*Evidence:* `hint-vocab.ts` exists but has **only 3 users** of 20. The bar's rules
(indication-first; terse; conclusion matches the move type; colour legend with a non-colour
cue; name what the player can see; rules belong in the help) are enforced by review and by
per-game tests that each game re-writes.

*Hypothesis:* some of these are mechanisable as **shared guards** rather than shared code —
a cross-game test every hinting game is enrolled in (as `hint-resume.test.ts` already is for
plan convergence), asserting e.g. sentence length bounds, no un-narrated fallback, the
arrival/setting-up marker present, no forbidden modal in a movement game. Cheaper than an
API and it cannot be forgotten by a new port.

### S4 — Overlay-to-cache plumbing

*Evidence:* playbook §3.2; shipped twice (hint overlay invisible; Towers' `ds.wrong`
invisible). Every game hand-packs overlay bits into its cache key and every game can forget.

*Hypothesis:* the engine, not the game, should decide that a frame carrying a *different
overlay* is a *different frame*. If the game cannot forget, the class is gone.

### S5 — Plan lifecycle and stability

*Evidence:* Inertia's for-ever loop; Netslide's ping-pong; `hint-resume.test.ts` (the guard
that exists); `step-budget.ts` (13 users — the one thing everyone did adopt).

*Hypothesis:* mostly **already shared**; the gap is that "monotone potential, never cache
the plan" is a *doctrine* rather than a shape the code makes natural. Possibly the cheapest
seam of all: enrol every hinting game in the existing guard and be done. **Check first
whether all 20 are actually enrolled** — if they are not, that alone is a finding.

## Sequencing (if Phase 1 says go)

One seam at a time, and within a seam one game at a time, each landing green. Start with
**S1** (smallest, sharpest, freshest evidence, and it may be sitting live in Sixteen and
Fifteen right now). **S2 last** — it is the biggest and the one where a wrong abstraction
does the most damage.

Do **not** open S2 and S1 in the same change. The scene-graph postmortem's lesson is not
"never refactor"; it is "do not let a framework pivot ride along with other work, because
then nobody can tell which part was the mistake."

## What would make us stop

- Phase 0 finds the recurrence is concentrated in **one or two games**, not spread — then
  it is those games' bugs, not a missing framework.
- Any seam that cannot express an exemplar hint without loss.
- The extraction starts requiring games to contort their deductions to fit a contract.
  The hint is the product; the framework serves it, never the reverse.
