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

## Open questions for the owner

1. **`nums = order − 1` boards** (exactly one empty square per line, e.g. the
   7×7 `A~F` sweep case) make the count deduction almost trivial and the border
   deduction very strong. Worth a distinct narration, or is the general wording
   enough? Default: general wording, sanity-read at that extreme (§2.7).
2. **Should the hint teach the `X` note at all**, or only the definite
   cross/circle markers? Teaching it is more faithful to how the puzzle is
   actually solved on paper (and `markAll` already offers the X note), but it
   adds a note vocabulary the other candidate games don't have. Default: teach
   it, since `findMistakes` already treats the X note as a first-class marking.
