# Tasks — add-boats-hint

## 1. Read first

- [x] 1.1 [`docs/porting/hint-authoring.md`](../../docs/porting/hint-authoring.md)
      end to end, then the two exemplars this change follows:
      **§5.6a′ Bricks** (a contradiction solver reads its reason off the
      validator — Boats' Hard tier verbatim) and
      **Spokes** (`deduceSpokesPlan` — the hint as a second projection of the
      solver, `§5.1a` two move shapes, `§2.10` goal-first firing order).
- [x] 1.2 Confirmed: **Crossing ships no `hint()`**. The reusable shape was in
      spokes/bricks/clusters/subsets; Crossing's *inventory aid* stays design
      D8's separate change.
- [x] 1.3 Re-read the `boats` spec's non-monotone-solver requirement and
      `solveAtAnyTier`. The hint replays at the board's own tier (design D2).

## 2. The shared plan loop (design D7)

- [x] 2.1 `src/native/engine/hint-plan.ts` — `deduceHintPlan({ board, status,
      incomplete, next, apply?, planCap?, budget? })` → `{ status, plan }`.
      Takes **both** bounds so no existing consumer is silently retuned.
      *Deviation from D7:* the caller passes an already-cloned `board` rather
      than a `clone` callback — the clone is one game-specific line
      (`cloneBoard` / `grid.slice()` / `cloneState`) and a callback only hid it.
- [x] 2.2 `spokes/solver.ts` `deduceSpokesPlan` refactored onto it;
      `spokes-hint.test.ts` passes **unedited**.
- [x] 2.3 Same for `bricks`, `clusters` and `subsets` — all four unedited
      (70 tests). **Subsets fitted after all**, contrary to design D7's hedge:
      its rungs apply-as-they-detect, which is exactly why `apply` is optional.
      No no-go to record.
- [x] 2.4 `hint-plan.test.ts` — stops on a non-incomplete status (without even
      asking for a firing), stops when `next` returns null, honours the cap,
      honours the budget, never reaches past its working board, and supports the
      no-`apply` shape. **Found a real bug**: `if (!firing)` treated a falsy
      firing (a cell index of `0`) as "deduction exhausted"; now `== null`.

## 3. The recording deduction pass (design D1, D3, D4)

- [x] 3.1 `BoatsFiring` / `BoatsTechnique` / `BoatsBreach` / `BoatsLine` types.
      *Deviation from D1:* they live in a **new `boats/hint-solver.ts`**, not in
      `solver.ts`. The C is gone, so a frozen fixture is the only guard left on
      `solveBoats`; a separate module makes "the solver is untouched" checkable
      from the file list. `solver.ts` gained only three `export` keywords
      (`placeShip`, `placeWater`, `fillRow`) — no behaviour change.
- [x] 3.2 `nextBoatsFiring` — goal-first (placements before rule-outs, cheaper
      tier before dearer). `solveBoats` untouched.
- [x] 3.3 Easy rung: `givenClue`, `neverTouch`, `lineForced`, `allWaterPlaced`,
      `centreForced`, `mustExtend`, `lineSatisfied`, `isolated`.
      *Two techniques added beyond the D3 table*, both forced by the decision to
      resume from the player's board: `givenClue` (what `solverInitial` folded
      into its grid wipe) and `neverTouch` (what `placeShip` applied as a silent
      side effect). Both are genuinely teachable, so this is a gain.
- [x] 3.4 Normal rung: `onlyRunsLeft` (simple), `centreCount`, `growTooLong`,
      `runTooShort`, `mustGrow`.
- [x] 3.5 Tricky rung: `onlyRunsLeft` (full), `sharedDiagonal`. Hidden
      occupancy numbers are recovered as **bookkeeping, not a firing** —
      revealing a number is not a move the player can make — and each recovered
      number is recorded so a narration citing it says where it came from.
- [x] 3.6 Hard rung: `refuted`, classified off the validation family's own
      `errs` arrays. **The classifier had to be made total** — `checkFleet`'s
      duplicate-size path and `adjustShips`' ship-total check flag nothing, so
      the first cut returned "no reason" and the whole Hard tier produced zero
      firings. Now every branch ends in a reason, with `unfinishable` as the
      honest catch-all.
- [x] 3.7 `deduceBoatsPlan` over the shared loop, replaying at the lowest cap
      that solves the board and escalating only if that tier has nothing to say.
      Guarded with a `stepBudget`.
- [x] 3.8 Tier-1 tests (`boats-hint.test.ts`): every planned square agrees with
      the unique solution (>500 squares across all four tiers — the guard that
      makes a mis-transcribed condition impossible to ship), per-technique
      narration, purity, and per-tier convergence.

## 4. Narration (design D3; hint-authoring §2)

- [x] 4.1 `narrate(firing)` in `index.ts` — necessity voice, indication first,
      premise singles out the conclusion, conclusion matches the action.
- [x] 4.2 Degenerate extremes (§2.7): a 0-clue line gets its own sentence
      ("Column 4's number is 0…") because "shows the 0 ships its number allows"
      is nonsense; singular/plural handled throughout; `growTooLong` with no
      boats left says so instead of "a boat of 0".
- [x] 4.3 Read out loud on eight boards across all four tiers, and fixed what
      read badly rather than what tested badly:
      - "has almost no water left to give" → the actual count ("can take only 2
        more water squares") — a vague premise doesn't single out its
        conclusion (§2.4);
      - "the fleet would need a boat it doesn't have" → "it would complete a
        boat the fleet has no room for" — the first mis-described what the flag
        being read actually means;
      - "that square must be a boat" → "must hold a boat segment" — a square is
        not a boat, and the game's own model is segments.
      Longest step: 154 chars (shared ceiling 300; per-game guard 170).

## 5. `hint()` / `hintKeepTrack()` (design D5, D6)

- [x] 5.1 One journey per firing; multi-square firings emit `continuesPrevious`
      legs sharing one explanation and one highlight.
- [x] 5.2 The three refusals, `findMistakes` on the mistake path — including the
      wrong-but-rule-legal placement, which the re-solve catches and a live rule
      check would not (tested explicitly).
- [x] 5.3 `hintKeepTrack`. **Judges the displayed *leg*, not the journey** — the
      midend holds the step on `"onTrack"`, so a journey-wide criterion means
      leg 1 never completes and auto-play re-applies it for ever. The leg's
      squares are derived from `step.move`, so nothing extra is stored.
- [x] 5.4 Boats enrolled in `src/native/engine/testing/hint-games.ts`
      (hint-overlay, hint-resume, hint-quality all green).

## 6. Rendering (hint-authoring §5)

- [x] 6.1 `COL_HINT` (15) + `COL_HINT_CELL` (16) appended past the upstream
      enum — checked safe against `augmentation.ts` (`paletteOverrides: { 4 }`).
- [x] 6.2 Each move shape echoed (§5.1a): a forced boat draws the
      unresolved-segment mark in `COL_HINT`, forced water draws the same tildes
      a given water square carries, in `COL_HINT`. Neither performs the move.
- [x] 6.3 Evidence as an area, decided per cell from its own state (§5.4):
      an undecided evidence square is **shaded** `COL_HINT_CELL`, a decided one
      is **ringed** — a light-blue fill over water or a segment would paint over
      the very thing that makes the square evidence. The never-touch water is
      shown as part of the step and never narrated (owner decision 1).
- [x] 6.4 Hint bits folded into the per-tile cache key (bits 9–11), so the
      overlay paints and clears; cross-game `hint-overlay.test.ts` green.
- [x] 6.5 Tier-2.5 render scenarios per tier + a snapshot; asserts targets carry
      `COL_HINT`, evidence carries `COL_HINT_CELL`, and a no-hint frame carries
      neither.

## 7. Close out

- [x] 7.1 `boats-differential.test.ts` — 34/34 green (`solveBoats` untouched).
- [x] 7.2 Full gate green (4913 tests, 229 files; `vite build` clean).
- [x] 7.3 `openspec validate add-boats-hint --strict`.
- [x] 7.4 Owner acceptance-tested in the app, 2026-07-29: "it all looks good".
- [x] 7.5 `docs/porting/hint-authoring.md` updated: the shared plan loop (§3),
      the solver-that-wipes-the-board lesson, §5.5a (a journey completes leg by
      leg), §5.5b (a region move must not reach past its targets), and the
      §5.6a′ addendum that a validator-reading classifier must be **total**.
- [x] 7.6 On owner acceptance: archive + commit hint and archive together.

## 8. Follow-up, not this change

- [ ] 8.1 Scaffold `add-boats-fleet-aid` (design D8) — the Crossing-style
      inventory aid over the fleet display. **After this change is accepted**
      (owner decision 2), not alongside it.

## Recorded no-gos and open notes

- **`mustGrow` never fires on a generated board.** Measured over 200 boards
  spanning every preset and both "remove numbers" settings, the
  `minExpandDsf` technique fired zero times: its position (an unfinished boat
  with a resolved end cap, every boat of that length already found) is reliably
  reached first by a cheaper rung, most often `allWaterPlaced`, whose
  precondition it very nearly implies. It is **kept, but moved to the bottom of
  the Normal rung** — a safety net that only fires when nothing else can, rather
  than a preferred technique. Its narration is consequently the one string in
  this change not exercised by a generated board; the alternative (deleting it)
  risked stranding a board the sample didn't cover.
- **The `local` flag on a refutation was dropped.** Design D4 proposed flagging
  whether the contradiction is adjacent to the move so the narration could say
  so. In the event none of the refutation phrasings *claims* adjacency — they
  name the rule and let the highlight show where — so the flag had no honest
  consumer (§5.6 is satisfied by not over-claiming).
