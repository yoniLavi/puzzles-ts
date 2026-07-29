# Design — add-salad-hint

## Context

Salad (`src/native/games/salad/`, ported and accepted 2026-07-29) is a
**pseudo-Latin-square** puzzle: place each of `nums` symbols once per row and
column, leaving `order − nums` squares in each line empty. It runs on the shared
`engine/latin.ts` framework, and its solver is three game deductions
(`latinholesSolverSync`, `latinholesSolverCount`, `saladLettersSolverDir`) plus
the generic Latin rungs — with a **cube of order `o`, not `nums`**: the trick is
that symbols above `nums` are reinterpreted as holes (see `solver.ts`'s header).

That makes it a candidate-elimination game in the sense of
[hint-authoring §9](../../docs/porting/hint-authoring.md), so the pattern, the
machinery and the exemplars are all in place. Three preconditions are already
satisfied and need no work:

- **Guess-free (§1A).** `diffRecursive = DIFF_IMPOSSIBLE`, so neither tier
  guesses. Every generated board is solved by exactly the rungs a hint narrates,
  so the plan can always reach the end and no board needs rejecting at
  generation. There is no honest use for a fallback rung here.
- **Refusal (§4).** `findMistakes` already ships (four kinds, including notes),
  so `candidateHint`'s mistake refusal and the banner work the moment the entry
  is wired.
- **The soundness boundary lands correctly for free.** §9.1 requires the working
  cube be seeded from the *placed grid only*, never the player's notes, and that
  seeding not be mistaken for a teachable deduction. `latinSolver` installs the
  recorder **after** `alloc` *and after `cfg.seed`* (the hook this port added),
  so Salad's ball/cross givens are applied on the correct side of the boundary
  with no extra care. Worth knowing rather than rediscovering.

## Decisions

### D1 — Reuse inventory: what comes from the shared engine unchanged

Written out explicitly because "reuse as much as possible" is the point of the
change, and because a list is auditable where an intention is not.

| Concern | Shared thing to use | Notes |
| --- | --- | --- |
| `Game.hint` entry (refusals, `autoPencil` default, empty-plan) | `candidateHint(state, ui, findMistakes, buildSteps)` | one line |
| Track a player move against the step | `keepCandidateHintTrack` + adapter | D6 |
| Never show a stale step | `refreshCandidateHintStep` + adapter | D6 |
| Naked single on the working notes | `nakedSingle` | D3 makes the X bit just another value |
| Next teachable strike / placement | `nextStrike`, `nextPlace`, `firstUnreflectedPlaceIndex` | |
| Lazy note population | `lazyPopulate`, `populateStep`, `populateText` | reuses the real `markAll` move |
| One-shot obvious-candidate clean | `emitObviousCleanStep` (`obviousCandidateMarks`) | D3 |
| Placement's row/column cull | `regionDuplicateMarks` | D3 |
| A cell's uniqueness regions | `rowColRegions(x, y, order)` | Salad has exactly row+col |
| Re-derive a placement's *why* | `classifyPlacementInRegions` / `singlePlacementReason` | D3, D4 |
| Hidden-single evidence area | `hiddenSingleLine` | |
| Generic Latin narration arms | `narrateLatinReason` | D5 |
| Deduction fixpoint + grading | already inside `latinSolver` | D2 |
| Non-termination guard | `stepBudget("salad hint plan")` | §7.2 |
| Cross-game guards | one line in `testing/hint-games.ts` | buys three suites |
| Overlay reaches the render cache | `OverlaySidecar` on the drawstate | §3.2 |

### D2 — `engine/hint-plan.ts` (`deduceHintPlan`) is **not** the loop to use here

Salad's rungs live inside `latinSolver`, which already owns its own fixpoint
(`runDeductionFixpoint`) and its own recorder. `deduceHintPlan` is the shared
loop for games that drive their *own* rung ladder (Spokes, Bricks, Clusters,
Subsets, Boats). Using both would mean two nested loops with the recorder in the
inner one. Salad follows the Latin family instead: run the recording solver
once, then *walk* the recorded script against the live notes. Recorded as a
deliberate non-reuse so a later reader doesn't read its absence as an oversight.

### D3 — The one real abstraction: a note **encoding** (many solver values → one player note)

**This is the change's main shared-engine contribution.** Every shared candidate
helper assumes a bijection between a solver value and a note bit, and Salad
breaks it in two ways at once:

- **Bit offset.** Salad stores candidate `n` at bit `n − 1`; the Latin games use
  `1 << n`. (Crossing already hit this; the adapter's optional `bit(n)` covers
  it.)
- **Many-to-one.** The `order − nums` hole symbols (`nums+1 .. order`) are
  *interchangeable* and all collapse onto **one** player note — the "X" mark at
  bit `nums`, meaning "this square might be empty". No existing consumer has
  anything like it.

**The insight that makes this clean: in the *cube* the holes are perfectly
Latin.** Symbol `nums+1` appears exactly once per line, like every other symbol.
So all the uniqueness assumptions in the shared helpers are **true in the cube's
value space**, and the only thing that is not is the *player-facing projection*.
Therefore: keep every shared helper operating on the order-`o` cube view, and
put the collapse at the step-emission boundary alone.

Even better, Salad's own solver already *is* that projection, which is strong
evidence the design is right:

- "strike the X note" ⟺ no hole symbol survives in this cell ⟺
  `latinholesSolverSync`'s **circle** condition ⟹ also a `circle` marker move.
- "mark this square empty" ⟺ no symbol `≤ nums` survives ⟺ the same function's
  **cross** condition ⟹ a `cross` marker move.

Proposed shared shape — a `CandidateVocabulary` (name to settle in
implementation), an optional parameter alongside `regionsOf` wherever a helper
maps values to note bits:

```ts
interface CandidateVocabulary {
  /** The note bit value `v` contributes to. Several values may share one bit. */
  noteBit(v: number): number;
  /** Values sharing a note bit; a note is struck only when ALL are gone. */
  valuesFor?(bit: number): number[];
}
```

Consumers to thread it through: `obviousCandidateMarks`,
`regionDuplicateMarks`, `classifyPlacementInRegions`, `nakedSingle`. Default
(omitted) = today's `1 << n` bijection, so **every existing call site is
untouched** — the property that made the adapter extraction safe six times.

**Stop condition (the Undead precedent).** If threading it needs a helper to
call *back* into the game for anything beyond the value↔bit map — i.e. the game
starts supplying the logic — abandon it, keep Salad-local copies, and record the
no-go in `hint-authoring.md` §9. A documented non-migration is a fine outcome.

**Fallback if D3 is abandoned:** a per-value `uniqueValue?: (n) => boolean`
predicate instead, so a non-unique note (the collapsed X) is simply skipped by
the uniqueness-based helpers. Strictly weaker (it suppresses teaching rather
than teaching correctly), which is why it is the fallback and not the plan.

### D4 — What the plan may claim about a hole cell (a real trap)

The port's finding F3 applies directly: **the cube never collapses on a hole
cell**, because the hole symbols are interchangeable and nothing decides which
sits where. Consequences the walk must respect:

- There is **never** a naked single for a specific hole *symbol*. The terminal
  state of a hole cell is `holes[i] = CROSS`, reached via the sync/count
  deductions — a **marker** move, not a placement.
- "Board finished" is `latinholesCheck`, **not** "the grid is full". A walk that
  loops until the grid fills will never terminate.
- A hidden-single narration must never be emitted for a hole symbol ("the empty
  square fits only this cell of the row" is meaningless — the row holds several).
  Under D3 this falls out automatically, since the X note is struck only when
  *all* hole symbols are gone, and that firing is a sync/circle reason rather
  than a hidden single.

### D5 — Second extraction: give `narrateLatinReason` a vocabulary

`narrateLatinReason` owns the six generic arms (`single`, `hiddenSingle`,
`forcedSingle`, `dup`, `set`, `forcing`) but is scoped to the *row/column
number* games (Keen, Unequal). **Towers, Solo and Group each keep a private copy
of the same six arms, and the recorded reason in every case is vocabulary**:
Towers says "height 5" with a single value; Group's values are letters; Solo's
generic arms name "row, column **and** block". Salad would be a fourth copy, and
its vocabulary is *mode-dependent* (`A`/`B`/`C` or `1`/`2`/`3`).

So: attempt an optional `vocab` — a noun (`"number"` / `"height"` / `"letter"`),
a value renderer (`(n) => string`), and a region phrase (`"row and column"` /
`"row, column and block"`) — and migrate whichever games come out **verbatim**.

**Stop condition, from the playbook's own rule:** extract only the arms that are
verbatim across ≥ 2 games. If a game needs a per-arm override for half its arms
it stays off the shared narrator, and the decline is recorded with its reason.
Expected outcome, stated up front so the measurement is honest: Salad, Towers
and Group look migratable on a value renderer + noun; **Solo probably does not**,
because its region phrase varies *per arm* rather than per game. Either result is
a success for this change; silently ending with four copies is not.

### D6 — The move dialect, and the one place the shared surface must grow

Salad's moves are `{ type: "set" | "pencil"; x; y; value }` where `value` is
`number | "cross" | "circle" | "clear"`, plus `{ type: "markAll" }`. Mapping to
the canonical `CandidateMove` via `CandidateMoveAdapter<SaladMove>`:

| Canonical | Salad |
| --- | --- |
| `set { x, y, n, pencil: false }` | `set` with a numeric `value` |
| `pencilAll` | `markAll` |
| `pencilStrike { marks }` | needs a strike move — see below |

Two gaps, and they are different in kind:

1. **Salad has no `pencilStrike` move.** Its pencil move is a per-cell *toggle*,
   which is not idempotent — the §9.2 reason `pencilStrike` exists at all. So
   add `{ type: "pencilStrike"; marks }` to `SaladMove` and `executeMove`
   (clearing a bit that is already clear is a no-op ⇒ idempotent, resume-safe).
   This is additive to the move union, so **existing saves replay unchanged**.
2. **A marker move is a fourth shape.** "Mark this square empty" / "this square
   must hold a symbol" is a `set` with `value: "cross" | "circle"` — neither a
   value placement nor a note strike. The canonical set has three shapes;
   `read()` can only answer "not one of these" (⇒ off-plan), which would drop
   the plan the moment the player follows a marker step. Options, to decide with
   a spike:
   - **(a)** widen `CandidateMove` with `{ type: "mark"; x; y; mark: number }`,
     treating a marker as a placement of a distinguished value. Cheap, and it is
     genuinely what the cube says (placing hole-symbol-or-other).
   - **(b)** let the adapter's `read()` map a marker onto
     `set { n: <the note bit's value> }` under D3's vocabulary, so no canonical
     widening is needed at all. **Preferred if it works** — it is exactly the
     projection D3 already builds, and it keeps the canonical set at three.
   - **(c)** Salad-local `hintKeepTrack` / `refreshHintStep`. The Undead
     outcome; acceptable, recorded, last.

### D7 — Narration sketch (the quality bar, not the final wording)

Written now because §2's rules (lead with the indication; necessity voice for a
deduction; name a square by what the player can see) are much cheaper to satisfy
in a sketch than in a rewrite. `nums = 3`, letters mode:

- **border, near** — "The clue outside this row says the first letter you meet
  is C. Every square before the first one that isn't known-empty would be that
  first letter — so nothing but C can go here, and we cross out A and B."
- **border, far** — "This row can hold only two empty squares, so its C is at
  most two squares in from the clue. This square is further than that — so we
  cross out the C."
- **count, holes done** — "This row already has both of its empty squares
  marked, so every remaining square in it must hold a letter."
- **count, letters done** — "All three of this row's letters are placed, so
  every square still blank in it must be empty."
- **sync → cross** — "No letter can go in this square any more, so it must be
  one of the row's empty squares."
- **sync → circle** — "This square can't be one of the empty ones — so it holds
  a letter, even though we don't know which yet."
- generic arms → `narrateLatinReason` (D5).

Note the two `count` arms and the `sync` arms are the *same* firing seen from
its two sides; each must claim only what it has (§2.6) and must read correctly
at the degenerate extremes (§2.7 — `nums = order − 1`, i.e. exactly one empty
square per line, is the case to sanity-read).

### D8 — Rendering

`COL_HINT` (the squares/candidates acted on) and `COL_HINT_CELL` (evidence) as
new palette indices appended past the upstream enum — safe, as
`augmentation.ts` gives Salad no index-keyed dark-mode overrides (already relied
on by `COL_MISTAKE` / `COL_PENCIL_BODY`). A hint `OverlaySidecar` alongside the
existing `ds.wrong`, in the cache-miss test (§3.2 — `hint-overlay.test.ts`
guards this cross-game once enrolled). A border-clue deduction shades **the clue
glyph and its line of sight** (§5.2), which the port already has geometry for:
`borderScans(i, order)` is the shared scan the solver, generator, error check and
completion test all read, so the hint reads it too rather than re-deriving.

## Risks

- **The recorder must not change a single generated board.** Mitigated
  structurally (every reason allocation and record gated on `solver.recorder`)
  and provably: the 28-fixture byte-match differential must stay green
  **unedited**. If a fixture moves, the recorder leaked — revert rather than
  re-baseline.
- **Two extractions in one change** (D3, D5) is the main scope risk. Both are
  ordered *after* a working Salad-local hint in `tasks.md` precisely so the
  change can land with the hint and a recorded no-go if either fails to earn
  its keep.
- **Over-abstraction is the failure mode the owner's ask can invite.** Each
  extraction carries an explicit stop condition and the Undead non-migration as
  precedent; the guardrail that has held six times is that the extraction is
  behaviour-preserving iff the existing tests pass **unedited**.
- **A mode-dependent narration doubles the sentences to sanity-read.** Both
  modes need a read-out-loud pass (§6.4's rule, applied to a deductive game):
  Number Ball has no border clues at all, so its plan is sync + count + generic
  only — check it does not read as a bare list of note strikes.

## Findings — what implementation changed (authoritative over the decisions above)

### F1 — Only the *border* deduction needs recording; sync and count are re-derived

D3's framing was right that Salad's own solver "already is the projection", but
the practical consequence is the opposite of task 2.2's plan: **sync and count
should not be recorded at all.** Both write *markers* (`holes[i] = CROSS/CIRCLE`)
rather than candidates, and count's candidate strikes are the invisible
hole-symbol half. So their player-visible conclusion — "this square is empty" /
"this square holds a symbol" — is re-derived from the board the player can see at
emit time (§9.3a's rule, applied to markers), cheapest reason first:

| order | reason | premise the player can check |
| --- | --- | --- |
| 1 | `countHolesDone` | this line already carries every empty square it may hold |
| 2 | `countLettersDone` | this line's symbol-holding squares are all accounted for |
| 3 | `crossNaked` | this square's notes are down to the empty-square mark alone |
| 4 | `forcedCross` / `forcedCircle` | the honest weak arm — the marker analogue of `forcedSingle` |

The recorder is therefore threaded through `saladLettersSolverDir` **alone** — the
one deduction that strikes candidates the player holds notes for *and* whose
premise (which clue, how far its symbol may reach, what shortened that reach) the
working board cannot reconstruct. Much smaller gated surface than planned, and
better narration.

**Measured (60 boards: both modes × both difficulties × five sizes × three
seeds), the weak arms never fire at all** — nor does `forcedSingle` or the generic
`forcing` arm — and no board refuses or stalls. Every step a player sees names a
concrete visible technique. The weak arms stay as the backstop that keeps a step
from ever being wordless; because the walk never reaches them, their wording is
pinned by a direct `narrate` unit test instead.

### F2 — "One group per firing" was a live bug here, and a *highlight* assertion caught it

Task 2.3 asked to "confirm" the three deductions fire one group each. They did
not: `applyRung(0)` is a single `saladSolverEasy` call doing sync + all
`4·order` clue scans + the counts, and `beforeRung` bumps `solver.group` once per
rung *attempt* — so one group covered every clue on the board, and `nextStrike`
returned a "firing" whose strikes spanned three unrelated rows under one clue's
narration. Fixed with the §9.5 gated early return at **both** levels (after the
first clue that fires, and after each sub-deduction of `saladSolverEasy`), so the
generator still sweeps everything byte-identically.

Worth recording *how* it surfaced: not in the narration, and not in "does the
plan solve the board" (it did, all 60). What caught it was the tier-1 assertion
that **a step's targets lie inside the area it shades** — the premise/conclusion
geometry, which no wording review would have noticed.

### F3 — D6 option (b) does not work; (c) applies, narrowly

Mapping a marker onto the canonical `set { n }` through the note projection reads
fine for `hintKeepTrack`, but breaks `refreshCandidateHintStep`: its placement arm
resolves a step once `grid[cell] !== 0`, and a cross leaves the grid blank for
ever, so a followed marker step would never be retired. Both markers are therefore
judged in ~12 Salad-local lines *before* delegating — option (c), but at a twelfth
of Undead's cost, because everything else still goes through the adapter.

### F4 — Salad's "placed grid" is `grid` **plus** `holes`

The §9.1 soundness boundary says seed the working cube from the placed grid only,
never the notes. Salad has a third array, and it falls on the *facts* side: a
cross or ball is a real entry that Check & Save flags when wrong, exactly like a
written symbol, so the cube may assume it — and must, or the hint reasons from
less than the player has. Notes still never seed it. (`seedMarkers`, distinct from
the generator's `seedGridClues`.)

### F5 — D3 lands as the bit offset; the many-to-one arm is a recorded no-go

Threading `valuesFor(bit)` through the four helpers found **no consumer.** The
reason is D3's own insight taken one step further: *in the cube* Salad's holes are
perfectly Latin, and on the *player's board* no hole symbol is ever placed (holes
live in `holes[]`, not `grid[]`) nor ever singled (which hole symbol sits where is
undecidable and immaterial). A shared helper only ever asks "which note bit does
this *placed* value occupy?" or "are this cell's notes down to one?" — neither
question can meet a collapsed note. So `NoteEncoding` carries `bit?` and `values?`
only, and the collapse stays where D3 said it belonged: at Salad's own step
emission, where it *is* the sync deduction.

What Salad did need beyond the encoding, and the design did not predict: **a
`placed` grid distinct from `grid`** on `nextStrike` / `nextPlace` /
`firstUnreflectedPlaceIndex`. The cube places a hole symbol in a square the player
settles with a marker; judging "is this placement reflected?" by `grid` alone
leaves that op unreflected for ever and walls off every strike recorded after it.
Generalised as "which cells are already decided" vs "which cells can still take
notes" — identical in every other game, so no call site changed.

### F6 — D5 lands with a third knob, and fixes a pre-existing wart

`LatinVocab` needed `cell?` as well as `noun`/`value`: Salad's board is *squares*,
and mixing "cell" and "square" inside one game's hints reads as sloppy. Salad and
Group migrate verbatim (Group's hand-written copy of the six arms is deleted, its
tests unedited); **Towers and Solo decline as predicted** — Towers wants the value
qualified in two arms and bare in the rest, Solo's region phrase varies per arm,
and one vocabulary cannot express a per-arm difference.

Knock-on worth keeping: the shared `dup` arm now picks "a"/"an" from the *rendered*
value. That is what Group's local copy had reworded around ("already contain a"
reads as an article for element `a`), so choosing the article correctly is what let
the copy go — and it fixes "There's already a 8" in the digit games, which no test
had noticed.

### F7 — Not done, and deliberately: no auto-pencil preference

With no `autoPencil` pref, Salad's plan teaches every placement's row/column note
cull as an explicit `continuesPrevious` strike, which measured as the most frequent
step in a full plan. Adding the pref the Latin family ships would fold those legs
away *and* is a real play-aid improvement — but it is a gameplay feature, not this
change's hint work, and it needs a pref plus an `autoElim`-style decision baked into
the move. Left as a recorded follow-up (`hint-authoring.md` §9.7); the walk already
honours `autoClean`, so it is a small change when wanted. This matches Group, which
also has no auto-pencil and teaches the same legs.

### F8 — The populate opener destroyed the player's own notes (owner-reported), and the same defect is in the shared helper

Reported mid-session on a board carrying **some** pencilled squares and **some**
blank ones: pressing Hint applied a fill that reset the narrowed squares back to
the full candidate set, throwing away deductions already made.

**Mechanism.** The opener reused upstream's `M` (`markAll`), which *by design*
resets every fillable square — a reasonable thing for a player to ask for, and a
destructive thing for a hint to do on their behalf. The latch made it worse rather
than caught it: "populate is needed" is *some* square lacks notes, so one blank
square was enough to trigger a whole-board reset.

**Fix (two rounds, both owner-directed).**

*Round 1 — the hint's opener.* A new additive `{ type: "pencilAll" }` move (fills
only squares with no mark yet), used for the opener, with its own wording ("…in
each empty square that hasn't any yet"). The working copy mirrors the additive fill
exactly — otherwise the plan would go on to teach strikes on candidates the player
had already crossed out, i.e. steps whose mark is invisible on their board.

*Round 2 — the Mark-all button itself* ("please do the same for the pencil marks
button… preferably use the same code path"). The `M` key / toolbar button now goes
through the collection's shared **`adaptiveMarkAll`** (`engine/candidate-hint.ts`):
first press fills the squares with no marks, later presses strike the candidates a
placed symbol already rules out of its row or column, and a further press is a true
no-op that adds no undo entry. So the press **only ever adds or removes, never
resets**. Upstream's `markAll` survives in the move union for **replay of move logs
saved before this change** and is documented as unreachable from input.

Two things fell out of doing it on the shared path rather than locally: Salad's
additive fill is named `pencilAll` (the family's name for exactly this move, so
`adaptiveMarkAll`'s generic construction needed no adapter), and the note
encoding / region provider / "does anything need filling?" predicate moved to
`state.ts` as `saladNotes` / `saladRegions` / `needsPencilFill`, shared by the play
path and the hint so the two cannot disagree about which bit is which candidate.
Note `needsPencilFill` is deliberately **not** the shared `anyEmptyLacksNotes`: a
square marked definitely-empty is blank *and* legitimately noteless for ever, so
that predicate would report "needs filling" on a finished board.

Pinned by three regression tests (the opener, the additive move's idempotence, and
the button's fill→clean→converge sequence with a narrowed square surviving), and
both rounds verified live in Chrome.

**This is a cross-game defect, and the rest of the family still has it.**
`lazyPopulate` in `engine/candidate-hint.ts` latches on `anyEmptyLacksNotes` and
then fills **every** empty cell, and `pencilAll`'s `executeMove` in Towers, Keen,
Unequal, Solo and Group resets rather than fills — so the same board shape (some
narrowed cells, some blank) loses the player's notes there too, from the hint's
opener *and* from a Mark-all press. It has gone unnoticed because the latch hides
it whenever *every* empty cell has at least one note. (`adaptiveMarkAll`'s own
doc-comment already describes the intended behaviour as "fill every *note-less*
empty cell", so the games' `executeMove` is what drifted from the contract, not
the other way round — Salad is now the reference implementation of it.)

**Recommendation, for the owner's call rather than done here:** make `pencilAll`
additive in each of those games — a one-line change per game (`if (!next.grid[i] &&
next.pencil[i] === 0)`), plus `lazyPopulate` filling only note-less cells. It is
left out of this change because it alters the replay semantics of a **shipped**
move: a saved game whose move log contains a Mark-all pressed *after* narrowing
notes would reconstruct a different board. That is a save-compatibility decision,
not a hint fix, and it wants its own change. Salad could take the additive route
without that risk because its port shipped 2026-07-29 — one day before this
report — so nothing of consequence has been saved against it yet.

## Open questions for the owner

Both were implemented as their stated defaults; neither turned out to need a
decision, so they are recorded here as resolved rather than pending.

1. **`nums = order − 1` boards** (exactly one empty square per line) — **resolved
   as the default: the general wording, checked at that extreme.** The `4×4 A~C`
   render board *is* that case, and reads correctly ("This row already has its one
   empty square…", "the A must be in the square nearest the clue"); the wording at
   both extremes is pinned by a `narrate` unit test. Getting there did need three
   plural/agreement fixes the read-out-loud pass caught.
2. **Should the hint teach the `X` note?** — **resolved as the default: yes.** It
   pays for itself twice over: the `crossNaked` arm ("the empty-square mark is the
   only one left in this square") is the *second most frequent* concrete
   technique in a plan, and it is the deduction that a `forcedCross` would
   otherwise have to hand-wave. It also costs no new note vocabulary, because
   `markAll` already offers the mark and `findMistakes` already judges it.
