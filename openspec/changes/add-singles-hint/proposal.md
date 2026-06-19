# Proposal: Add an explained deduction hint to Singles (Hitori)

**Status**: Proposed

## Why

The Singles TS port (`add-singles-ts-port`, owner-acceptance pending) shipped
without `hint()`. Upstream's solver already attaches a short reason string to
every forced cell (`solver_op_add(ss, x, y, op, "SP/ST - between identical
nums")`, …) — the per-cell deductions are already named, the port just dropped
the strings. That makes Singles well set up for a Palisade-grade "why each cell
is forced" hint, the fork's hint quality bar. This change adds that hint.

## What Changes

- **`solver.ts` gains a recording deduction.** The op-queue solver already
  decides one cell at a time with a known cause; we attach a structured
  `SinglesReason` to each queued op (the named upstream deductions — sandwich,
  doubles, the three corner cases, offset-pair, all-black-but-one,
  remove-splits — plus the two cascade rules: a neighbour of a new black must
  be white, and a number sharing a line with a new circle must be black) and
  record every *applied* op in deduction order. A new `deduceHintPlan(state)`
  runs the solver from the player's current marks and returns the ordered
  forced moves, each tagged with the reason that forces it. Recording is gated
  on a recorder being present, so the generator's hot solve path is byte-for-
  byte unchanged.
- **`index.ts` gains `hint()` + `hintKeepTrack()`.** `hint()` refuses when the
  board is solved or `findMistakes` is non-empty (a hint off a contradictory
  board misleads — the Palisade precedent; the refusal lights the mistake
  overlay for free), else returns the plan as narrated `HintStep`s. Each step
  explains *why* the cell is forced, referencing the highlighted evidence. A
  single deduction that forces **two cells at once** (the 4-in-a-corner pair, an
  offset-pair's two whites) is emitted as **one multi-cell step** (quality-bar
  rule 2). `hintKeepTrack` advances the plan as the player follows it
  (`"completed"`/`"onTrack"` for a multi-cell step filled one cell at a time,
  `"off"` on deviation).
- **`render.ts` renders the hint highlight.** The forced cell(s) are filled
  `COL_HINT` (blue) with a preview of the forced mark (a black inset square to
  shade, a ring to keep white); the deduction's **evidence** is shaded
  `COL_HINT_CELL` (light blue) where it is an undecided number cell (the digit
  draws on top, Filling convention) and **ringed** `COL_HINT` where it is an
  already-decided cell whose black/circle state *is* the reason (a black square
  forcing a neighbour white; a circled white using up a number) — the
  shade-vs-ring rule from the hint-authoring guide. Folded into the per-tile
  `Int32Array` cache. The shell's Hint / Auto-Hint buttons and
  `AUTO_HINT_STEP_MS` pacing drive it unchanged (Singles has no move animation;
  `animLength` stays 0).
- **Tests**: each reason recorded on a crafted/generated board, plan validity
  (every step legal, the plan solves the board), refusal on solved / on
  mistakes, `hintKeepTrack` completed/onTrack/off, the visible-evidence
  invariant (every step carries a non-empty area or a ring), and a tier-2.5
  render-scenario snapshot of a hint frame.

## Impact

- **Affected specs:** `singles` (ADDED hint requirement).
- **Affected code:** `src/native/games/singles/{solver,index,render}.ts` and
  their tests. The `hint`/`hintKeepTrack` hooks, the midend `ActiveHint`
  lifecycle (display, advance, refusal→mistake-overlay, banner-without-
  status-bar), and the shell Hint/Auto-Hint buttons already exist (added by
  `add-hint-system`/`add-hint-plans`/`add-range-hint`). Parity-gated: shipped
  for owner acceptance testing.
- **Live-wiki:** update `docs/porting/hint-authoring.md` with anything the
  op-queue/cascade recording shape teaches that the guide didn't already cover.

## Out of scope

- **Grouping a cascade chain into one journey.** A new black forcing four
  neighbours white, each then blackening line-mates, is a *chain* of distinct
  local deductions, each separately teachable — emitted as separate steps (as
  Range does), not collapsed. Only the genuinely-simultaneous two-cell firings
  (corner-4, offset-pair) are grouped.
- **A move-fill animation** (Singles has none upstream; auto-hint pacing is the
  motion).
