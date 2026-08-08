# Design

> **Re-founded 2026-08-08.** The original scaffold's D2/D4/D6 leaned on
> `add-galaxies-association-marks` (withdrawn — see
> `fix-galaxies-drag-preview`'s proposal for the rationale). The hint's
> action vocabulary is now the committed association itself.

## Context

The Galaxies solver already grades four deduction rules plus bounded
recursion (Unreasonable). The committed association is the game's
cell↔dot notation: consequence-free (it never enters `checkComplete`,
never colours a tile), undoable, freely reversible, mistake-checked on
demand — i.e. already pencil-grade in every way that matters to a hint.
This change wires the standing hint machinery (plans, `hintKeepTrack`,
`refreshHintStep`, refusal, auto-hint pacing) to a recorded run of the
solver. The relevant guides: `docs/games/hints.md` throughout;
`docs/games/solver-and-generator.md` § "Guess-free generation" (the
hint-side no-fallback bar).

## Goals / Non-Goals

- Goals: a full explained hint meeting the quality bar; honest handling
  of the Unreasonable rung; enrolment in every cross-game guard.
- Non-Goals: solver strengthening (the tiers are upstream's and
  honest); any new notation (withdrawn — rule-outs are narrated as
  evidence, never demanded of the player's hand); any shared-machinery
  extraction (record what would generalise for the framework substrate
  instead); changing generation (no differential impact — the gated
  fixture check must stay green untouched).

## Decisions

- **D1 — The solver is the engine; the hint is its recording.** Thread a
  recorder through the existing deduction rules rather than writing a
  parallel hint solver (the one-engine-two-projections doctrine; Solo's
  threaded-recorder shape, `docs/games/hints.md § "Thread the recorder
  (Solo)"`). The generator/solve path runs recorder-off and must be
  byte-unchanged — the frozen differential is the guard. The recording
  path takes a step budget (`docs/games/hints.md § "The step budget"`).
- **D2 — One firing, one journey, in committed moves.** A firing that
  establishes "T must belong to D" becomes one journey whose action is
  the association move — the tile, with its 180° partner as a
  `continuesPrevious` leg (the game commits them atomically, and the
  hint narrates the symmetry as the *reason* they travel together);
  edges the firing forces outright follow as further legs. The
  implementing session calibrates journey granularity against cognitive
  load (`docs/games/hints.md § "Cognitive load: one step per hint"`) by
  reading real plans aloud (`docs/games/hints.md § "Read one plan out
  loud"`).
- **D3 — Narration names what the player can see.** Dots have no
  labels, so steps refer to dots by what is visible/countable ("the dot
  two tiles left", "the white dot in the corner") — never internal
  coordinates (`docs/games/hints.md § "Name elements by what the player
  can see"`). Evidence (the blocked symmetric partner, the
  only-reachable region) is shown as an area in the legend colours.
  Each of the four rules gets its own narration in its own vocabulary;
  wording is asserted byte-exactly in tests. Rule-outs ("no other dot's
  symmetry can reach this tile") are evidence highlights the hint
  draws, not marks the player makes — the Dominosa pattern
  (`docs/games/hints.md § "Rule-outs as board marks"`) inverted onto
  the renderer.
- **D4 — `hintKeepTrack`/`refreshHintStep` respect working ahead.** A
  player who commits the association the plan was leading to has
  completed that step; a stored step whose tile got associated
  meanwhile refreshes to `null` and the plan advances
  (`docs/games/hints.md § "Stale plans and refreshHintStep"`). The
  resume guard covers mid-game positions automatically once enrolled.
- **D5 — The Unreasonable rung is narrated honestly or not at all.**
  When no non-recursive rule fires, the hint does not fabricate a local
  reason. Options, in preference order per the existing patterns: a
  static what-if walk of the recursion's decisive branch
  (`docs/games/hints.md § "Show the what-if walk statically"`), or the
  honest non-local tier ("no single-step deduction exists here; the
  proof tries an association and finds the contradiction" with the
  tried cell highlighted — `docs/games/hints.md § "The honest chain
  tier"`). The implementing session picks after inspecting what the
  recursion actually records; refusing to hint is not an option, and
  inventing a reason is forbidden (no un-narrated fallback).
- **D6 — Refusal couples to `findMistakes`.** A hint request on a board
  with any mistake — wrong tile or wall — refuses, banners, and lights
  the mistakes (`docs/games/hints.md § "Refusal couples to the mistake
  overlay"`).

## Risks / Trade-offs

- Recorder threading perturbing the solve path → recorder-off path
  byte-identical by construction (no-op callback), frozen differential
  green as the proof.
- Dot-naming ambiguity on dense boards → D3's visible-property naming,
  with the evidence highlight carrying the identification when words
  get long.
- Unreasonable narration cost unknown until the recursion is
  inspected → D5 bounds the choices; tier-2.5 scans find real
  Unreasonable firings deterministically (fixed-seed scan idiom,
  `docs/games/testing.md § "Render scenarios"`).
- The hint display vs the drag preview → `uiUpdateClearsHint` reviewed
  against the discrete drag preview (`fix-galaxies-drag-preview`); a
  drag in progress must not fight the hint overlay.

## Migration Plan

No format or generation changes; enrolment additions only.

## Open Questions

- D2 journey granularity and D5's choice — decided in-session against
  real boards, recorded here.
