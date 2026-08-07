# Design

## Context

The Galaxies solver already grades four deduction rules plus bounded
recursion (Unreasonable). `add-galaxies-association-marks` gives the game a
pencil vocabulary for "tile T must belong to dot D". This change wires the
standing hint machinery (plans, `hintKeepTrack`, `refreshHintStep`, refusal,
auto-hint pacing) to a recorded run of that solver. The relevant guides:
`docs/games/hints.md` throughout; `docs/games/solver-and-generator.md`
§ "Guess-free generation" (the hint-side no-fallback bar).

## Goals / Non-Goals

- Goals: a full explained hint meeting the quality bar; mark-first
  narration; honest handling of the Unreasonable rung; enrolment in every
  cross-game guard.
- Non-Goals: solver strengthening (the tiers are upstream's and honest);
  any shared-machinery extraction (record what would generalise for the
  framework substrate instead); changing generation (no differential
  impact — the gated fixture check must stay green untouched).

## Decisions

- **D1 — The solver is the engine; the hint is its recording.** Thread a
  recorder through the existing deduction rules rather than writing a
  parallel hint solver (the one-engine-two-projections doctrine; Solo's
  threaded-recorder shape, `docs/games/hints.md § "Thread the recorder
  (Solo)"`). The generator/solve path runs recorder-off and must be
  byte-unchanged — the frozen differential is the guard. The recording path
  takes a step budget (`docs/games/hints.md § "The step budget"`).
- **D2 — Mark first, commit as a grouped journey.** A firing that
  establishes "T must belong to D" emits the pencil `mark` move as the
  step's action (owner's framing); where the deduction simultaneously
  forces the committed structure (the tile, its 180°-symmetric partner,
  and any implied edges), those follow as `continuesPrevious` legs of the
  same journey — one firing, one journey
  (`docs/games/hints.md § "Group one firing into one step"`). The
  implementing session calibrates how much commits into one journey
  against cognitive load (`docs/games/hints.md § "Cognitive load: one step
  per hint"`) by reading real plans aloud
  (`docs/games/hints.md § "Read one plan out loud"`).
- **D3 — Narration names what the player can see.** Dots have no labels, so
  steps refer to dots by what is visible/countable ("the dot two tiles
  left", "the white dot in the corner") — never internal coordinates
  (`docs/games/hints.md § "Name elements by what the player can see"`).
  Evidence (the blocked symmetric partner, the only-reachable region) is
  shown as an area in the legend colours; the mark ghost itself doubles as
  the conclusion display. Each of the four rules gets its own narration in
  its own vocabulary; wording is asserted byte-exactly in tests.
- **D4 — `hintKeepTrack`/`refreshHintStep` respect absorption.** A player
  who commits the association directly has *completed* the mark step (the
  mark would be absorbed anyway — marks change D4); a stored mark step
  whose tile got associated meanwhile refreshes to `null` and the plan
  advances (`docs/games/hints.md § "Stale plans and refreshHintStep"`).
  The resume guard covers mid-game positions automatically once enrolled.
- **D5 — The Unreasonable rung is narrated honestly or not at all.** When
  no non-recursive rule fires, the hint does not fabricate a local reason.
  Options, in preference order per the existing patterns: a static what-if
  walk of the recursion's decisive branch
  (`docs/games/hints.md § "Show the what-if walk statically"`), or the
  honest non-local tier ("no single-step deduction exists here; the proof
  tries an association and finds the contradiction" with the tried cell
  marked — `docs/games/hints.md § "The honest chain tier"`). The
  implementing session picks after inspecting what the recursion actually
  records; refusing to hint is not an option, and inventing a reason is
  forbidden (no un-narrated fallback).
- **D6 — Refusal couples to the mark-aware `findMistakes`.** A hint request
  on a board with any mistake — wrong tile, wall, or *mark* — refuses,
  banners, and lights the mistakes
  (`docs/games/hints.md § "Refusal couples to the mistake overlay"`).

## Risks / Trade-offs

- Recorder threading perturbing the solve path → recorder-off path
  byte-identical by construction (no-op callback), frozen differential
  green as the proof.
- Dot-naming ambiguity on dense boards → D3's visible-property naming, with
  the evidence highlight carrying the identification when words get long.
- Unreasonable narration cost unknown until the recursion is inspected →
  D5 bounds the choices; tier-2.5 scans find real Unreasonable firings
  deterministically (fixed-seed scan idiom,
  `docs/games/testing.md § "Render scenarios"`).

## Migration Plan

Depends on `add-galaxies-association-marks` landing first. No format or
generation changes; enrolment additions only.

## Open Questions

- D2 journey granularity and D5's choice — decided in-session against real
  boards, recorded here.
