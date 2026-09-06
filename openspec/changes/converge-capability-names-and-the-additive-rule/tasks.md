# converge-capability-names-and-the-additive-rule — tasks

The first executed batch of `re-express-the-collection`. Scaffolded and
implemented 2026-09-06.

## 1. One name per contract member

- [x] 1.1 boats — `findBoatsMistakes` → `findMistakes` (solver, index, tests).
- [x] 1.2 crossing — `findCrossingMistakes` → `findMistakes`.
- [x] 1.3 salad — `saladFindMistakes` → `findMistakes` (solver, index, hint, tests).
- [x] 1.4 netslide — `netslideHint` → `hint`, `netslideHintKeepTrack` →
      `hintKeepTrack`. Checked for collisions first: boats, crossing and salad
      each already bind a local `hint`/`hintKeepTrack`, and netslide does not,
      so all four renames land cleanly.
- [x] 1.5 Repoint `hint-refusal.test.ts`'s record of the `netslideHint`
      instrument failure — it cites a name that no longer exists.

## 2. One statement of the additive rule

- [x] 2.1 State it once in `candidate-hint.ts` beside `adaptiveMarkAll`: the
      rule, why it is the rule, what enforces it, and **what each game still
      decides for itself** — which is the part that explains why the loop stays
      per-game.
- [x] 2.2 Replace all nine copies with a two-line citation; the three games whose
      loop genuinely differs (seismic's per-cell mask, abcd's candidate cube,
      undead's `MON_NONE`) say so in one line more.

## 3. Prove the sweep moved nothing

- [x] 3.1 **Verify by shape, not by a green suite.** Every added line classified:
      9×2 citation lines, six `findMistakes` shorthands, five import/declaration
      renames, and the canonical doc block. Every removed line accounted for,
      including the two that were neither a rationale line nor a rename (a
      continuation line and the doc-comment terminator that moved).
- [x] 3.2 `tsc -b --noEmit` clean; the twelve touched games plus
      `mark-all.test.ts` and `capability-surface.test.ts` pass — **1,134 tests**.
- [x] 3.3 The capability surface snapshot is **unmoved**, which is the guard
      built one commit earlier doing its job on the first batch that could have
      tripped it.

## Findings

- **B1 dissolved on inspection and is recorded as dissolved**, not delivered.
  jscpd oversold it two ways at once — it counts import blocks, and it counts
  loops whose per-game bodies are the entire content. `survey.md` carries the
  decomposition; the reusable half is that **a clone cluster is a place to look,
  never a finding**, and the check that settles it is `border-grid.ts`'s, applied
  by reading.
- **The survey's own alias count was wrong, and the fifth was a comment.** It
  reported `bridges: flag` from the line
  `// --- findMistakes: flag player bridges the unique solution can't support ---`.
  Bridges' function is called `findMistakes` like the other 37. Caught before
  acting; `survey.md` records it.
