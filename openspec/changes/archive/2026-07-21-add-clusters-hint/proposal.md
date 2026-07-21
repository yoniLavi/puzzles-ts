# add-clusters-hint

## Why

Clusters shipped its native-TS port (`add-clusters-ts-port`) **without** an
explained hint — per the standing rule that a Palisade-grade `hint()` is always
its own change. Clusters is a genuine deductive puzzle: its solver forces a
cell's colour by *contradiction* (colouring it one way breaks a concrete rule),
which is exactly the kind of reasoning an explained hint should teach. So it is a
strong candidate to meet the hint quality bar — every forced move has a crisp,
narratable *why*.

This change adds `Game.hint()` / `Game.hintKeepTrack()` to Clusters, turning the
existing contradiction solver into a **second projection of one deduction
engine** (solver + hint), narrating each forced move by the rule its opposite
colouring would violate.

## What Changes

- **A recording deduction pass in `solver.ts`** — `deduceHintPlan(grid, w, h)`
  reruns the contradiction deduction with recording on, emitting an ordered list
  of forced moves each tagged with *which cell*, *which colour it is forced to*,
  and *which rule the opposite colour would break* (wholly-surrounded /
  dot-overcount / can't-reach-two), plus the neighbour cells that are the
  evidence. This is the hint's data source; the generator/solve path keeps using
  the non-recording form unchanged.
- **`hint()` / `hintKeepTrack()` in `index.ts`** — build a narrated
  `HintResult`: one journey per deduction firing, the forced cell rendered as the
  `COL_HINT` target, the evidence neighbours shaded, and prose that states the
  premise → contradiction → conclusion. Refuse on a mistaken board
  (`findMistakes().length > 0`) with the standard banner, and on a solved board.
- **Hint rendering in `render.ts`** — a `COL_HINT` target fill + a `COL_HINT_CELL`
  evidence shade, folded into the per-tile cache key via the shared
  `OverlaySidecar` (§3.2), guarded by the cross-game `hint-overlay.test.ts`.
- **Depth-1 (forcing-chain) deductions** — when a cell is forced only by the
  lookahead rung (`solverRecurse`), narrate it as a **multi-leg journey**: the
  hypothetical, the forced propagation steps as gradual board marks, and the
  final contradiction (quality-bar rule 5 — one inferential step per leg, the
  accumulated marks carrying the state). Design D3 decides the exact shape.

Explicitly **not** in this change:

- **No new difficulty tiers / generator change** unless the guess-free audit
  (design D2) shows the shipped generator emits a board the *narratable*
  deduction can't crack — in which case this change resolves it (strengthen the
  narration or reject at generation), because a hint may never fall back on an
  un-narrated "just because" step.

## Impact

- Affected specs: `clusters` (ADD a hint requirement).
- Affected code: `src/native/games/clusters/{solver,index,render}.ts` + tests
  (`clusters-hint.test.ts`, a render-scenario hint frame).
- No engine changes: the hint hooks, `ActiveHint` lifecycle, auto-hint pacing and
  overlay sidecar all already exist; Clusters is a new *implementer*, not a new
  mechanism.
- Parity-gated like a port: owner acceptance before archive.
