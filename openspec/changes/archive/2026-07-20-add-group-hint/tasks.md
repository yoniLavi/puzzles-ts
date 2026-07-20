# Tasks — add-group-hint

> Implemented 2026-07-21. Followed the hint-authoring playbook
> (`docs/porting/hint-authoring.md`) and the Keen/Unequal hint exemplars. Two
> refinements surfaced during implementation (both recorded in `design.md`):
> Group's move model differs from the shared `CandidateMove`, so it emits **native
> placement moves** (`set {cells, n}`) and the hint keep-track/refresh are
> game-specific (design D2b); and upstream's dropped **'M' (mark-all) is re-added**
> as a real play move so the populate step is followable by hand (owner-approved,
> reverses the port's D6 — design D2c).

## 1. Recording solver (`solver.ts`)

- [x] 1.1 Define `GroupReason` (`associativity` / `identityFill` / `identityElim`,
      design D2) and `HintReason = GroupReason | LatinReason`; a `HintOp extends
      DeductionRecord` with the narrowed reason (mirror `unequal/solver.ts`).
- [x] 1.2 Thread `solver.recorder` through `solverNormal`: record the
      associativity placement with the `a,b,c` triple + the three known products,
      and each identity-row/column placement with the `identityFill` reason. Fire
      `solver.place(x, y, n, reason)`.
- [x] 1.3 Thread `solver.recorder` through `solverHard`: record each ruled-out
      identity mark with the `identityElim` reason (a witness product + the
      ruled-out element).
- [x] 1.4 **Recording early-return inside the `if (solver.recorder)` guard only** —
      `solverHard` returns after one element's strikes when recording so one
      firing = one deduction; the un-recorded fixpoint is untouched (`solverNormal`
      already returned per firing on both paths). Differential-safety crux.
- [x] 1.5 `recordGroupDeductions(grid, w, maxdiff)` — run the recording solver on a
      cube seeded from the placed givens/entries (never notes) and return the op
      script. Recorder-off `solveGroup` stays byte-identical.

## 2. Hint plan (`index.ts`)

- [x] 2.1 `hint(state, aux?, ui?)` building the D3 preference ladder: naked single
      → (placement-first) Group's own placement when it's the immediate next
      deduction → (else) lazy populate + obvious cull + the next elimination →
      the placement it enables. Cap below recursion. Reuses `candidateHint` /
      `lazyPopulate` / `emitObviousCleanStep` / `nextStrike` / `nextPlace` /
      `nakedSingle` / `firstUnreflectedPlaceIndex` from `candidate-hint.ts`.
- [x] 2.2 Narration (design D4, quality bar): the associativity centrepiece
      (names the triple + the three known products + states the law with the
      concrete letters), the identity-fill story, the identity-elimination story;
      generic reasons narrated **Group-locally** (elements are letters a–z, so
      `narrateLatinReason`'s digit formatting is wrong — the arms are transcribed
      with `toChar`). Cells named by their element letters.
- [x] 2.3 One firing = one journey: the identity fill emits its whole row/column as
      `continuesPrevious` legs (`emitIdentityFillJourney`); a strike firing's marks
      share one `pencilStrike` step; equivalent placements share the target colour.
- [x] 2.4 `hintKeepTrack` (native placement `set` → completed; native `pencil`
      toggle clearing a strike mark → onTrack/completed; `pencilAll` → completed;
      else off) and `refreshHintStep` (drop dead marks / resolve). **Game-specific**
      (Group's move shape differs from the shared `CandidateMove`).
- [x] 2.5 Refusal on solved / on `findMistakes` non-empty (engine lights the
      overlay, via the shared `candidateHint`); honest "no further move" when
      capped below recursion finds nothing.
- [x] 2.6 Wire `hint` / `hintKeepTrack` / `refreshHintStep` + `canMarkAll` onto
      `groupGame`; add `pencilAll` / `pencilStrike` moves + the `M` key.

## 3. Render (`render.ts`)

- [x] 3.1 Append `COL_HINT` (target) + `COL_HINT_CELL` (evidence) past the palette.
- [x] 3.2 Render the hint: shade the premise cells (associativity's three known
      products / the identity-revealing cell), fill the target cell(s) `COL_HINT`,
      strike the ruled-out identity marks; folded into the per-cell diff cache via
      the shared `OverlaySidecar` (keyed by grid cell so the overlay follows an
      element through a reorder). The hint never performs the move.
- [x] 3.3 Thread the `hint` param (was `_hint`) into the sidecar pack + cache key +
      draw path.

## 4. Tests

- [x] 4.1 A recorded reason per technique (associativity, identity fill, identity
      elim, generic single) — `group-hint.test.ts`.
- [x] 4.2 Plan solves a generated board from empty AND from mid-game; `groupGame`
      joins the shared `hint-resume.test.ts` (and `group-hint.test.ts` adds an
      **identity-hidden** Hard walk so `solverHard`/`identityElim` is covered —
      design D5 risk).
- [x] 4.3 Refusal on solved / on mistakes; `hintKeepTrack` verdicts.
- [x] 4.4 Tier-2.5 render-scenario snapshot of an associativity journey frame
      (reached via a fixed-seed scan + `hintUntil`, per the Palisade seed).
- [x] 4.5 **Re-ran the frozen `group-c-reference.json` differential** — still
      passes byte-for-byte (the recording-off path is unchanged).

## 5. Close-out

- [x] 5.1 Full gate green (`tsc` → biome → `vitest` → `vite build`).
- [x] 5.2 `openspec validate add-group-hint --strict`.
- [x] 5.3 Dev-verified in the browser (2026-07-21): hint renders on identity-shown
      (hidden single: line shaded, target filled blue) and identity-hidden boards;
      the **associativity** narration reads correctly and the three known products
      shade as evidence with the forced cell filled — verified live on an 8×8 Hard
      board ("You've filled a·h = c, h·f = g and a·(h·f) = b. Because (a·h)·f =
      a·(h·f) in any group, (a·h)·f must also be b."); Auto-Hint paces one step at a
      time; zero console errors. (Note: the pre-existing F8 deep-link blank-board
      repaint race reproduced on a `?type=` deep link — separately tracked, not this
      change; the board paints on reload.)
- [x] 5.4 Update `docs/porting/hint-authoring.md` (the placement-first latin-family
      hint shape + the letter-value narration note).
- [x] 5.5 Owner acceptance (2026-07-21) → archived + committed together.
