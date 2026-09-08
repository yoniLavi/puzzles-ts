# refuse-honestly-at-every-tier — tasks

## 1. Widen the instrument first

- [x] 1.1 `hint-resume.test.ts`'s `solveByHints` walk iterates **every leaf
      preset**, not `firstLeaf`.
- [x] 1.2 Tier the cost. Gate slice: **one preset per declared tier**, one seed —
      tier is the axis the narrow form was blind to, so a slice keyed on a count
      would restore the blindness. Slow tier: **every preset, still one seed**.
      Gate slice measured at **26–35 s**.

      > **Five seeds and two seeds were both tried and withdrawn**, which is the
      > useful part. Five × 209 presets ran **50 minutes without reporting**; two
      > was still north of twenty. This walk is quadratic in board size twice
      > over — a full hint recompute per move, and more moves on a bigger board —
      > so widening the presets is not free the way adding seeds to one small
      > board was. A once-per-round check that takes tens of minutes has been
      > made unrunnable, not thorough (`AGENTS.md` § "Test discipline", added by
      > the owner directive of the same day).
      >
      > **The depth is not lost**: the file's three other guards — no-op-free
      > plans, hint purity, Latin naked-single honesty — still run all five
      > seeds, and a seed-specific plan bug surfaces there. What was missing was
      > never another seed on the easiest board; it was ever looking at a hard
      > one.
- [x] 1.3 Vacuity counts: per-game (`presets.length > 0`) and sweep-wide
      (`walkedCases > 40`, against ~70 today).
- [x] 1.4 **Confirm the premise before task 2 collapses anything** — zero
      refusals on any preset whose tier does not permit search.

      > **Already measured, at exactly the committed slow-tier configuration.**
      > The opening measurement of this change *was* every preset × one seed:
      > 209 cases, 13 refusals, **all thirteen at a tier permitting search**. So
      > the premise holds at the configuration that ships, and the two attempts
      > to re-confirm it at four and five seeds were re-measuring an answer
      > already in hand — under a box at load average 533, which is why neither
      > finished. Stopped rather than re-run, per the standing rule for
      > contention flakes.
      >
      > The guard now *enforces* the premise rather than resting on it: a refusal
      > outside a search-permitting tier fails the walk, proved by forcing one
      > (task 3.3).

## 2. Collapse the wording

- [x] 2.1 One constant, `DEDUCTION_EXHAUSTED`. `NO_DEDUCTION_LEFT` and
      `NO_DEDUCTION_LEFT_TRIAL_AND_ERROR` are **deleted**, not aliased, so no
      call site can keep the old voice. The name changed deliberately: 21 sites
      used `NO_DEDUCTION_LEFT`, and keeping the name while changing the value
      would have moved every one of their words with nobody looking.
- [x] 2.2 **Wording: Galaxies', verbatim.** *"Nothing further follows by
      deduction here. This board's difficulty allows positions that need trial
      and error: save a checkpoint, try one, and undo if it breaks."* It was the
      only one of the three that told the player what to do, and the only one an
      owner had accepted (owner, 2026-08-11).
- [x] 2.3 Repointed: bricks, galaxies, lightup, undead, plus boats, clusters,
      dominosa, filling, palisade, pattern, range, singles, slant, spokes,
      sticks, subsets, unruly directly; abcd, crossing, group, keen, mathrax,
      salad, seismic, solo, towers and unequal through `candidate-hint.ts`.
- [x] 2.4 **`candidate-hint.ts` was spelling out *three* constants, not one** —
      `ALREADY_SOLVED` and `FIX_MISTAKES_FIRST` too. It now calls
      `commonHintRefusal` and imports `DEDUCTION_EXHAUSTED`. The value-sweep was
      run to exhaustion over all seven refusal constants; those three were the
      only copies, and all three were in that one module.
- [x] 2.5 `hint-refusal.ts`'s header no longer justifies two constants and now
      says that every builder of a `hint()` imports from it, shared ones
      included. `hint-refusal.test.ts`'s `APPROVED` set follows.
- [x] 2.6 `help/features.md` § "When there's no hint to give" **needed no
      change — and that is a finding.** It already teaches exactly the collapsed
      message: *"Deduction has run out… which is what an Unreasonable puzzle is
      for. Save your position, try something, and come back if it doesn't work
      out."* The help page was right; five games' code disagreed with it.

## 3. Make the guard hold the finding

- [x] 3.1 The walk asserts, on every refusal: the message is `DEDUCTION_EXHAUSTED`
      **and** the preset's tier permits search. Permission is derived — a tier
      named `Unreasonable` is the collection's own promise about search
      (`AGENTS.md` § "Check / Tactic / Search") — read through `difficultyTiers`
      and the contract. No roster.
- [x] 3.2 A hinting game with **no difficulty contract** has no tier to blame, so
      nothing it offers permits search: it must never run out of deduction on a
      sound board, and the walk holds it to that rather than skipping it.
- [x] 3.3 **Proved it fails, both ways.** Pointed Undead at a bespoke sentence →
      *"ran out of deduction after 14 moves and said "PROBE: a bespoke phrasing"
      — a board whose tier permits search must use the collection's one wording
      for it"*. Forced Unruly (no search tier) to refuse → *"unruly-8x8 Easy:
      hint gave up after 0 moves"*. Both restored.
- [x] 3.4 **The refusal guard's own scope was wrong, and this fixes it.**
      `hint-refusal.test.ts` keys on the right *shape* (`{ ok: false, error:
      <literal> }`, found by walking the AST) but scanned only `src/games/` — so
      the module building eleven games' `hint()` was outside it. It now also
      reads the engine's hint builders. A refusal lives wherever a `hint()` is
      built, and eleven of them are not built under `games/`.

## 4. Close

- [ ] 4.1 `npm run gate`.
- [ ] 4.2 Run the app: Solo `Unreasonable` to the deduction wall, read the
      banner; Galaxies `Unreasonable` (the game losing its bespoke sentence);
      one Easy board to confirm nothing changed there.
- [ ] 4.3 Archive under self-driven initiative, stating the wording chosen and
      why.

## Findings

**The narrow walk hid thirteen refusals across seven games**, and all thirteen
were at a tier permitting search — bricks ×2, galaxies ×3, keen ×1, lightup ×3,
solo ×1, towers ×1, undead ×2. Nothing refused on any Easy, Normal, Tricky or
Hard board at any size in any mode, which is both the guard working and the
evidence that the two constants described one situation.

**Three spellings, and the third was in the engine.** Light Up used the
trial-and-error constant, Galaxies a bespoke sentence, and five games the bare
one — of which three (Keen, Solo, Towers) reached it through
`candidate-hint.ts`'s **string literal**, invisible to any grep for the
constant's name and to `hint-refusal.test.ts`, which scanned only `src/games/`.
That module turned out to hold literal copies of three of the seven refusal
constants while its own doc comment described them as "shared so a wording tweak
lands in one place instead of drifting". It was one place; it was not the same
one place as everybody else's.

**The help page was already correct.** `help/features.md` teaches the refusal as
*"Deduction has run out… which is what an Unreasonable puzzle is for. Save your
position, try something"* — the collapsed wording's exact content. The
divergence was never between the docs and the code as a whole; it was five games
that had not caught up with the page the app ships.
