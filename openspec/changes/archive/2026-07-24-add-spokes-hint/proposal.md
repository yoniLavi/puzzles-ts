# add-spokes-hint

## Why

Spokes shipped its native-TS port (`add-spokes-ts-port`) **without** an explained
hint, per the standing rule that a Palisade-grade `hint()` is always its own change.

Spokes is a strong candidate for the hint quality bar, because every rung of its
solver is a *stateable* argument rather than a search step, and two of them teach
techniques a player genuinely has to discover:

- **Saturation / exhaustion.** "This hub needs 4 lines and has exactly 4 spokes
  left, so all of them are lines"; "this hub already has its 3, so everything else
  here is ruled out." The bread-and-butter rung, and the easy one to narrate.
- **Crossing diagonals.** "A line already runs through this corner, and two
  diagonals cannot cross, so this one is out."
- **The two-ones rule.** "Both these hubs need exactly one line. Joining them to
  each other would satisfy both and seal them off as a closed pair, leaving the
  rest of the board unreachable — so they cannot be joined." This is the
  connectivity constraint doing real work at a distance, and it is exactly the
  deduction a new player does not see.
- **Contradiction look-ahead** (Tricky and Hard). "Suppose this spoke were a line.
  Then this hub saturates, which forces these marks, and *this* group is sealed off
  from the rest of the board — impossible. So the spoke is ruled out." Deterministic
  and exhaustive, not a guess (port design D3), so it can be narrated as a proof.

This change turns the existing solver into a **second projection of one deduction
engine** (solver + hint), narrating each forced spoke by the argument that forces
it.

## What Changes

- **A recording deduction pass in `solver.ts`** — a `deduceSpokesPlan(board)` that
  reruns the same rungs in the same order, one *firing* at a time, emitting an
  ordered list of forced spokes, each tagged with the rung that forced it, the
  hubs and spokes that constitute its evidence, and — for the look-ahead — the
  hypothesis and the contradiction it reaches. The generator and `solve()` keep
  calling the existing non-recording `spokesSolve` unchanged, so the **byte-match
  differential is untouched**.
- **`hint()` / `hintKeepTrack()` in `index.ts`** — build a narrated `HintResult`
  from that plan. **One firing is one journey**: `spokesSolverFull` on a saturated
  hub forces every remaining spoke at once, so those become continuation legs
  (`continuesPrevious`) of a single hint rather than N disjoint ones, and they all
  render in the same colour because they share a fate (quality bar items 2 and 3).
  Refuse on a solved board; refuse with the standard `findMistakes` banner when the
  board already contradicts the solution; refuse when no rung fires.
- **Hint rendering in `render.ts`** — a `COL_HINT` spoke for the forced move and a
  `COL_HINT_CELL` ring on the evidence hubs, folded into the per-hub cache key and
  the corner-pass key (playbook §3.2, and Spokes' corner protocol means a diagonal
  hint spoke must invalidate its corner too, or half of it will not paint).
- **A `spokes-hint.test.ts`** exercising each rung's narration on a board built to
  make it fire, plus a tier-2.5 render-scenario hint frame, plus the cross-game
  `hint-overlay.test.ts` and `hint-resume.test.ts` guards.

Explicitly **not** in this change:

- **No solver or generator change.** Every shipped board is gated on the same
  solver the hint replays, so there is no board a hint would have to fall back on
  — no "just because" step, per the narratable-deduction doctrine.
- **No new difficulty tier.** The look-ahead is already exhaustive contradiction
  reasoning, and it is narrated as such.

## Impact

- Affected specs: `spokes` (ADD a hint requirement).
- Affected code: `src/native/games/spokes/{solver,index,render}.ts` + tests.
- No engine changes: the hint hooks, `ActiveHint` lifecycle, auto-hint pacing and
  overlay rendering already exist; Spokes is a new *implementer*.
- Parity-gated like a port: owner acceptance before archive.
