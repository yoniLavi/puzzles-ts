# Tasks — add-subsets-hint

## 0. Audit (design D2 — before any prose)

- [x] 0.1 Sweep N fixed seeds × M random correct-prefix positions; confirm
      `deduceHintPlan` completes from every one (no reset — from-position).
      Record the numbers in design.md. — **40/40 boards + 200/200 prefixes
      complete; recorded in design.md D2.**
- [x] 0.2 Measure plan shape: journeys per board, letters per journey,
      collapse-evidence sizes (feeds D3's compression call and D4's pacing).
      — **avg 27 journeys/board, 1.59 legs/journey; collapse ~55% of firings;
      survivors ≤3 in 94% → narrate by surviving candidates (design D2/D3).**

## 1. Recorder (solver.ts)

- [x] 1.1 `deduceHintPlan(state): SubsetsHintPlan` as a parallel recorder
      over the existing rule primitives; `subsetsSolveGame`/`subsetsValidate`
      untouched (differential unaffected by construction — 41/41 subsets
      tests incl. the byte-match differential stay green).
- [x] 1.2 Letter-level firings with reasons (`arrowKnown` / `arrowMask` /
      `collapse` / `singlePosition`); collapse carries the surviving-set list
      + local neighbour evidence (D3).
- [x] 1.3 Tier-1 tests: plan from givens matches the solver's verdict; plan
      from a mid-position continues (recompute-stable); deterministic order;
      each reason kind's invariant.

## 2. hint() / hintKeepTrack() (index.ts)

- [x] 2.1 Per-slot narration (attention → deduction → action), one letter per
      leg with its own string (owner redesign 2026-07-21); read aloud vs board.
- [x] 2.2 Sub-goal journey: multi-letter firings as `continuesPrevious` legs,
      each leg's string specific to its slot (D4 + owner redesign).
- [x] 2.3 Refusal: `findMistakes` banner; wrong-but-locally-clean via
      solution comparison (D5); solved-board refusal.
- [x] 2.4 `hintKeepTrack`: exact letter-toggle completion; off-plan
      recompute (D6).

## 2a. Hidden single + reference-aid spotlight (owner redesign 2026-07-21)

- [x] 2a.1 `candidateCells(state, value)` — shallow "where can this set go"
      (marks + decided-neighbour arrows + placement), shared by aid + hint.
- [x] 2a.2 Hidden-single rung tried before the collapse (arrows →
      hidden-single → collapse → deep single); **measure the shift** — recorded
      in design.md (hiddenSingle 319, ≈38% of counting; 60/60 still solve).
- [x] 2a.3 Player-facing affordance: `ui.highlightSet`, click a tally set →
      spotlight its candidate cells; toggle off on re-click.

## 2b. Further enhancements (owner, 2026-07-21)

- [x] 2b.1 Reverse aid (cell→sets): `candidateSets`, `ui.highlightCell`;
      focusing a cell (slot touch or cursor) tints its still-possible sets in
      the tally. Mutually exclusive with the set→cells spotlight; suppressed
      while a hint is displayed.
- [x] 2b.2 Collapse "why not X": `pickExclusion`/`whyCantPlace` name a blocked
      competitor (already-placed / horseshoe / missing-horseshoe, clearest
      first) and highlight its blocker cell; appended to the collapse lead.
- [x] 2b.3 Placed-set distinct colour: clicking an already-placed set lights
      its home `COL_HINT_PLACED` (amber) vs the green "could go here" spotlight.
- [x] 2b.4 Dedicated inspect icon (owner round 3): a touch-sized badge in the
      margin above each cell, inspect-only (no editing); slot-touch auto-focus
      removed. Continuation legs name their referent explicitly and signal the
      sub-goal ("Still filling this cell — the highlighted set also …").

## 3. Rendering

- [x] 3.1 `COL_HINT` / `COL_HINT_CELL` / `COL_HINT_SPOT` palette + hint
      `OverlaySidecar` (target slot, neighbour cell, spotlight) + tally-set
      tint in the cache-miss tests (playbook §3.2).
- [x] 3.2 Enrol in `testing/hint-games.ts` (overlay + resume + quality
      guards all green with Subsets).
- [x] 3.3 Tier-2.5 render scenarios: arrow (target+neighbour), collapse
      (tally tint), hidden-single (spotlight), and the player-affordance frame
      — targeted assertions + snapshots.

## 4. Close out

- [x] 4.1 Full gate green (tsc · vitest 4251 · biome ci · vite build) +
      `openspec validate add-subsets-hint --strict`.
- [x] 4.2 Dev-verify in the browser: both aid directions, hidden-single
      spotlight, collapse "why not X", per-slot journey + "Still filling this
      cell" continuations, touch-sized inspect icon — 0 console errors.
- [x] 4.3 Update hint-authoring.md — per-slot + set→placement spotlight
      pattern, two-way aid, dedicated touch inspect affordance, continuation
      referent (§9.4a).
- [x] 4.4 Owner acceptance → archive, commit together.
