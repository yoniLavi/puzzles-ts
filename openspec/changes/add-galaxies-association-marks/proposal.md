# Change: Galaxies association pencil marks (the cell↔dot aid)

## Why

Galaxies play involves heavy back-and-forth: the only way to record "this
tile must belong to that dot" is the committed association arrow, which reads
as an answer — it colours the tile, participates in completion, and is what
`findMistakes` judges. Players (and, next, the hint mechanism —
`add-galaxies-hint`) need a **deductive notation**: a pencil-grade mark
asserting a tile's owning dot without committing it. This is the cell↔dot
association aid promised as the goal-4 follow-up when the Galaxies port
landed (owner-requested again 2026-08-07), and it establishes the collection's
first *entity-valued* pencil mark — a candidate that names a board object
(a dot) rather than a digit — which is a deliberate design input for the
framework's CandidateBoard substrate (`docs/framework-rdd/deduction.md`).

## What Changes

- A new Galaxies op, `mark`: a per-tile pencil assertion naming a dot.
  Undoable state (a move, not `Ui`), serialised through the existing move
  log. Toggling the same pair removes; marking with a different dot
  replaces; committing a real association on a tile absorbs (clears) its
  mark, as does the solver fill.
- Input: **drag between a tile and a dot (either direction) creates the
  mark** — the pencil sibling of the existing right-drag-to-associate —
  plus keyboard and touch routes satisfying the input-parity bar
  (`docs/games/input.md § "The input-parity bar"`).
- Rendering: marks draw as a distinct pencil-grade ghost (clearly not a
  committed arrow), carried in the tile cache via a parallel plane so they
  repaint correctly (`docs/games/rendering.md § "The tile cache and the
  diff key"`).
- `findMistakes` gains a third arm: a mark whose dot contradicts the unique
  solution is flagged (the notes-are-first-class convention,
  `docs/games/mechanics.md § "Pencil marks: the full note-taking UX"`),
  rendered like the existing mistake classes and blocking Check & Save.

## Impact

- Affected specs: `galaxies` (one ADDED requirement — association marks;
  one MODIFIED — mistake detection gains the mark arm).
- Affected code: `src/games/galaxies/{index,state,render}.ts` +
  `galaxies.test.ts`; no engine changes expected (marks are per-game state,
  rendered through existing overlay machinery).
- Downstream: `add-galaxies-hint` builds on this vocabulary and is scoped
  as its own change.
