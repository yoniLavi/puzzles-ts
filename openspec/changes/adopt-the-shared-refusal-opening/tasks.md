# adopt-the-shared-refusal-opening — tasks

## 1. Adopt

- [ ] 1.1 Replace the hand-written opening with `commonHintRefusal(<completed>,
      <mistakeCount>)` in the fifteen: dominosa, boats, palisade, range,
      singles, filling, pattern, galaxies, lightup, subsets, undead, sticks,
      slant, spokes, unruly.
- [ ] 1.2 Drop the now-unused `ALREADY_SOLVED` / `FIX_MISTAKES_FIRST` imports
      where nothing else in the file uses them; keep them where a game emits one
      of the two on some other path (check, do not assume — `tsc` will catch an
      unused import but not a *kept* one that is now the only copy of something).
- [ ] 1.3 **Verify by shape, not by a green suite** (`AGENTS.md` § "Verify a bulk
      edit by shape"). Assert every changed line in the whole diff is one of:
      the two-line call replacing the six-line pair, an import line shrinking, or
      a comment. Then read the exceptions. A fifteen-file sweep is exactly the
      shape that hides a regression behind a green run.

## 2. Record the declines

- [ ] 2.1 Bricks and Clusters keep their opening because their second refusal is
      `CONTRADICTION_UNLOCALIZED` — their boards can be inconsistent with no
      entry provably wrong, so `FIX_MISTAKES_FIRST` would promise a highlight
      that never comes. Write the reason **at each site**, not only in this
      change, since the next reader meets the code first.
- [ ] 2.2 **Do not widen the helper to take the second message.** A parameter
      added so two games can pass a different constant turns a convention into a
      configuration language — the thing `AGENTS.md` § "Convention over
      configuration" says an override is *instead* of. They write the explicit
      form and say why; that is what a first-class override is.
- [ ] 2.3 Flood, Fifteen and Sixteen have no mistakes arm and no `completed`
      field; their opening is already one line. Note it, change nothing.

## 3. Make it stick

- [ ] 3.1 A guard that the adopted set does not silently shrink: derive the
      games that emit both `ALREADY_SOLVED` and `FIX_MISTAKES_FIRST` from source
      and require them to reach both through `commonHintRefusal`, with the two
      declines as a **ledger asserted equal to the derivation** — the
      `NO_KEYBOARD` shape (`docs/games/testing.md` § "How a cross-game guard
      finds its population"), never a skip list.
- [ ] 3.2 **Prove it fails**: hand-write one adopted game's opening back and
      watch it go red. Restore.
- [ ] 3.3 `docs/games/hints.md` § "Refusal wording comes from one module" gains
      the opening rule — *the pair is `commonHintRefusal`, and the two things a
      game may still answer for itself are which second refusal it owes and
      whether it owes one at all*.

## 4. Close

- [ ] 4.1 `npm run gate`.
- [ ] 4.2 Archive under self-driven initiative. No owner acceptance: no player
      sees a different string on any board.

## Findings

_(none yet — not started)_
