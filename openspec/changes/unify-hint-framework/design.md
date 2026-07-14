# Design — the hint framework audit

**Status: Phase 0 complete (findings below, 2026-07-14); Phase 1 verdicts recorded; awaiting owner confirmation (task 1.2) before any extraction.** The original hypotheses are kept as written; the audit findings and per-seam verdicts follow them.

**Status of the original hypotheses: hypotheses, not decisions.** Everything below is what the *current* evidence
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

---

# Phase 0 — Audit findings (2026-07-14)

## 0.1 Inventory: all 20 hinting games

Legend — *recorder shape*: **gated-own** = a `recorder?`/`record` callback threaded through
the game's real solver (recorder off ⇒ generator path byte-unchanged); **gated-shared** =
the same, but the solver is the shared `engine/latin.ts`; **bespoke** = a recording layer
written for the hint but still driving the real solver; **parallel** = a second
implementation of the deductions running beside the solver, kept in sync by hand;
**planner** = movement search, no deduction recording. *Overlay*: **key-bits** = hint bits
packed into the per-tile `Int32Array` cache word; **sidecar** = `ds.hintPacked` +
`ds.drawnHint` parallel arrays; **scalar** = drawstate fields + repaint-on-change.
*kt/rf/cp* = `hintKeepTrack` / `refreshHintStep` / `continuesPrevious`.

| Game | Kind | Shared hint modules | Recorder shape | Mark vs. animation | Overlay→cache | kt/rf/cp | ~LOC |
|---|---|---|---|---|---|---|---|
| dominosa | deductive | — | gated-own (`solver.ts:820`) | static, n/a | key-bits (6 bits) | ✓/✗/✓ | 215 |
| fifteen | movement | hint-vocab | planner (greedy solver replay) | tile mark **identity-keyed**, rides | scalar (`ds.hintTile` in key) | ✓/✗/✗ | 95 |
| filling | deductive | step-budget | hybrid: gated-own + bespoke region grouping | static, n/a | key-bits | ✓ (`onTrack` shrink)/✗/✗ | 160 |
| flood | objective | step-budget | solver-sequence replay | static, n/a | key-bits (upstream `SOLNNEXT`) | ✓/✗/✗ | 35 |
| inertia | movement | — | planner (bespoke `hint.ts`, solver as witness) | arrow rides ball sprite (suppressed mid-slide); goal ring fixed cell | split: key-bit ring + uncached sprite arrow | ✓/✗/✗ | 440 |
| keen | deductive | candidate-hint, latin-hint, step-budget | gated-shared (`latin.ts`) | static, n/a | key-bits + sidecar | ✓/✓/✓ | 350 |
| lightup | deductive | step-budget | gated-own (live solver) | static, n/a | key-bits | ✓/✓/✗ | 300 |
| netslide | movement | slide-planner, hint-vocab | planner (shared `planSlides`) | **the S1 fix**: tile mark resolves `landing` while its move animates; outlines drawn post-loop | key-bits + separate arrow diff | ✓/✗/✓ | 800 |
| palisade | deductive | step-budget | hybrid: shared primitives, hint-only fixpoint (`solver.ts:499`) | static, n/a | key-bits (bits 23–27) | ✓/✗/✓ | 280 |
| pattern | deductive | deduction-fixpoint, step-budget | **parallel** (`packLeft`/`packRight` beside `solvePuzzle`) | static, n/a | key-bits | ✓/✗/✗ | 400 |
| range | deductive | step-budget | gated-own | static, n/a | key-bits | ✓/✗/✗ | 300 |
| singles | deductive | step-budget | bespoke (own `HintRecord`) | static, n/a | key-bits | ✓/✗/✗ | 380 |
| sixteen | movement | slide-planner, hint-vocab | planner (shared `planSlides`) | tile mark **identity-keyed**, rides; target border drawn post-loop, fixed | scalar fields + repaint-on-change | ✓/✗/✓ | 400 |
| slant | deductive | — | gated-own (replays player marks first) | static, n/a | key-bits (ring-extended grid) | ✓/✗/✓ | 350 |
| solo | deductive | candidate-hint, latin-hint, step-budget | bespoke (own `DeductionRecorder`, shared harness on top) | static, n/a | **sidecar** (cache word full) | ✓/✓/✓ | 600 |
| towers | deductive | candidate-hint, latin-hint, step-budget | gated-shared (`latin.ts`) | static, n/a | sidecar | ✓/✓/✓ | 470 |
| undead | deductive | deduction-fixpoint, step-budget | **parallel** (`recordUndeadDeductions` re-runs the ladder) | static, n/a | sidecar | ✓/✓/✓ | 550 |
| unequal | deductive | candidate-hint, latin-hint, step-budget | gated-shared (`latin.ts`) | static, n/a | sidecar | ✓/✓/✓ | 400 |
| unruly | deductive | step-budget | gated-own | static, n/a | key-bits | ✓/✗/✓ | 300 |
| untangle | movement | — | planner (aux-layout assembly + greedy fallback) | full-canvas repaint; hint line shrinks live | full repaint (no per-tile cache) | ✗/✗/✗ | 380 |

What the table says, compressed:

- **Overlay→cache is re-derived 20 times in 3 shapes** (11 key-bits, 5 sidecar, 4
  scalar/full-repaint), and every one of them is hand-written plumbing a game can get
  wrong. This is S4's evidence, and it is spread across every game.
- **The recorder question has six answers, not three** (gated-own ×6, gated-shared ×3,
  bespoke ×2, parallel ×2, hybrid ×2, planner/replay ×5) — worse than the proposal's
  count, but with a clear centre of gravity: *gated recorder through the real solver* is
  already the plurality and the doctrine-compliant shape. The two parallel recorders
  (pattern, undead) are deliberate byte-match armour, documented as such in-code.
- **`refreshHintStep` exists only in the candidate-elimination family** (keen, lightup,
  solo, towers, undead, unequal) — elsewhere staleness is handled by
  `hintKeepTrack` + recompute. Not obviously a defect, but it is 14 games relying on a
  weaker mechanism than the 6 that got bitten hardest (`fix-stale-hint-step`).
- **`hint-vocab` (3 users) is not under-adopted — it is sliding-game-specific** (its
  users are exactly fifteen/sixteen/netslide, the games that say "working on tile N").
  The proposal's "adoption is uneven" read was partly an artefact of counting.

## 0.2 The hint fix commits, classified

All 22 hint-carrying fix commits (21 `fix(...)` + `e526bf4`, the original Sixteen
local-minima fix inside a feat) were read and classified into the proposal's six classes
plus a seventh (UI-shell). Multi-defect commits were assigned a primary class.

| Class | Commits | Games hit | Recurred across games? |
|---|---|---|---|
| 1 Marks vs. animation | `edadec1` | Netslide | **No — single game** |
| 2 Overlay vs. cache | *none in the fix set* | Towers (`ds.wrong`, playbook §3.2) + the earlier hint-overlay instance | **Yes — but via non-`fix(hint)` commits** |
| 3 Plan stability | `e526bf4` `7e3eddd` `4c6cb7f` `7ae76c5` | Sixteen (all four) | **Shipped fixes: single game.** (Inertia's for-ever loop and Netslide's ping-pong were caught *in development*, so the class did bite three games — but only Sixteen's reached `main`.) |
| 4 Keep-track / refresh | `7b0e535` `a6af072` `5e4f7b0` `913cb5b` | Towers, Sixteen, Fifteen | Yes ✓ |
| 5 Narration quality | `d0633af` `93f289e` `04f0d7e` `d1f37b8` `9172d7a` `7b39885` `8d4007a` | Keen, Towers, Unequal, Singles, Range, Unruly, Netslide, Sixteen — **8 games, the broadest class** | Yes ✓ |
| 6 Solver↔narrator | `e00d2bc` `914ac21` | Towers, Singles | Yes ✓ |
| 7 UI-shell | `d6d6d51` `3dcb604` `75d09e3` `4edd933` | cross-game shell | Yes ✓ (and since fixed *in the shell*, structurally) |

Two proposal premises did **not** survive the reading:

- **Class 1 is not a recurring class.** One game, one commit — and §0.3 below shows why
  it is structural, not accidental: the class only exists where a game marks a *moving*
  thing by cell position instead of identity.
- **Class 3's shipped recurrence is one game** (Sixteen — the only search-based planner
  at the time; deductive games do no heuristic search and cannot loop). Its cure is
  already shared and guarded (`slide-planner.ts`, `hint-resume.test.ts`).

Classes 4–7 recurred as hypothesised. Class 4's fixes landed mostly *in the midend* —
i.e. that seam has been progressively closing itself structurally with each bite. What
recurs and is still open is **class 5 (narration quality, 8 games)** and the guard gap of
**class 2 (overlay→cache, hand-plumbed 20× per §0.1, guarded only per-game)**.

## 0.3 The suspected live S1 bug in Sixteen and Fifteen: **not there — and now guarded**

Read against `edadec1` and then pinned at an actual mid-slide frame (pre-move redraw to
warm the cache, then `redraw(prev, state, animTime = animLength/2)` with the step still
displayed, asserting the marks' exact drawn coordinates):

- **Sixteen**: the tile mark is keyed by **tile number** (`t === hintTile` inside the
  tile loop), so it is painted at the tile's interpolated position and rides the slide by
  construction; the target/ultimate borders are drawn **after** the tile loop at the
  cell's own unshifted coordinates (`index.ts:778-784`). Both properties now asserted in
  `sixteen.test.ts` ("the hint marks while the hinted slide animates").
- **Fifteen**: the mark is likewise identity-keyed and painted as the moving tile's
  background in the interpolated pass (`index.ts:395`); there is no fixed-cell mark.
  Asserted in `fifteen-render.test.ts`.

**Why Netslide got it and these didn't**: Netslide's tiles are anonymous wire-masks, so
its hint must mark a *cell index*, and a cell index is board-relative — stale the moment
the midend swaps in the post-move board under a still-displayed step. Sixteen/Fifteen
tiles carry unique numbers, so their marks are board-independent. **The S1 class is real
but narrower than hypothesised: it exists only where a game marks moving things by
position rather than identity.** That is one game today (Netslide), plus any future port
with anonymous moving pieces (Netslide-likes; Inertia dodges it a third way, by
suppressing its arrow mid-slide).

## 0.4 `hint-resume.test.ts` enrollment: **complete**

`HINT_GAMES` lists exactly the 20 games above — every game shipping `hint()` is enrolled
in all three cross-game guards in that file (plan-never-contains-a-no-op-step,
hint-is-pure-on-state, hints-solve-from-any-mid-game-position). No gap. The
plan-stability *convergence* guarantee (S5) is therefore already structurally guarded;
what remains doctrine-only is the *monotone potential* design rule itself (the guard
catches divergence when a seed happens to expose it, not the design error as such).

## 0.5 `hint-authoring.md` rules: structural / guarded / remembered

Every normative rule in the guide (1,591 lines) was enumerated — 70 distinct rules — and
classified. *Structural* = the engine/types make the mistake impossible; *guarded* = the
cross-game `hint-resume.test.ts` catches it for every hinting game; *remembered* = only
review or a per-game test (which a new port does not inherit) prevents it.

**Counts: ~8 structural, 5 guarded, ~57 remembered** (of which ~14 carry a per-game test).

The structural rules are the midend's plan lifecycle: auto-hint pacing (§1.4), the
`HintResult` shape, `hintKeepTrack` pre-move timing, `continuesPrevious` display
handling, `refreshHintStep` being called, refusal→`findMistakes`+banner (§4), and the
show/apply stepper (§5.1). The guarded five all live in **one file**,
`hint-resume.test.ts`: resume-to-solved from any position (§7.1 — the rule that caught
Inertia), no-op-free plans (§7.3 intrinsic form), hint purity on state, and the
Latin naked-single honesty check (§9.3a). **Everything else — every narration-quality
rule (§2 in its entirety), every render/colour-legend rule (§5), every recorder-gating
rule (§9) — is remembered.**

The *most mechanisable* remembered rules, in leverage order:

1. **Necessity-modal voice (§2.1)** — a regex check already exists per-game in
   `singles`/`towers` hint tests; `hint-resume.test.ts` already enumerates every hinting
   game, so lifting it cross-game is a loop-body, not an API.
2. **Every deductive step carries visible evidence (§5.2)** — `HintStep.highlights` is
   uniform; "no deductive step has empty evidence" is checkable generically (with a
   declared per-game exemption for §5.6 non-local techniques and for Untangle).
3. **Narration length cap (§2.5/§2.9)** — `netslide-hint` asserts ≤120 chars; a
   cross-game cap over a seed scan catches the "rulebook bled into the step" class.
4. **Step-budget on hint fixpoints (§7.2)** — currently opt-in and unguarded; making
   `runDeductionFixpoint` the sanctioned entry point moves it toward structural.
5. **Colour-role separation (§5.3)** — `towers-hint` asserts a strike frame draws no
   `COL_HINT` background rect; generalises to every candidate-elimination game.

The audit's sharpest observation: **all cross-game guarding sits in a single test file
that guards only four behavioural invariants.** The guide's other ~57 rules are exactly
what the proposal called "a list of ways we have been hurt", enforced by memory.

---

# Phase 1 — Verdicts (2026-07-14, pending owner confirmation)

Scored against the four criteria: (1) bitten twice across games, (2) exemplar hints
survive intact, (3) removes work from the next port, (4) retires a rule from the guide.

## S1 — Hint marks and animation: **NO-GO as an engine seam** (closed by guards instead)

- Criterion 1 **fails**: one game, one commit (§0.2). The audit dissolved the hypothesis
  rather than confirming it — the class only exists where a hint marks a *moving* thing
  by cell position, and every game with identity-bearing pieces (Sixteen, Fifteen) is
  structurally immune. A typed marks contract ("this marks a piece / this marks a cell")
  would be engine machinery for a one-game problem, exactly the scene-graph mistake.
- What landed instead, in Phase 0: mid-slide-frame guards in `sixteen.test.ts` and
  `fifteen-render.test.ts` (Netslide already had one), so all three games that paint
  hint marks during an animation now pin the mark's coordinates at a mid-animation
  frame. §5.8 of the guide stays, reworded to lead with the identity-vs-position
  distinction (the *next* Netslide-like port is the residual risk).

## S2 — The solver-narrator contract: **NO-GO**

- The risk stated in the hypothesis ("most likely to be over-abstracted") is what the
  audit found: six recorder shapes (§0.1), of which the two *parallel* recorders
  (Pattern, Undead) are deliberate byte-match armour documented in-code, and the two
  class-6 bugs (§0.2) were fixed where they arose — one of them (`e00d2bc`) *in the
  shared `latin.ts`*, which fixed Towers/Keen/Unequal at once, i.e. the sharing that
  already exists is doing its job at the right grain (a solver family, not "deduction").
- Palisade's region arithmetic, Pattern's run-packing and Undead's sightline ladder are
  genuinely different deductions; a contract wide enough to hold all three says nothing.
  Criterion 2 could not be shown to hold, and criterion 4 retires no rule (§9's rules
  are about *when to gate vs parallel*, which stays a judgement call).
- Residual: nothing to build. The narratable-deduction doctrine + `deduction-fixpoint` +
  `candidate-hint`/`latin-hint` remain the shared grain; new latin-family games inherit
  them already.

## S3 — Narration quality as cross-game guards: **GO**

- Criterion 1: broadest class of all — 8 games (§0.2). Criterion 2: guards assert *form*
  (modal voice, evidence present, length bound), never content — no exemplar loses a
  word. Criterion 3: a new port inherits the guard by being added to `HINT_GAMES`, which
  `hint-resume.test.ts` already requires. Criterion 4: rules #13, #18/#22, #37 (§0.5)
  move from *remembered* to *guarded*; the guide keeps one line + a pointer each.
- Shape: a `hint-quality.test.ts` sibling of `hint-resume.test.ts`, iterating the same
  `HINT_GAMES` list over fixed seeds: (a) every deductive conclusion carries a necessity
  modal / no bare "is/stays" (the existing per-game regexes, unified); (b) every
  deductive step has non-empty highlights (declared exemptions: Untangle, §5.6
  non-local); (c) narration length cap. Per-game *content* tests stay per-game.

## S4 — Overlay-to-cache: **GO as a cross-game guard; NO-GO as engine ownership**

- Criterion 1: shipped twice (hint overlay; Towers `ds.wrong` — playbook §3.2), and §0.1
  shows the plumbing hand-written in all 20 games in 3 shapes. Criterion 4: playbook
  §3.2's "guard it with a paint-twice test" — today a *per-game* prescription — becomes
  a cross-game guarantee.
- Engine ownership of the cache ("a frame with a different overlay is a different
  frame") is rejected: each game owns its drawstate and cache shape by doctrine (the
  scene-graph withdrawal), and 20 working implementations are not worth churning.
- Shape: the guard is fully generic and needs no per-game colour knowledge — for every
  hinting game: render a settled frame (warm cache), then redraw the *same* drawstate
  with a newly displayed hint (and, where `findMistakes` exists, a mistake overlay) and
  assert the redraw emits ops; then clear and assert it repaints again. An overlay left
  out of the diff key emits nothing on exactly that second frame.

## S5 — Plan lifecycle and stability: **NO-GO (already done — record it as such)**

- Enrollment is complete (§0.4); the engine already owns the lifecycle structurally
  (§0.5's structural list is precisely this seam); the shipped loop-class was one game
  (§0.2) whose cure (`slide-planner.ts`) is already shared by both slide games.
  Extracting further would be code motion with no bug class behind it. The monotone-
  potential rule stays doctrine — it is a *design* property; the guard catches its
  violation when seeds expose it, which is what caught Inertia.

## Sequencing (if the owner confirms)

One follow-up-sized tranche inside this change (Phase 2), not new machinery: land
`hint-quality.test.ts` (S3) and the overlay paint-twice guard (S4) — both are test-only,
convert no game code, and enrol all 20 games at once; fix whatever they flush out (each
is designed to catch real, currently-invisible defects); then retire/condense the
corresponding guide rules and record the line-count delta. S2 and S5 are recorded no-gos;
S1 is closed by the Phase 0 guards. If the guards flush out per-game defects larger than
a few lines each, split their fixes into their own change per the one-seam-one-change
rule.

---

# Owner decision (2026-07-14) and the re-scored Phase 2

The owner confirmed **both guard tranches (S3 + S4): GO** — and revised the bar itself:
the four criteria were too harsh, specifically the "bitten twice" requirement. Direction:
*abstractions that make the codebase noticeably cleaner are worth implementing on their
own merits*, not only ones that provably prevent a future defect. (Recorded as standing
guidance in agent memory: `feedback_cleanliness_justifies_refactor`.)

The unchanged guardrails: exemplar hints lose nothing; game deductions are never
contorted to fit a contract; scene-graph-scale pivots still need real downstream
pressure.

## Phase 2 worklist (revised)

**2a — the guards (committed scope, land first):**

1. **S4 — overlay paint-twice guard**: cross-game, generic (no per-game colour
   knowledge): warm a settled frame, then a newly displayed hint (and mistake overlay,
   where `findMistakes` exists) must make the *same* drawstate emit draw ops; clearing it
   must repaint again. Catches any overlay left out of a cache diff key.
2. **S3 — `hint-quality.test.ts`**: narration-form guards over `HINT_GAMES` × fixed
   seeds: necessity-modal voice on deductive conclusions, non-empty step evidence
   (declared exemptions where honest), narration length cap. Tuned empirically —
   failures are either real defects (fix) or documented exemptions (never a loosened
   regex to meaninglessness).

**2b — cleanliness refactors (unlocked by the revised bar).** Candidates from the §0.1
inventory, to be sized and landed one at a time, suite green at each step:

- **Overlay sidecar/key-bit plumbing helper**: the `hintPacked`/`drawnHint` sidecar
  pattern is hand-copied across 5 games and the key-bit variant across 11; extract a
  small shared helper (or two — one per shape) so a game declares its overlay rather
  than re-writing the diff-and-repaint dance.
- **Towers/Unequal hint-stack dedupe**: §0.1 found their stacks structurally identical
  (same delegation to `candidate-hint`/`latin-hint`, same sidecar render shape) —
  fold the copies together where they are byte-for-byte parallel.
- **Recorder-shape convergence where it is *free***: Singles' bespoke `HintRecord` and
  Solo's bespoke `DeductionRecorder` predate the shared types; align naming/shapes with
  `latin.ts`'s recorder vocabulary where no byte-match risk exists (recorder-off paths
  untouched). Pattern/Undead's parallel recorders stay — deliberate byte-match armour.
- **Dead/underused module sweep**: verify `engine/hint-entry.ts` consumers (a zero-import
  module is a deletion), and re-home per-game helpers that grew second consumers.

S2 as originally scoped (a unified deduction-recorder *contract*) remains a no-go even
under the relaxed bar — it fails the exemplar guardrail, not the defect-history one.

---

# Phase 2a — landed (2026-07-14)

**The shared enrollment list** (`src/native/engine/testing/hint-games.ts`): `HINT_GAMES`
extracted from `hint-resume.test.ts`; all cross-game guards iterate it, so a new port
enrolls once and is covered by every guard — the coverage of the guards can no longer
drift apart.

**S4 — `hint-overlay.test.ts`**: warm the midend's drawstate with a settled frame, then
display a hint and require the same drawstate to emit paint ops; a step that paints
nothing is legitimate only if it declares no board marks (the candidate games' populate
opener — banner-only by design, owner-accepted UX), in which case the guard applies the
opener's own move and judges the next display. Two findings flushed out:

1. **A real engine fix**: `Midend.playMoves` skipped `hintKeepTrack` (documented) but
   also left the stored plan in place — and the midend's re-validation is a no-op for
   the 14 games without `refreshHintStep`, so the next `hint()` re-showed a stale step
   that could be *illegal to execute* (reproduced on Flood: "fill colour 4" re-shown on
   an already-colour-4 board). `playMoves` now drops the stored plan, exactly as every
   other non-following transition (undo/redo/solve/off-plan input) does. Today only the
   test harness reached this; the docstring's promised "future move-scripting feature"
   would have shipped it as the `fix-stale-hint-step` class.
2. The populate steps' empty-evidence shape is now a *declared* exemption rather than an
   accident (see the S3 show-something rule).

**S3 — `hint-quality.test.ts`**: three form guards over all 20 games × fixed seeds,
calibrated by an empirical probe (silent-step count today: 0; longest narration: 281):
(a) every step shows something — board marks or words; (b) deductive conclusions use the
shared necessity vocabulary, with mechanical populate/cleanup openers recognised and
per-game owner-endorsed idioms declared in an explicit table (Filling's "fits exactly
into"); (c) a 300-char narration ceiling. Form only — no assertion touches what a hint
says about the board.

**Guide changes**: §2.1, §2.5, §5.2 now state the rule + point at the guard instead of
prescribing per-game tests; §7.1 documents one-line enrollment; playbook §3.2's
paint-twice prescription is cross-game for hint overlays (per-game only for mistake
overlays, which need a mistaken board no generic test can build). **On the "guide
shrinkage" metric**: the guide is ~1,600 lines before and after — the honest finding is
that the metric was the wrong proxy. The guide's *teaching* (why a rule exists, what the
bug looked like) is worth its lines; what changed is enforcement: three §2/§5 rules and
the overlay rule moved from *remembered* to *guarded*, and enrollment collapsed to one
line. The census in §0.5 (structural/guarded/remembered counts) is the truer metric:
guarded went from 5 rules in one file to 9 across three files, all driven by one list.

**Dedupe signals recorded for 2b** (from the guard work): the populate/cleanup step
construction (`ensurePopulated` + `POPULATE_TEXT`) is copy-pasted near-verbatim across
towers/unequal/keen/solo/undead — hoist into `candidate-hint.ts`.
