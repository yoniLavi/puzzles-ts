# refuse-honestly-at-every-tier — tasks

## 1. Widen the instrument first

- [ ] 1.1 `hint-resume.test.ts`'s `solveByHints` walk iterates **every leaf
      preset**, not `firstLeaf`. Keep the existing seeds per preset.
- [ ] 1.2 Tier the cost (`testing/slow.ts`): the full sweep measured ~116 s over
      209 preset cases. The per-commit slice samples; `PUZZLES_SLOW_TESTS` runs
      the matrix. State in the doc comment what the gate slice still covers —
      `slow.ts`'s own rule is that deferring the *only* case for a configuration
      is what must never happen, and preset coverage is exactly such a
      configuration axis, so the slice must keep at least one preset per declared
      tier rather than falling back to the first leaf.
- [ ] 1.3 Carry the vacuity count: preset cases walked, asserted above a floor
      below today's 209.
- [ ] 1.4 **Re-run with more seeds before task 2 collapses anything.** The
      collapse rests on "a sound board only runs out of deduction where the tier
      permits search", measured at one seed per preset. Raise it (≥8) in the slow
      tier and confirm zero refusals outside a search-permitting tier. If one
      turns up, this change stops and becomes a defect report on that game
      instead — the finding, not the collapse, is the deliverable.

## 2. Collapse the wording

- [ ] 2.1 Confirm from the widened run that the three spellings cover one
      situation, then reduce `hint-refusal.ts` to a single constant for it.
      Delete the loser rather than aliasing it, so no call site can keep the old
      voice.
- [ ] 2.2 Decide the wording. Galaxies' is the strongest candidate because it is
      the only one that tells the player what to *do* ("save a checkpoint, try
      one, and undo if it breaks") — but it is also the longest, and a refusal is
      read in a banner. Write the chosen sentence, say why in the change, and
      **read it in the app** before calling it done.
- [ ] 2.3 Repoint the call sites: `bricks`, `galaxies`, `lightup`, `undead`
      directly; `keen`, `solo`, `towers` and the rest of the candidate family
      through `candidate-hint.ts`.
- [ ] 2.4 **`candidate-hint.ts:139` imports the constant** instead of spelling
      out its value. Then grep the tree for the *value* of every refusal constant,
      not only their names — that is the sweep that found this one, and it should
      be run to exhaustion rather than at the single site already known
      (`AGENTS.md` § "a grep for a constant's *name* is blind to a copy that
      spells out its *value*").
- [ ] 2.5 Update `hint-refusal.ts`'s header — it currently justifies the two
      constants as two situations — and `hint-refusal.test.ts`'s allowed list.
- [ ] 2.6 Check `help/features.md` § Hints still describes the refusals the app
      actually emits. A help page that teaches a message the code no longer sends
      is the same defect one layer out.

## 3. Make the guard hold the finding

- [ ] 3.1 The widened walk asserts, on every refusal it meets: the message is the
      one constant, **and** the preset's tier permits search. Derive "permits
      search" from what the game already declares — the tier's name being
      `Unreasonable` is the collection's own promise about search (`AGENTS.md`
      § "Check / Tactic / Search"), reachable through `difficultyTiers` and the
      contract. **Add no roster.**
- [ ] 3.2 A game with no difficulty contract at all (a non-tiered hinting game)
      must not be able to refuse this way — assert that too, rather than skipping
      it, or the guard goes quiet on exactly the games with no tier to blame.
- [ ] 3.3 **Prove it fails.** Point one game back at the deleted bare message and
      watch it go red; point one deduction-complete preset's hint at an early
      `return { ok: false }` and watch the tier check go red. Restore both.

## 4. Close

- [ ] 4.1 `npm run gate`.
- [ ] 4.2 Run the app: deal Solo `Unreasonable`, play to the deduction wall, ask
      for a hint, read the banner. Do the same on Galaxies `Unreasonable` (the
      game losing its bespoke sentence) and on one Easy board to confirm nothing
      changed there.
- [ ] 4.3 Archive under self-driven initiative; state in the archive what wording
      was chosen and why, since that is the part a later reader will want.

## Findings

_(none yet — not started)_
