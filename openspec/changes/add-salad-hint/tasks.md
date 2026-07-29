# Tasks — add-salad-hint

Ordered so a **working Salad hint lands before either extraction is attempted**
(design "Risks"): if D3 or D5 fails to earn its keep, the change still ships the
hint plus a recorded no-go.

## 1. Read first

- [ ] 1.1 [`hint-authoring.md`](../../docs/porting/hint-authoring.md) §1–§5 and
      **§9 end-to-end** (the candidate-elimination pattern, what is already
      shared, and the Undead non-migration that bounds the extractions).
- [ ] 1.2 The exemplars, in this order:
      [`towers/index.ts`](../../src/native/games/towers/index.ts) (the reference
      walk), [`unequal/index.ts`](../../src/native/games/unequal/index.ts) (the
      one-shot `emitObviousCleanStep`), and
      [`crossing/index.ts`](../../src/native/games/crossing/index.ts) +
      [`group/index.ts`](../../src/native/games/group/index.ts) (the
      `CandidateMoveAdapter` — the two games whose dialect already differs).
- [ ] 1.3 Re-read [`salad/solver.ts`](../../src/native/games/salad/solver.ts)'s
      header and the port's `design.md` **F3** (a solved board legitimately
      leaves hole squares blank — design D4 turns on this).

## 2. The recording solver (additive, gated, provably inert)

- [ ] 2.1 Give Salad a `HintReason` union: `sync` (→ cross / → circle), `count`
      (→ holes-done / letters-done), `border` (→ near / far), plus the generic
      `LatinReason` arms it inherits.
- [ ] 2.2 Thread `solver.recorder` through `latinholesSolverSync`,
      `latinholesSolverCount` and `saladLettersSolverDir` — one `elim`/`place`
      record per candidate cleared, with its reason and premise (the line index
      for `count`, the clue index for `border`). **Gate every reason allocation
      and every record on `solver.recorder`** so the generator path allocates
      nothing (§9.1).
- [ ] 2.3 A `group` id per *firing*, not per pass (§3's recorded trap) — the
      Latin driver already bumps `solver.group` per rung attempt; confirm the
      three deductions fire one group each rather than sharing one.
- [ ] 2.4 `recordSaladDeductions(board, maxdiff)` — run the recording solver at
      the board's own difficulty, **deductive only**, seeded from the placed
      grid + fixed clues and **never the player's notes** (§9.1's soundness
      boundary; note the `seed` hook already runs before the recorder installs).
- [ ] 2.5 **Prove it inert: `salad-differential.test.ts` passes unedited.** If a
      fixture moves, the recorder leaked into generation — revert, don't
      re-baseline.

## 3. The plan walk (Salad-local first)

- [ ] 3.1 `buildSteps(state, autoClean)`: naked single → lazy populate →
      one-shot `emitObviousCleanStep` → next teachable strike → forced
      placement/marker, on a working `grid`/`holes`/`marks` copy.
- [ ] 3.2 Terminate on `latinholesCheck`, **not** "the grid is full" (design D4
      — a hole cell never collapses, so a grid-full loop never ends). Bound it
      with `stepBudget("salad hint plan")` (§7.2).
- [ ] 3.3 Emit a marker step (`cross` / `circle`) where the firing settles a
      square's emptiness rather than its symbol; group one firing's several
      squares into one journey with `continuesPrevious` (§5.5).
- [ ] 3.4 Skip every operation already reflected on the board, so a recompute
      resumes from any mid-game position (§7.1).
- [ ] 3.5 `{ type: "pencilStrike"; marks }` added to `SaladMove` +
      `executeMove` — idempotent (clearing a clear bit is a no-op), additive, so
      existing saves replay unchanged (design D6).
- [ ] 3.6 `hint: (s, aux, ui) => candidateHint(s, ui, saladFindMistakes, buildSteps)`.
- [ ] 3.7 `hintKeepTrack` / `refreshHintStep` as thin wrappers over the shared
      helpers with a `CandidateMoveAdapter<SaladMove>` (design D6; prefer option
      (b) — map a marker through the note projection — and fall back in the
      recorded order).

## 4. Narration + rendering

- [ ] 4.1 `narrate(reason, …)` per design D7, delegating the six generic arms
      (`default:`) rather than restating them. Mode-aware value rendering
      (`A…`/`1…`).
- [ ] 4.2 **Read one full plan out loud in each mode** before polishing (§6.4)
      — including a Number Ball board, which has no border clues and so must not
      read as a bare list of note strikes.
- [ ] 4.3 Sanity-read at the degenerate extreme `nums = order − 1` (one empty
      square per line) — §2.7, and open question 1.
- [ ] 4.4 `COL_HINT` / `COL_HINT_CELL` appended past the upstream enum; a hint
      `OverlaySidecar` in the cache-miss test alongside `ds.wrong` (§3.2).
- [ ] 4.5 A border-clue step shades **the clue glyph and its line of sight**
      (§5.2), reading the existing shared `borderScans(i, order)` rather than
      re-deriving the geometry.
- [ ] 4.6 Marks drawn struck through in the candidate grid (the Towers
      convention), and the marker steps echoing their own move shape (§5.1a).

## 5. Tests

- [ ] 5.1 Enrol in [`testing/hint-games.ts`](../../src/native/engine/testing/hint-games.ts)
      — one line, which buys `hint-resume`, `hint-overlay` and `hint-quality`.
- [ ] 5.2 `salad-hint.test.ts` (tier 1): each of the three techniques fires and
      narrates on a hand-built board; one firing = one journey; the plan is
      pure; a completed board and a mistaken board both refuse with the right
      string.
- [ ] 5.3 Tier 2.5 render scenarios + snapshots: a border-clue step (clue +
      line of sight shaded), a count step, a marker step. Assert targeted ops
      **plus** the snapshot.
- [ ] 5.4 A resume test: play the plan's first two steps by hand, recompute, and
      assert the new plan neither repeats them nor stalls.

## 6. Extraction 1 — the note encoding (design D3)

- [ ] 6.1 Spike `CandidateVocabulary` (`noteBit` / `valuesFor`) through
      `obviousCandidateMarks`, `regionDuplicateMarks`,
      `classifyPlacementInRegions` and `nakedSingle`, defaulting to today's
      `1 << n` bijection so **no existing call site changes**.
- [ ] 6.2 Migrate Salad onto it; migrate Crossing's `bit(n)` if it subsumes it.
- [ ] 6.3 **Behaviour-preservation check: every other candidate game's hint
      tests pass unedited.** If a test needs editing, the extraction changed
      behaviour — stop and re-evaluate.
- [ ] 6.4 If the stop condition trips (a helper needs to call back into the game
      for anything beyond the value↔bit map): abandon, keep Salad-local copies,
      and **record the no-go** in `hint-authoring.md` §9 next to Undead's.

## 7. Extraction 2 — narration vocabulary (design D5)

- [ ] 7.1 Add an optional `vocab` (noun, value renderer, region phrase) to
      `narrateLatinReason`.
- [ ] 7.2 Migrate whichever of Salad / Towers / Group come out **verbatim**;
      leave any game needing per-arm overrides on its own `narrate`.
- [ ] 7.3 Record the verdict per game either way (expected: Solo declines,
      because its region phrase varies per arm rather than per game).

## 8. Close out

- [ ] 8.1 `docs/porting/hint-authoring.md` §9 gains Salad as the worked example
      of a candidate game with a **non-uniform value set** (many solver values →
      one player note), plus whatever §6/§7 concluded.
- [ ] 8.2 Full gate green (`tsc -b --noEmit` → biome ci → `vitest run` →
      `vite build`).
- [ ] 8.3 `openspec validate add-salad-hint --strict`.
- [ ] 8.4 Dev-verify in Chrome: Hint in both modes, Auto-Hint through a whole
      plan, following a step by hand (plan survives), going off-plan (plan
      drops), and the refusal banner on a mistaken board.
- [ ] 8.5 On owner acceptance: archive, and commit the hint + archive together.
