# Proposal: Default auto-pencil OFF (note cleanup is manual now)

**Status**: Proposed (owner-requested, 2026-06-29, on the back of
`add-pencil-cleanup-on-markall`).

## Why

With `add-pencil-cleanup-on-markall`, a player can clean the obvious pencil
candidates on demand (the mark-all button's second press) or via a hint. That makes
the **auto-pencil** preference — which silently strikes a placed digit from its
row/column (and block/diagonal) notes on *every* placement — redundant and, in the
owner's playtesting, intrusive: notes vanish on their own when the player would
rather keep them until they explicitly ask for cleanup. The owner wants note removal
to be **manual only** (the mark-all button or a hint), so the automatic
placement-time strike should be **off by default**.

## What Changes

- **Flip the auto-pencil preference default from on to off** for the four
  candidate-elimination games that have it: Towers, Keen, Unequal, Solo. `newUi` seeds
  `autoPencil: false`; the no-`Ui` hint-plan fallback defaults to off too (so a hint
  computed without a `Ui` teaches the strikes rather than folding them).
- **Keep the preference** — a player who liked the old behaviour re-enables it in the
  game menu. Only the *default* changes; the on/off mechanics, the move-time `autoElim`
  baking, and the hint's auto-pencil-aware folding are all untouched.
- Undead is unaffected (it has no auto-pencil preference).

## Impact

- **Affected specs:** `towers`, `keen`, `unequal`, `solo` (each MODIFIED — the
  auto-pencil preference now defaults off).
- **Affected code:** the `newUi` default + the `?? false` hint-plan fallback in each of
  the four games (`src/native/games/{towers,keen,unequal,solo}/{state,index}.ts`); four
  hint tests that asserted the default-on `autoElim: true` on a placement step updated to
  `false`.
- Behaviour-preserving for anyone who toggles the pref; only the out-of-the-box default
  moves.

## Out of scope

- Removing the auto-pencil preference entirely (the owner chose to keep it as an
  opt-in).
- The mark-all cleanup itself (`add-pencil-cleanup-on-markall`).
