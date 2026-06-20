# Proposal: Add an explained deduction hint to Towers, with pencil notes as first-class markings

**Status**: Proposed

## Why

The Towers TS port (`add-towers-ts-port`, archived 2026-06-20) deferred
`hint()`. Towers is the first ported game whose reasoning is fundamentally
**candidate-elimination** shaped — the signature techniques (the clue
line-of-sight deductions, naked/hidden subsets, forcing chains) *narrow the
set of possible heights in a cell* rather than directly forcing a value. The
solver already carries exactly that state: its `o³` candidate **cube**
(`cube[cubepos(x,y,n)]` = "can height `n` still go here?") *is* a pencil-notes
representation, and its two primitives — eliminate a candidate, collapse to a
placement — *are* "strike a note" and "fill a cell".

So Towers' hint should teach in pencil-notes terms, and (owner-directed) the
fork should treat **pencil notes as first-class markings**, consistently with
placed values in every other game:

1. **Check-&-Save rejects invalid notes.** A note set that has crossed out the
   correct height contradicts the unique solution and SHALL block a quick-save,
   highlighting the offending cells — exactly as a wrong filled cell does.
2. **The hint and its animation work by setting and striking pencil notes.**
   The hint is the solver's own narrated deduction script played onto the
   board: it populates a cell's candidate notes, strikes the candidates a
   technique rules out (narrating *why*), and places a cell once its candidates
   collapse to one. Every step is a real, persisted move.

The one invariant that holds throughout: the solver reasons in its **own sound
working cube, seeded from the placed grid only — never from the player's notes**
(a note can be wrong; that is the very thing Check-&-Save flags). Notes are used
for *display* and for *diffing* (what to strike next, what is already done),
never as deduction inputs. Generation, uniqueness, and auto-solve stay
pencil-blind.

## What Changes

- **`solver.ts` / `engine/latin.ts` gain a hint-only recording mode.** Thread an
  optional `record` callback through the generic Latin deductions
  (`diffSimple`, `set`, `forcing`) and the two Towers user-solvers
  (`solverEasy`, `solverHard`) so each candidate **elimination** and each
  **placement** is captured, in solver order, with the rule + premise that fired
  it. Gated on the recorder so the generator's hot solve path stays byte-for-byte
  unchanged (the Singles/Range pattern; verify with the existing C differential).
  A hint-path `stepBudget` guards the fixpoint.
- **`index.ts` gains `hint()` + `hintKeepTrack()`.** `hint(state, aux?)` builds
  the deduction script from a sound cube **seeded from the grid**, then expresses
  it against the player's current notes + grid as a sequence of narrated steps:
  - **Populate** (only when some empty cell lacks notes): one step that fills
    every empty cell's candidate notes — reusing the existing `pencilAll`
    (fill-all) move, so the hint's starting state is identical to the fill-all
    button the player already knows.
  - **Eliminate** (one technique firing = one journey): a step striking the
    candidate(s) that firing rules out, narrated with the *why* in the necessity
    voice ("Clue 3 sees only 3 towers, so the tallest can't sit in the first two
    cells — rule it out here"). One firing forcing several strikes is **one**
    multi-cell step (quality-bar rule 2 / §5.5).
  - **Place**: a step filling a cell whose sound candidates have collapsed to one.
  - The script always completes the board from any mid-game position (resume
    invariant §7.1), and each step is monotone progress (a note removed or a cell
    filled), so a freshly-recomputed hint never loops.
  `hintKeepTrack` advances the plan when the player's move matches a step's
  intent (a strike clearing the hinted candidates, partial strikes → `onTrack`;
  a placement of the hinted value), else drops it to recompute.
- **`findMistakes` treats notes as markings.** It additionally flags every
  empty cell whose **non-empty** candidate set does **not** contain the cell's
  solution height (the player crossed out the truth). A note merely carrying
  extra non-solution candidates is *not* a mistake. `TowersMistake` gains a
  `kind` (`"cell"` | `"note"`); both render as the existing red cell overlay.
  Check-&-Save inherits this through its `findMistakes` gate — no quick-save
  change needed.
- **`render.ts` renders the hint.** Shade the driving clue's line of sight
  (`COL_HINT_CELL`), mark the target cell(s)/candidate(s) (`COL_HINT`), and show
  the ruled-out heights so the player sees the elimination. A populate step
  renders as the candidates appearing. Folded into the per-tile `Int32Array`
  cache. Element-type colour legend per the cross-game convention.
- **Tests**: recorded reason per technique; the plan solves the board from empty
  *and* from mid-game (the shared `hint-resume.test.ts` list gains `towersGame`);
  refusal on solved / on mistakes; note-mistake detection (excludes-truth flagged,
  extra-candidates not); Check-&-Save refuses an invalid-note board; a tier-2.5
  render-scenario snapshot of an elimination-journey frame.

## Impact

- **Affected specs:** `towers` (MODIFIED mistake requirement → notes checked;
  ADDED hint requirement); `ts-engine` (MODIFIED `findMistakes` requirement →
  the cross-game convention that a game with candidate/pencil annotations MAY
  report annotation-level contradictions as mistakes).
- **Affected code:** `src/native/games/towers/{solver,index,render,state}.ts`
  and `src/native/engine/latin.ts` (recording mode) plus their tests; the
  shared `hint-resume.test.ts` list. The `hint`/`hintKeepTrack`/`findMistakes`
  hooks, the midend `ActiveHint`/`activeMistakes` lifecycle, the refusal→mistake
  coupling, Check-&-Save, and the shell Hint/Auto-Hint buttons all already exist.
- **New convention recorded:** pencil notes as first-class markings — the first
  ported pencil game to do so, the template for Solo/Keen/Unequal/Undead.
- Parity-gated: registered and shipped for owner acceptance testing; `add-towers-hint`
  archived only on owner acceptance.

## Out of scope

- **Live (rule-violation) error-checking of pencil notes** — flagging a penciled
  candidate already impossible given placed digits *before* solving (the
  `checkErrors` "error" tier, vs the `findMistakes` "mistake vs unique solution"
  tier). Towers checks only the solution-contradiction tier here, matching every
  other game's Check-&-Save; a live note-error tier is a possible later change.
- **A new bespoke move type for populate** — populate reuses `pencilAll`; only a
  multi-strike elimination move (`pencilStrike`) is added, to keep one firing as
  one move/journey (see `design.md`).
- **Lifting Fifteen/Sixteen hints** (tracked separately).
