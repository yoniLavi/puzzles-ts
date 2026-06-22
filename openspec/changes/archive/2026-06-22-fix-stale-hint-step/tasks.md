# Tasks

## 1. Reproduce + root-cause

- [x] 1.1 Reproduce the defect in an automated test (stronger than the proposed
      live DEV log, and a durable regression artifact). Built a faithful model of
      the midend hint lifecycle **and** a real-`Midend` keyboard-driven walk;
      both fail identically on the reported id at step 3 (dead candidate
      `(0,3)=5`). A runtime DEV invariant check was not added — the engine now
      structurally prevents the staleness and the tests cover it.
- [x] 1.2 Reproduced on id `5:2/4/3/2/1/2/1/3/2/3/3/1/3/4/2/1/3/3/2/2`. Trigger:
      **toggling auto-pencil mid-solve** (ON-throughout and OFF-throughout both
      pass; every toggling scenario fails) — which is why the prior consistent-
      setting search missed it.
- [x] 1.3 Root cause confirmed (design.md hypothesis 1): a plan built with
      auto-pencil OFF bakes explicit `pencilStrike` legs; turning auto-pencil ON
      makes a placement silently strike those candidates; the kept plan is
      re-displayed without re-validation. Secondary discovery: `hintKeepTrack`
      was fed the pre-move state but Towers' strike check was written (and
      unit-tested) for post-move, so following a strike always dropped the plan.

## 2. Failing test

- [x] 2.1 `towers-stale-hint.test.ts` drives a real `Midend` (show/keep/show)
      following the displayed hint while flipping auto-pencil, asserting every
      displayed strike names only live candidates — red before the fix (2 cases
      fail at step 3), green after.

## 3. Fix

- [x] 3.1 Engine-level validate-at-display (design option A): new optional
      `Game.refreshHintStep(step, state)` hook; `Midend.refreshActiveHint` calls
      it before every (re-)display (`hint()` re-show, kept manual move,
      executed-hint settle), dropping dead marks / advancing past resolved steps
      / recomputing a drained plan. Towers implements the hook. Secondary fix:
      `processInput` keeps the **pre-move** `hintKeepTrack` contract (Sixteen /
      Palisade rely on it) and uses the post-move state only for re-validation;
      Towers' inverted strike check corrected; the misleading post-move-state
      unit tests corrected to the production timing.
- [x] 3.2 Audited Singles / Range / Filling / Unruly: none has auto-pencil /
      `autoElim` / `pencilStrike` or any candidate-removing side effect, so the
      Towers-class staleness cannot occur. Coverage added: an engine-level
      synthetic-game test of the re-validation mechanism (`midend.test.ts`), and
      a cross-game "no plan step is ever a no-op when reached" invariant over
      every hint game (`hint-resume.test.ts`).

## 3b. Render-legibility defect (found during acceptance, 2026-06-22)

- [x] 3b.1 Root cause: a `pencilStrike` step flags its cells as hint targets →
      `COL_HINT` background fill, while the struck digit is drawn `COL_HINT` too
      → blue-on-blue, invisible. `hint()` does NOT mutate state (verified with
      the owner-suggested before/after pencil snapshot). The note is intact; the
      frame hid it.
- [x] 3b.2 Fix (`towers/render.ts`): only the placement target solid-fills
      `COL_HINT` (`if (hintTarget && struck === 0)`); a strike cell keeps the
      lighter `COL_HINT_CELL`/normal background so its `COL_HINT` strikethrough
      digit stays legible. Verified in-browser (struck `4`s now visibly crossed
      out, not gone).
- [x] 3b.3 Tests: the existing tier-2.5 render test had baked in the bug
      (asserted a `COL_HINT` rect on a strike frame) — corrected to assert the
      strike digit/line are `COL_HINT` while **no** `COL_HINT` background rect is
      drawn; added a placement-frame test (target still solid-fills `COL_HINT`);
      added a cross-game `hint()`-purity guard (requesting a hint never mutates
      the state) in `hint-resume.test.ts`.

## 3c. Strike legibility + multi-height narration (owner playtest, 2026-06-22)

- [x] 3c.1 Contrast: a struck candidate now keeps its normal `COL_PENCIL`
      colour with a `COL_HINT` strikethrough line (the cross-through is the cue),
      instead of recolouring the digit `COL_HINT` (which washed out against the
      lighter hint background). `towers/render.ts`.
- [x] 3c.2 Multi-height narration bug: a single clue firing can rule out several
      heights (lower-bound strikes 4 *and* 5 along a line), but the step narrated
      only one height while crossing out both. `nextClueStrike` now groups a
      firing's marks by struck height — one step per height, narrated with that
      height; further heights of the same firing are `continuesPrevious`
      continuation legs of one journey. `narrate` names the per-step height.
      Guarded by `towers-hint.test.ts` ("a strike step never mixes heights").

- [x] 4.1 `ts-engine` Hint System gained the "displayed step never stale"
      guarantee + the `refreshHintStep` mechanism + the pre-move `hintKeepTrack`
      timing + the "requesting a hint never mutates the board / a highlight is
      legible against its cell" guarantee (this change's `specs/ts-engine/`).
- [x] 4.2 `docs/porting/hint-authoring.md` §9 documents the staleness gotcha,
      the `refreshHintStep` hook, and the pre-move `hintKeepTrack` timing; §5.3
      documents the "foreground highlight must contrast with its cell fill"
      legend rule (the blue-on-blue struck-digit bug).

## 5. Verify

- [x] 5.1 `npm run test:run`, `tsc -b --noEmit`, `biome lint` green; `vite build`
      pending in the final gate run.
- [ ] 5.2 Browser: phantom gone on the reported id; exact-follow still keeps the
      plan; a conflicting move still regenerates. (Owner acceptance.)
- [x] 5.3 `openspec validate fix-stale-hint-step --strict` passes.
