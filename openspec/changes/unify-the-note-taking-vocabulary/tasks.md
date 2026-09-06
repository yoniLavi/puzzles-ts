# unify-the-note-taking-vocabulary — tasks

Scaffolded 2026-09-06 by `audit-declared-versus-derived-capabilities`, which
measured the population but did not do the rename.

## 0. Decide whether to do it at all

- [ ] 0.1 **Read the counter-argument in the proposal first.** This is a
      cleanliness refactor, not a defect fix: no shared engine code reads the
      notes array, and the follow-on extraction it looks like it would unblock
      is already declined for an unrelated reason. The owner's bar
      ("noticeably cleaner" is sufficient) says yes; the "N games sharing a
      defect means the layer below is wrong" argument does *not* apply here, and
      claiming it would be overselling.
- [ ] 0.2 If it goes ahead, say in the change what the rename is worth, honestly.

## 1. Re-derive the population before trusting the table

- [ ] 1.1 **Do not start from the three spellings.** `unify-cross-game-vocabulary`
      counted spellings twice and under-measured the population both times — four
      cursor games missed, eleven restatements missed. Derive the members from
      the shape (a `State` holding a typed array of per-cell candidate bits),
      the way `note-taking-cell.test.ts` derives its eleven from the `Ui`.
- [ ] 1.2 Confirm the count against `note-taking-cell.test.ts`'s enrolled set and
      `mark-all.test.ts`'s `canMarkAll` set, and explain any game in one and not
      the other before renaming anything.

## 2. The rename

- [ ] 2.1 One noun across the population. Element type and arity stay per-game —
      Abcd's candidate cube is a real difference and must not be flattened.
- [ ] 2.2 **Verify by shape, not by a green suite** (AGENTS.md): assert every
      changed line in the diff is the one intended kind of change, then read the
      exceptions. A rename sweep is the exact case where tsc is not a net.
- [ ] 2.3 Collapse `mark-all.test.ts`'s ten `Row`s to a derived population, which
      is the payoff and the thing to check actually lands.

## 3. Record it

- [ ] 3.1 `ts-engine` requirement, alongside the existing cursor and completion
      vocabulary ones.
- [ ] 3.2 `docs/games/mechanics.md` — the noun, where a game's notes live.
