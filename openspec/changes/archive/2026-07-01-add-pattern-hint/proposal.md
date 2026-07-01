# Add an explained hint to Pattern (Nonograms)

## Why

The Pattern port shipped without a hint. Explained hints are a core
deliberate-divergence product value of this fork (hint-authoring guide), and
Pattern is an especially good fit: its deductions are the well-known, *teachable*
nonogram line techniques (run overlap, completion, unreachable gap, edge/anchor
extension), so a hint can genuinely teach the player a pattern they can spot next
time — the Palisade quality bar.

The guess-free precondition (§1A) holds **for free**: Pattern's generator accepts
a board only when it is uniquely solvable by the per-line solver with no guessing
(`generate_soluble`). So every shipped board is pure-deduction solvable and the
hint never needs the solution or a search — no "Unreasonable" tier exists or is
needed.

## What Changes

- Add `Game.hint()` (+ `hintKeepTrack`, and `refreshHintStep` only if needed) to
  Pattern, plus hint rendering, as its own parity-gated change.
- Give the line solver a **recording mode**: each forced cell is tagged with the
  technique that fired and the premise (the line's clue + the already-marked cells
  that constrain it), so the hint can narrate a *why*, not just a *what*. The
  recorder is gated so the generator's hot solve path stays byte-identical (the
  differential must still pass).
- **One firing = one multi-cell step** (guide §5.5, the Filling model): a single
  line deduction forces a set of cells at once; emit them as one `HintStep` whose
  move fills all of them, with a narration that leads with the indication and
  concludes in the necessity voice. Each technique's forced set is single-colour
  (overlap → black; completion/gap → white), keeping each step glance-able (§1B).
- Render per the element-type colour legend (§5.3/§5.4): forced cells `COL_HINT`
  (highlight only, never pre-filled — §5.1), the constraining marks ringed
  (`COL_HINT_BLACKREF` teal / `COL_HINT_WHITEREF` violet), the line's clue + line
  of sight shaded `COL_HINT_CELL`. Refusal couples to `findMistakes` + the banner
  (§4).
- The plan must **complete the board** (every step deductive); a single-cell
  line-solver fallback covers any cell no named technique grouped (guide §5.5).

## Impact

- Affected specs: **`pattern`** (ADDED hint requirement + hint colour-legend
  requirement); merges into the `ts-engine` Hint System on archive.
- Affected code: `src/native/games/pattern/{solver,index,render}.ts` (+ a
  `pattern-hint.test.ts`). No engine or app-shell change (the Hint System,
  stepper button, auto-hint, and banner are already built).
- Parity-gated and owner-accepted like a port; this is a follow-up to
  `add-pattern-ts-port`.
