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

### 1a. Action-clause voice: necessity for deductions, imperative for moves (house style)

A hint exists to tell the player **the next action they should take**, so the
clause that states the conclusion (the "so …" tail) must read as a decision, not
a description. The collection has **two houses**, chosen by whether the move is
*logically forced* (owner-decided 2026-06-19):

- **Deductive games** (Singles, Range, Filling, Unruly, Palisade — the move is
  *forced* by the rules): state the conclusion with a **modal of necessity** —
  `must be` / `can only be` / `can't be` / `must stay`. **Never** a static
  state-of-being verb (`is` / `are` / `stays` / `it's`): "so it **stays** white"
  and "this cell **is** black" describe a continuing state instead of a forced
  decision and read as flat — rewrite to "so it **must be** white", "this cell
  **must be** black". The necessity is the *teaching*: it tells the player the
  move isn't a suggestion. Keep the modal in the **conclusion clause only** —
  *premise* clauses still state facts plainly ("One of these matching neighbours
  **stays** white …, so every other copy **must be** shaded"); only the action
  the player takes gets the modal.
- **Movement / objective games** (Fifteen, Sixteen, Flood — the suggested move is
  *not* a logical necessity, just the recommended next action): use the
  **imperative** ("slide it into place", "move it to column 5", "fill with red").
  A necessity modal would be wrong here — the move isn't forced. Untangle's
  heuristic hint carries an empty explanation (see §4, non-deductive games) and is
  exempt entirely.

Pick the house by the *nature of the move*, not the genre: a deductive game whose
hint ever recommends a non-forced move would use the imperative for that step.
Palisade shows the houses can co-exist in one string — its necessity premise
("Clue c reaches its count only if every remaining edge is a wall") can carry an
imperative action tail ("draw them all"), because the forced-ness is already
explicit in the premise. A cheap guard: a hint test asserting the conclusion
contains a modal and **not** a bare "stays/is" (as the Singles `corner4` test
does for its premise phrasing).

### 1b. Lead with the indication — teach the pattern, don't just prove it (pedagogy)

**Every nontrivial hint SHALL open by naming the *indication* — the recognisable
board pattern that triggered the deduction — before any reasoning.** The player
should come away able to *spot this pattern themselves next time*, not merely
convinced that this one instance is valid. (Owner-directed, 2026-06-19.)

The metaphor: a hint is **pedagogy, not a terse textbook proof**. Dense proofs
that jump straight to "shading either of these would force a contradiction, so
both are white" leave understanding *as an exercise to the reader* — the player
believes us but learns nothing transferable. Good teaching states **what you
noticed** first, so the reasoning has something to hang on. The full arc:

> **indication** (the spotted pattern, named in board terms and generalisable) →
> **reasoning** (why that pattern forces the move) → **conclusion** (the action,
> in the §1a necessity voice).

This *sharpens* the "proof-by-contradiction arc" (§ later: signal → ruled-out
move → consequence → deduction): the **signal must come first** and be phrased as
a **pattern the player can learn to recognise** ("there's a pair of 5s in one
column and a pair of 1s in the next"), not buried mid-sentence or left implicit in
the highlight.

Worked example — Singles `offset`. Even after the concrete-values + "overlap"
fixes, it still *opened on the conclusion*: *"Shading either of these two squares
would force one of the 5s and one of the 1s to be shaded next to each other…"* —
a valid proof, but the player never learns **what to look for**. Leading with the
indication fixes that: *"There's a pair of 5s in one column and a pair of 1s in
the next, lined up so that shading either of these two squares would force one of
the 5s and one of the 1s to be shaded next to each other — and shaded squares
can't touch. So both must be white."* Now the first clause is a **teachable
recognition cue** (two equal-pairs in neighbouring lines), and the rest is the
payoff. (Read the orientation off `reason.quad` so "column"/"row" is concrete;
test it opens on the pattern — `singles-hint.test.ts` "offset" asserts
`/^There's a pair of \d+s in one (column|row)/`.)

What counts as "nontrivial": anything past a single local rule application. The
simplest cascade hints already satisfy this for free because their *signal is the
move* — Singles `adjBlack` opens *"These squares touch a shaded square, and
shaded squares can't be adjacent…"* (indication first: *touching a shaded
square*), `sameLine` *"These squares share a line with the ringed white
square…"*. The ones that need care are the multi-element deductions (offset, the
corners, the sandwich/pair pattern) — lead each with the pattern that fired it.
When in doubt, lead with the indication; it is never wrong to.

**Refer to a square by the value it shows — never a bare pronoun *or* a bare
"this square" (owner-directed, 2026-06-20).** Two tightening passes, the second
sharper than the first:

1. A hint must not *open* on a dangling *"It"* / *"They"* / *"This is…"* with no
   noun. The owner flagged Singles `sameLine` opening *"It shares a line with the
   ringed white square…"*: the *"It"* has no antecedent (the banner is the
   player's first sight of this sentence — nothing precedes it for a pronoun to
   point back to), so the reader must hunt the highlight before the sentence even
   parses.
2. But the fix is **not** *"This square shares a line…"* either — *"this square"*
   is still generic. **In a number puzzle the square's value is its name and its
   locator, so use it:** *"This 3 shares a line with the ringed white 3, which
   already uses that number — so this copy must be shaded."* Now both squares are
   identified by sight (a 3, and another ringed 3 on the same line — the
   duplicate the deduction is about is *visible in the wording*). The reference is
   free: the deduction already knows the target cell(s), so read the digit off the
   state (`numAt(targets[0])`).

**Pronouns are allowed only to avoid restating the *same* value when the
referent is obvious** — *"This 3 … so it must be shaded"* (the *"it"* is the just-named
3) is fine and better than re-saying "the 3"; an opening or ambiguous pronoun is
not. When one firing forces **several squares of differing values**, list the
values (`joinNums` → *"These squares — 3, 5 and 2 — touch a shaded square…"*)
rather than collapsing to *"these squares"*; when they **share** a value, name it
once and pluralise (*"These 3s share a line…"*). For a square that is *empty* when
acted on (Filling's target cell, Range's forced mark) there is no value to name —
anchor it on a concrete neighbour instead (*"The shaded region of N has only this
one empty square to grow into"*), which is also how to dissolve the *"This is the
only empty square…"* shape. Exemplar: every branch of `narrate` in
[`singles/index.ts`](../../src/native/games/singles/index.ts) now names a value.

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
colour. Fold the hint bits into the per-tile `Int32Array` cache (§2 of the
[port playbook](./game-port-playbook.md)). Exemplar:
[`range/render.ts`](../../src/native/games/range/render.ts).

### A hint *highlights* where to act — it never performs the move (owner-directed, 2026-06-20)

**The displayed (manual) hint must only mark the cell(s) the player should act
on — paint the target `COL_HINT` blue — and must NOT pre-render the move's
result.** Do not fill the cell with the black square / circle / colour / digit
the move would place. Two reasons, both owner-flagged on Singles: a pre-filled
mark (a) **obscures the cell's own content** (Singles painted a target black,
hiding the `1` printed there, so the hint read as nonsense against its own
narration), and (b) **reads as already-done** when applying the move is still the
player's job — the hint is advice, not the action. Keep the cell's number/state
visible under the blue highlight; let the **narration** say *which* mark to place
(this is why a forced-black and forced-white target now look identical — one blue
highlight each, "act here"). The move is performed for real only in **animation
mode**: auto-hint calls `executeHint`, which applies the move, so the cell then
renders as the actual black/circle/colour and (for fill games) can play its
placement/grow animation.

This is why several games' renders were simplified (the per-cell mark previews
deleted): Singles (no inset black / circle, number kept), Range (no inset black
square / white dot), Unruly (no inset colour). Filling already complied — its
target is a *mild* `COL_HINT` highlight with **no digit** ("input a number here",
not a filled answer). Palisade is the one different modality: its forced *edge*
is recoloured `COL_HINT` blue, which marks where to draw a wall without
obscuring any cell content, so it is a highlight, not a pre-applied black wall.
**Any new game's hint follows this rule: highlight the action site, never apply
the move.**

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

#### Element-type colour legend — different *kinds* of element, stable colours

The role-colour rule above generalises: **when a hint narration names more than
one distinct *kind* of board element** (a filled cell as premise *and* the
forced cell as conclusion; a clue *and* a region; a wall *and* a cell), give each
*type* its own highlight colour so the words map to the picture — and make it a
**stable per-game legend** (a "shaded square" is the *same* colour in every hint
that cites one), so the player learns it. Normative rule + scenarios:
[`ts-engine`](../../openspec/specs/ts-engine/spec.md) Hint System
("element-type colour legend"); per-game requirement e.g.
[`singles`](../../openspec/specs/singles/spec.md) "Singles hint colour legend".

Two non-negotiables:

- **Colour is never the sole carrier** (colourblind users). Every legend colour
  is paired with a non-colour cue — ring vs shade vs fill, the drawn digit, or
  position — and colour *names* never go in the narration text. The cell's own
  appearance often *is* the cue: Singles rings a cited **black** premise in
  `COL_HINT_BLACKREF` (teal) and a cited **white/circle** premise in
  `COL_HINT_WHITEREF` (violet), but the cell underneath is still visibly
  black/white, so the ring colour is reinforcement, not the only signal.
- **This is orthogonal to "equivalent moves share a colour" (rule 3).** The
  legend governs *premise/element types*; equivalent *forced moves* still all
  share the one target colour. Don't colour two cells differently just because
  they're different cells — only because they're different *types*.

Singles is the worked legend (`add-hint-type-colour-legend`): forced cell = blue
fill (`COL_HINT`); matching-number premise = light-blue shade (`COL_HINT_CELL`,
digit on top); cited shaded square = teal ring (`COL_HINT_BLACKREF`); cited
ringed-white square = violet ring (`COL_HINT_WHITEREF`); protected corner = amber
(`COL_HINT_STRAND`). Before this, `adjBlack`/`sameLine` ringed the decided
premise in the *same* blue as the target, so "a shaded square → a white" drew
both the same colour. The fix is render-only — the renderer already branches
shade-vs-ring on the cell's decided state, so it just picks the ring colour by
type; the `SinglesHint` payload is unchanged. Verify in-process: reach the
deduction's frame (`renderScenario` + `hintUntil` on the deduction's unique
phrase — "can't be adjacent" for `adjBlack`, "ringed white square" for
`sameLine`) and assert the cited premise carries its legend colour *and* the
target a different one. Exemplar: the ring-colour branch in
[`singles/render.ts`](../../src/native/games/singles/render.ts) `drawCell`.

**The legend is applied across every existing hint-carrying game**
(`apply-hint-colour-legend`). What each game's hints actually do — copy the
matching row when you add a hint to a similar game:

| game | move | premise type(s) → colour + cue |
| --- | --- | --- |
| Singles | forced cell, blue fill | matching number → `COL_HINT_CELL` shade + digit; cited **black** square → teal `COL_HINT_BLACKREF` ring; cited **white** circle → violet `COL_HINT_WHITEREF` ring; protected corner → amber `COL_HINT_STRAND` |
| Range | forced cell, blue fill (no mark preview) | undecided premise → `COL_HINT_CELL` shade; cited **black** square → teal `COL_HINT_BLACKREF` ring (the same hue as Singles) |
| Unruly | forced cell, blue fill (grow anim only on auto-hint execution) | empty journey siblings → `COL_HINT_CELL` shade; cited premise / pivotal cells → orange `COL_HINT_REF` ring (**one** colour, not the black/white split — its rings land on black cells, a balanced both-colour row, *and* empty windows, so a state-derived colour is ill-defined) |
| Palisade | forced edge(s), blue `COL_HINT` segments (equivalent edges all share it) | region → `COL_HINT_CELL` shade; clue → its drawn digit on the shaded cell (no extra colour) |
| Filling | target square(s), *mild* `COL_HINT` fill, **no digit** | region premise → `COL_HINT_CELL` shade + digit on top |

Two reusable lessons fell out of the rollout: (1) **teal = "a cited black
square", violet = "a cited white square"** is a *cross-game* reading worth
preserving — reuse those hues for a decided black/white premise (Singles, Range)
and pick a *different* hue (Unruly's orange) when a game's premise ring isn't a
single decided colour, so you don't imply a colour the cell isn't. (2) When the
ring set is **mixed** (filled + empty, or both colours), use **one** premise
colour, not a per-cell split — the split only works when every ringed cell is a
single decided colour (Singles/Range).

**Single-action *imperative* hints are exempt.** Movement/objective games
(Sixteen, Fifteen, Flood — § the necessity-voice houses in §1a) name only **one**
element type — the tile/colour being moved — plus the move itself; there is no
premise type to disambiguate from a conclusion, so the legend does not apply and
the existing target/arrow/region highlighting is correct. The legend bites only
when a hint narrates a *premise* distinct from the *move*. If a future movement
game grows a deductive hint that cites a premise, revisit.

**A narration whose stated premise doesn't single out the conclusion is a bug,
even when the move is right.** Quality-bar rule 1 (`AGENTS.md`) again, caught on
review of Singles' all-equal 2×2 corner (`corner4`). Its first cut read "the only
non-touching pair that leaves one white per line is this diagonal" — but *both*
diagonals of an all-equal 2×2 leave one white per line, so the premise doesn't
justify shading *this* diagonal. The real reason is connectivity: at a grid
corner the corner cell's only neighbours are its two sides, so shading the *other*
diagonal would strand it — exactly the box-in argument the sibling `corner3` text
already uses. The fix made `corner4` value-aware and reused that language ("This
corner *n* matches both its neighbours, so keeping it white would shade them both
and box it in — …"). Lesson: when two candidate moves both satisfy the stated
premise, the narration is describing the wrong reason — find the premise that
actually discriminates (here, connectivity) and say *that*. A cheap guard is a
test asserting the discriminating phrase is present and the false one absent
(`singles-hint.test.ts` "corner4" checks `not.toContain("one white per line")`).

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
consequence* → *the deduction*. Owner's wording, now generated for any corner —
and, per §1b, **opening on the spotted pattern** (a touching equal-pair at a grid
corner) before the proof: *"A touching pair of 3s sits at the corner; one of them
must be shaded. Shading this 5 would then force the 3 beside the corner 4 shaded
as well, leaving the corner boxed in on both sides — so the 5 must stay white."*
(The closing `must stay` is a §1a necessity modal; the opening clause is the
indication brought in line with `offset`/`sandwich` on 2026-06-19 — it had been
the one corner case still opening on a deduced fact. "At the corner" is robust to
either sub-case, since the matching pair is `(corner, side)` or `(side, inner)`.)
Concrete values ("the corner 4", "the touching pair of 3s") plus the highlight
disambiguate far better than role words, and the arc lets the reader follow each
link. Watch dangling pronouns: an early cut ended "…force the 3 beside the corner
4 shaded as well, **trapping it**" — "it" read as the 3, not the corner, so name
the referent ("leaving **the corner** boxed in"). Lesson: when a one-liner with
pronouns won't land, the fix is usually *concrete references + the reasoning
order*, not more words. (Colour names still
don't go in the text — colourblind users — the numbers + highlight carry it.)

**Concrete values aren't just for the hard cases — sweep every abstract pronoun
out.** The corner deductions earned concrete values because they were
*unfollowable* without them; but the bar applies to every narration, including
ones that "read fine." Singles' `offset` was the cautionary example here: *"Whichever
paired square stays white forces the one across from it shaded, so both squares
beside it must be white."* — grammatical, but a wall of deixis ("whichever", "the
one across from it", "both squares beside it") with **not a single concrete
reference**, so the player can't map a word to a square. The deduction is two
equal-pairs, so *name both values* (read them off `reason.quad` via the
`state`-aware `numAt`) — and, per §1b, lead with the pattern: *"There's a pair of
6s in one column and a pair of 4s in the next, lined up so that shading either of
these two squares would force one of the 6s and one of the 4s to be shaded next
to each other — and shaded squares can't touch. So both must be white."* Test it
stays concrete (assert the
explanation `toMatch(/\d/)` and drops the old deixis — `singles-hint.test.ts`
"offset").

**Concrete *value* and concrete *geometry* are different bars — a value-aware
narration can still lie about the layout.** A first cut of the offset fix read
*"Two 6s and two 4s **overlap, offset by a square**…"* — concrete values, but
geometrically **false**: the offset solver pairs equal numbers *anywhere along a
line* (`solveOffsetpair` walks `yy = y+1 … h`), so the two 6s can sit at opposite
ends of a column and the contradiction (a forced pair of adjacent blacks) fires
far from the cells you're told to mark. The owner couldn't parse "overlap"
precisely because the cells didn't overlap. Fix: **describe only what's invariant**
— that shading either target forces "one of the 6s and one of the 4s … next to
each other" (the forced adjacency is the real, position-independent fact) — and
**delete the words that assume a tight figure** ("overlap", "offset by a square",
"between them", "side by side"). Lean on the highlight for *where*; let the words
carry *what*. Lesson: when you add concrete values, re-check that every spatial
word is still true for the *general* firing, not just the compact example in your
head — read the solver's loop bounds, don't assume locality.

Two drafting gotchas from the same rewrite: (a) **dodge the a/an trap** — `a
${n}` becomes "a 8"; either write articleless ("one of the 6s", "two of the Ns")
or branch on the digit; never hard-code "a"/"an" before an interpolated number.
(b) **guard the equal-value branch** — when the two groups can coincide (`n ===
m`), "Two 4s and two 4s …" reads broken, so special-case it ("two of the 4s").
Heuristic for spotting an offender: if a narration contains *zero*
digits/coordinates and three or more "this/that/it/the one" pronouns, it's almost
certainly improvable with concrete values.

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
  so the cell needs no preview digit. (This is the same rule the whole
  collection now follows — a hint highlights the action site and never pre-applies
  the move, § "A hint *highlights* where to act" above; Filling reached it first.)
  Exemplar:
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

### A hint MUST resume from any mid-game position — the cross-game invariant

The single most important behavioural guarantee, and the one most easily missed:
**a hint asked from a board the player reached by their own play must still make
progress and lead to a solved board** (as long as the board is solvable with no
mistakes). In the app a self-played move drops any stored plan (`hintKeepTrack`
→ `"off"`, or no `hintKeepTrack` at all), so the *next* hint **recomputes from
the current state** — the plan-carrying machinery does not save you. Two ported
games shipped a real bug here, both invisible to "the plan solves the board"
tests that only ran from the *empty* start:

- **Singles** — its deductive `solveSpecific` was a faithful port of upstream,
  which only ever solves from an empty board; its cascade propagates only from
  cells it changes *this run*, so resumed from the player's marks it never fired
  their implications and stalled ("No further move"). Fix: prime the cascade
  from the existing marks before solving (`primeCascadeFromMarks` in
  `singles/solver.ts`). General lesson: **a recording deductive solver written to
  run from empty is not automatically resumable** — seed it from the current
  decided cells.
- **Untangle** — its `aux`-walk re-suggested a *no-op* move forever: a vertex sat
  on its target *pixel*, but the unrounded target jittered between recomputes (the
  dihedral match + rescale depend on current positions) by more than the fine
  unit tolerance, so it never counted as "placed". Fix: treat a vertex as placed
  when the move is a no-op **at the stored pixel resolution** (`isNoOpMove` in
  `untangle/hint.ts`), not by a tolerance finer than the recompute jitter. General
  lesson: **for a heuristic/`aux` hint whose target is recomputed each call, the
  recompute must converge** — never emit a move that doesn't change the board.

This is enforced uniformly for **every** hint-bearing game by
[`src/native/engine/hint-resume.test.ts`](../../src/native/engine/hint-resume.test.ts):
it walks a fresh board to solved one *freshly-recomputed* hint at a time (apply
only `steps[0]`, recompute, repeat), asserting a hint never gives up before
solved. Any new game that adds a `hint()` is covered the moment its export is
added to that test's list — **do so as part of the port**, and a per-game
"plan solves from empty" test is *not* a substitute.

**Guard the deduction fixpoint with a step budget.** The resume test catches a
hint that *gives up* or whose move-walk *loops* (its `cap` move limit fires with
a per-seed diagnostic). What it can't catch cheaply is a hang **inside one
`hint()` call** — a "repeat until no progress" fixpoint (`for (;;)` /
`while (true)`) where a rule reports progress without changing the board never
returns, so no move is ever produced and the only backstop is a wall-clock test
timeout (slow, opaque, load-sensitive). Tick a
[`stepBudget`](../../src/native/engine/step-budget.ts) once per fixpoint
iteration so a non-terminating loop throws a labelled error in milliseconds
instead. Make it **opt-in on the hint path** — gate it on the recorder/hint
signal the function already carries (`rec`, `ss.records`, `ctx.record`, the
recording callback), so the generator runs the same fixpoint *unguarded and
byte-for-byte unchanged* (a budget that fired during generate-and-check would
break board generation — never guard that path). The limit is generous
(`DEFAULT_HINT_STEP_LIMIT`): an honest fixpoint converges in ~one iteration per
cell, so the guard only ever catches a future regression. Exemplars: `applyRules`
in `range/solver.ts` (gated on `rec`), `solveSpecific` in `singles/solver.ts`
(gated on `ss.records`), `deduceForcedEdges` in `palisade/solver.ts` (a
hint-only function, so unconditional). Search-based hints (Fifteen/Sixteen
A*-style, Flood's `search` BFS) are already bounded by their visited sets and
need no budget.

## 5. Method lesson: probe before trusting a mechanism diagnosis

Twice in one hint session, a plausible mechanism diagnosis ("the second leg reads
as off-plan", "the plan is being dropped") was wrong and dissolved by a ~20-line
probe test. When a hint misbehaves, write the smallest probe that observes the
actual `activeHintStep()`/state rather than reasoning forward from the suspected
cause. See "Hint-UX session" in [`AGENTS.md`](../../AGENTS.md).
