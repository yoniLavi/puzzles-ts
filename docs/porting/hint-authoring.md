# Hint Authoring Guide

> **Provisional v1 (2026-06-16).** Codified from the Sixteen, Palisade, and
> Range hints. Battle-tested next time a ported game gains a hint; fix gaps here
> as you hit them. See change `add-game-dev-guides`.
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
colour, premise cells gently shaded, a preview of the move it forces (Range:
black inset square / white dot). Fold the hint bits into the per-tile
`Int32Array` cache (§2 of the [port playbook](./game-port-playbook.md)).
Exemplar: [`range/render.ts`](../../src/native/games/range/render.ts).

**Verify in-process (no eyeballing)** with the tier-2.5 render-scenario harness
([`src/native/engine/testing/render-scenario.ts`](../../src/native/engine/testing/render-scenario.ts)):
`renderScenario({ game, id, moves?, showHint?, hintUntil? })` drives a real
`Midend` to the hint frame (walk a multi-step plan with `hintUntil`), then assert
targeted ops (`COL_HINT` present, clues still drawn) **plus** `toMatchSnapshot`.
Seed: `palisade-render-scenario.test.ts` reaches the `equivalentEdges` frame the
Playwright harness couldn't. To reach a specific deduction without its desc, do a
fixed-seed scan (loop ids, keep the first whose `result.hint` matches).

## 5. Method lesson: probe before trusting a mechanism diagnosis

Twice in one hint session, a plausible mechanism diagnosis ("the second leg reads
as off-plan", "the plan is being dropped") was wrong and dissolved by a ~20-line
probe test. When a hint misbehaves, write the smallest probe that observes the
actual `activeHintStep()`/state rather than reasoning forward from the suspected
cause. See "Hint-UX session" in [`AGENTS.md`](../../AGENTS.md).
