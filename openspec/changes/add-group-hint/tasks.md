# Tasks — add-group-hint

> Scaffold only this session. Implement in a later session, following the
> hint-authoring playbook (`docs/porting/hint-authoring.md`) and the Keen/Unequal
> hint exemplars.

## 1. Recording solver (`solver.ts`)

- [ ] 1.1 Define `GroupReason` (`associativity` / `identityFill` / `identityElim`,
      design D2) and `HintReason = GroupReason | LatinReason`; a `HintOp extends
      DeductionRecord` with the narrowed reason (mirror `unequal/solver.ts`).
- [ ] 1.2 Thread `solver.recorder` through `solverNormal`: record the
      associativity placement with the `a,b,c` triple + the three known products,
      and each identity-row/column placement with the `identityFill` reason. Fire
      `solver.place(x, y, n, reason)`.
- [ ] 1.3 Thread `solver.recorder` through `solverHard`: record each ruled-out
      identity mark with the `identityElim` reason (a `dup`-style `elim` record).
- [ ] 1.4 **Recording early-return inside the `if (solver.recorder)` guard only** —
      return after one firing when recording so one `group` = one deduction; the
      un-recorded fixpoint is untouched (design D2, the differential-safety crux).
- [ ] 1.5 `recordGroupDeductions(state, maxdiff)` — run the recording solver on a
      cube seeded from the placed givens/entries (never notes) and return the op
      script. Recorder-off `solveGroup` stays byte-identical.

## 2. Hint plan (`index.ts`)

- [ ] 2.1 `hint(state, aux?, ui?)` building the D3 preference ladder: naked single
      → (lazy populate) basic Latin culls → Group's own deduction (associativity /
      identity fill / identity elim) → forced generic placement. Cap below
      recursion. Reuse `candidateHint` / `lazyPopulate` / `nextPlace` /
      `nakedSingle` from `candidate-hint.ts`.
- [ ] 2.2 Narration (design D4, quality bar): the associativity centrepiece
      (name the triple + the three known products + the forced fourth), the
      identity-fill story, the identity-elimination story; generic reasons via
      `narrateLatinReason` / `singlePlacementReason` / `hiddenSingleLine`. Cells
      named by their element letters.
- [ ] 2.3 One firing = one journey: the identity fill emits its whole row/column as
      `continuesPrevious` legs; equivalent placements share the target colour.
- [ ] 2.4 `hintKeepTrack` (set-of-hinted-value → completed; subset pencilStrike →
      onTrack/completed; else off) and `refreshHintStep` (drop dead marks / resolve)
      — reuse `keepCandidateHintTrack` / `refreshCandidateHintStep`.
- [ ] 2.5 Refusal on solved / on `findMistakes` non-empty (engine lights the
      overlay); honest "no forced move" when capped below recursion finds nothing.
- [ ] 2.6 Wire `hint` / `hintKeepTrack` / `refreshHintStep` onto `groupGame`.

## 3. Render (`render.ts`)

- [ ] 3.1 Append `COL_HINT` (target) + `COL_HINT_CELL` (evidence) past the palette.
- [ ] 3.2 Render the hint: shade the premise cells (associativity's three known
      products / the identity-revealing cell), ring the target cell(s), strike the
      ruled-out identity mark; folded into the per-cell diff cache via a hint
      sidecar (`ds.wrongEdges`-style `Int32Array`). The hint never performs the move.
- [ ] 3.3 Thread the `hint?` param already present in `redraw` (currently `_hint`)
      into the cache key + draw path.

## 4. Tests

- [ ] 4.1 A recorded reason per technique (associativity, identity fill, identity
      elim, generic single) — assert the op script (`group-hint.test.ts`).
- [ ] 4.2 Plan solves a generated board from empty AND from mid-game; `groupGame`
      joins the shared `hint-resume.test.ts` (include an **identity-hidden** board
      so `solverHard`/`identityElim` is covered — design D5 risk).
- [ ] 4.3 Refusal on solved / on mistakes; `hintKeepTrack` verdicts.
- [ ] 4.4 Tier-2.5 render-scenario snapshot of an associativity journey frame
      (reach it via a fixed-seed scan + `hintUntil`, per the Palisade seed).
- [ ] 4.5 **Re-run the frozen `group-c-reference.json` differential** — it MUST
      still pass byte-for-byte (the recording-off path is unchanged).

## 5. Close-out

- [ ] 5.1 Full gate green (`tsc` → biome → `vitest` → `vite build`).
- [ ] 5.2 `openspec validate add-group-hint --strict`.
- [ ] 5.3 Dev-verify in the browser: request a hint on an identity-shown and an
      identity-hidden board; confirm the associativity narration reads correctly,
      auto-hint paces one step at a time, and the highlights match the story.
- [ ] 5.4 Update `docs/porting/hint-authoring.md` if Group surfaced anything the
      guide didn't cover (the placement-first latin-family hint shape).
- [ ] 5.5 Owner acceptance → archive + commit together.
