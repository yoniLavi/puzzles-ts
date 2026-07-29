# Tasks — add-salad-hint

Ordered so a **working Salad hint lands before either extraction is attempted**
(design "Risks"): if D3 or D5 fails to earn its keep, the change still ships the
hint plus a recorded no-go.

> **Implementation note.** Both extractions landed, but D3 landed **narrower than
> designed** and the recorder threading landed **smaller** than §2 anticipated —
> see design `F1`–`F6` for the findings, which are the substantive record of this
> change. Sections 6 and 7 were done *after* the hint was green, as ordered.

## 1. Read first

- [x] 1.1 [`hint-authoring.md`](../../docs/porting/hint-authoring.md) §1–§5 and
      **§9 end-to-end** (the candidate-elimination pattern, what is already
      shared, and the Undead non-migration that bounds the extractions).
- [x] 1.2 The exemplars, in this order:
      [`towers/index.ts`](../../src/native/games/towers/index.ts) (the reference
      walk), [`unequal/index.ts`](../../src/native/games/unequal/index.ts) (the
      one-shot `emitObviousCleanStep`), and
      [`crossing/index.ts`](../../src/native/games/crossing/index.ts) +
      [`group/index.ts`](../../src/native/games/group/index.ts) (the
      `CandidateMoveAdapter` — the two games whose dialect already differs).
- [x] 1.3 Re-read [`salad/solver.ts`](../../src/native/games/salad/solver.ts)'s
      header and the port's `design.md` **F3** (a solved board legitimately
      leaves hole squares blank — design D4 turns on this).

## 2. The recording solver (additive, gated, provably inert)

- [x] 2.1 Give Salad a `HintReason` union: `sync` (→ cross / → circle), `count`
      (→ holes-done / letters-done), `border` (→ near / far), plus the generic
      `LatinReason` arms it inherits. **Landed as `SaladReason` in `hint.ts`**,
      with the sync/count arms reshaped by F1: `crossNaked`, `countHolesDone`,
      `countLettersDone`, `forcedCross`/`forcedCircle`, `circleXNote`.
- [x] 2.2 Thread `solver.recorder` through the deductions. **Narrower than
      planned (F1): only `saladLettersSolverDir` records.** Sync and count write
      *markers*, not candidates, so their conclusions are re-derived from the
      visible board instead — which is both a smaller gated surface and the
      honest narration (§9.3a applied to markers). Every reason allocation and
      record stays gated on `solver.recorder`.
- [x] 2.3 A `group` id per *firing*, not per pass (§3's recorded trap). **This
      was a real bug, not a confirmation (F2)** — one rung call covered sync +
      all `4·order` clue scans + the counts, so a step gathered strikes from
      unrelated clues in unrelated lines. Fixed with the §9.5 gated early return
      at both levels (per clue, and per sub-deduction of `saladSolverEasy`).
- [x] 2.4 `recordSaladDeductions(board, maxdiff)` — deductive only, seeded from
      the placed grid **plus the confirmed markers** (F4: a cross/ball is a real
      entry Check & Save judges, so the cube may assume it; notes never are).
- [x] 2.5 **Proved inert: `salad-differential.test.ts` passes unedited** (28
      fixtures, byte-for-byte).

## 3. The plan walk (Salad-local first)

- [x] 3.1 `buildSteps(state, autoClean)`: naked symbol → cheap marker deduction →
      lazy populate → one-shot `emitObviousCleanStep` → next teachable strike →
      forced placement → forced marker, on a working `grid`/`holes`/`marks` copy.
      (The marker pass sits at step 2, ahead of populate, so a Number Ball board
      opens on its visible line counts rather than on "pencil everything in".)
- [x] 3.2 Terminates on `latinholesCheck`, **not** "the grid is full" (design D4);
      bounded by `stepBudget("salad hint plan")` — which needed
      `LatinSolverConfig.budgetLabel`, since `latin.ts` hard-coded Towers' label.
- [x] 3.3 A marker step (`cross` / `circle`) where the firing settles a square's
      emptiness; one firing's several squares are one journey with
      `continuesPrevious`, plus a folded tidy-up leg striking the
      "might be empty" marks the new balls have made impossible.
- [x] 3.4 Every operation already reflected on the board is skipped, so a
      recompute resumes from any mid-game position (§7.1).
- [x] 3.5 `{ type: "pencilStrike"; marks }` added to `SaladMove` + `executeMove`
      — idempotent, additive, existing saves replay unchanged. Mark
      `n = nums + 1` is the X mark, so `1 << (n − 1)` covers symbols *and* the
      collapsed hole note with one formula.
- [x] 3.6 `hint: (s, _aux, _ui) => candidateHint(s, undefined, saladFindMistakes,
      buildSteps)` — no `autoPencil` pref exists to honour (see the follow-up note
      in `hint-authoring.md` §9.7).
- [x] 3.7 `hintKeepTrack` / `refreshHintStep` over a
      `CandidateMoveAdapter<SaladMove>`. **Design D6 option (b) failed and (c)
      applies, narrowly (F3):** a marker cannot be projected onto the canonical
      `set` shape, because `refreshCandidateHintStep` resolves a placement on
      `grid[cell] !== 0`, which for a cross never becomes true. The two marker
      shapes are judged in ~12 local lines; everything else delegates.

## 4. Narration + rendering

- [x] 4.1 `narrate(reason, ns, state)` per design D7, delegating the six generic
      arms to `narrateLatinReason` under a mode-aware `LatinVocab`.
- [x] 4.2 **Read one full plan out loud in each mode** — done, and it caught
      three wording defects: "all 2 of its empty squares" (→ "both"), "the A must
      be the square nearest the clue" (→ "must be in"), and a Number Ball plan
      that reads as counting-and-collapse throughout rather than a bare list of
      note strikes.
- [x] 4.3 Sanity-read at the degenerate extreme `nums = order − 1` — the 4×4 A~C
      render board *is* that case, and its wording is pinned by a `narrate` unit
      test (open question 1 resolved as its default: the general wording, checked).
- [x] 4.4 `COL_HINT` / `COL_HINT_CELL` appended past the upstream enum; a hint
      `OverlaySidecar` in the cache-miss test alongside `ds.wrong`.
- [x] 4.5 A border step shades **the clue glyph and the run it reasons over**,
      read off the shared `borderScanFor(cd, o)` (new, the inverse of the existing
      `borderScans` clue numbering) rather than re-derived.
- [x] 4.6 Marks drawn struck through in the candidate grid (the Towers
      convention), and each step ghosting **its own move shape** in `COL_HINT`
      (§5.1a) — a symbol, a cross, or a ball outline. The acted-on square is
      *ringed* rather than filled (§5.4), so its ghost and struck notes stay
      legible.

## 5. Tests

- [x] 5.1 Enrolled in
      [`testing/hint-games.ts`](../../src/native/engine/testing/hint-games.ts) —
      `hint-resume`, `hint-overlay` and `hint-quality` all green.
- [x] 5.2 `salad-hint.test.ts` (tier 1): each of the three techniques fires and
      narrates; one firing = one journey; a step's targets lie inside the area it
      shades (**the assertion that caught F2**); the `forced*` backstops' wording;
      both modes' vocabulary; refusal on a solved and on a mistaken board; the
      recorder's purity; `pencilStrike` idempotency; the marker keep-track arms.
- [x] 5.3 Tier 2.5 render scenarios + snapshots in `salad-render.test.ts`: the
      far and near border arms, a cross ghost, a ball ghost, a placement ghost,
      and a struck-candidate frame — targeted ops **plus** snapshots.
- [x] 5.4 A resume test: play the plan's first two steps by hand, recompute, and
      assert the new plan neither repeats them nor stalls.

## 6. Extraction 1 — the note encoding (design D3)

- [x] 6.1 Spiked `CandidateVocabulary` and **landed the half that had a consumer**
      (F5): `NoteEncoding { bit?, values? }` through `obviousCandidateMarks`,
      `regionDuplicateMarks`, `classifyPlacementInRegions` / `classifyPlacement` /
      `singlePlacementReason` and `nextStrike`, defaulting to `1 << n` so no
      existing call site changes. Plus the `placed`-vs-`grid` split on
      `nextStrike` / `nextPlace` / `firstUnreflectedPlaceIndex`, which Salad is
      the first game to need.
- [x] 6.2 Salad is on it. Crossing's `bit(n)` is the *same* projection and stays
      on the adapter (which is where a game already declares its dialect); the two
      declarations now cross-reference so they cannot drift.
- [x] 6.3 **Behaviour-preservation check: every other candidate game's hint tests
      pass unedited** (full suite, 5076 tests).
- [x] 6.4 The **many-to-one arm (`valuesFor`) is a recorded no-go**: threading it
      found no consumer, because in the *cube* Salad's holes are perfectly Latin
      and on the player's board no hole symbol is ever placed or singled. Reason
      recorded on `NoteEncoding` itself and in `hint-authoring.md` §9.7.

## 7. Extraction 2 — narration vocabulary (design D5)

- [x] 7.1 `narrateLatinReason(reason, ns, vocab?)` takes an optional `LatinVocab
      { noun, value(n), cell? }`. The `cell` field is the third knob the design
      did not anticipate and Salad does need — its board is *squares*, and mixing
      "cell" and "square" inside one game's hints reads as sloppy.
- [x] 7.2 **Salad and Group migrated verbatim; Group's hand-written copy of the
      six arms is deleted.** Its tests pass unedited.
- [x] 7.3 Verdicts recorded per game: **Towers declines** (it needs the value
      *qualified* in two arms and bare in the rest — two renderers for six arms),
      **Solo declines** (region phrase varies per arm), exactly as predicted. Also
      landed: the shared `dup` arm now chooses "a"/"an" from the rendered value,
      which is why Group could drop its reworded copy — and which fixes the
      pre-existing "a 8" in the digit games.

## 8. Close out

- [x] 8.1 `docs/porting/hint-authoring.md` gains **§9.7** — Salad as the worked
      example of a candidate game with a non-uniform value set and
      marker-shaped conclusions — plus the two extraction notes in the §9 callout.
- [x] 8.2 Full gate green (`tsc -b --noEmit` → biome → `vitest run` →
      `vite build`).
- [x] 8.3 `openspec validate add-salad-hint --strict`.
- [x] 8.4 Dev-verified in Chrome: the populate opener, a border-clue frame (clue
      lit, run shaded, `A`/`B` struck through), a placement frame (ghosted `B`),
      Auto-Hint through a stretch of plan, following a step by hand (the plan
      survived *and* advanced into its journey's continuation leg), and the
      refusal banner + red overlay on a mistaken board.
- [x] 8.4a **Two owner-reported defects found in that session and fixed** (design
      `F8`): the hint's opener, and then the Mark-all button, both *reset* the
      player's pencil marks instead of filling the gaps. Both now go through an
      additive `pencilAll` — the button via the shared `adaptiveMarkAll`, as
      asked — with three regression tests and a live re-verification. The same
      defect in the rest of the Latin family is written up with a recommendation
      rather than fixed here, because it changes a shipped move's replay
      semantics.
- [x] 8.5 Owner-accepted 2026-07-30 (after the two `F8` fixes): archived, and
      committed together with the hint.
