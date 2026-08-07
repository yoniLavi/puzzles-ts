# Tasks — audit-input-mode-parity

## 1. Build the instrument, and check it first (D2)

- [ ] 1.1 Derive per-game input coverage **mechanically through the registry**,
      not by grepping `index.ts`: a game's cursor handling may come from
      `border-grid.ts`, the latin input helper, or `gridCursorMove`. Verify the
      derivation on two games known to use a shared helper and two known not to.
- [ ] 1.2 Give the sweep a **live-target count** and fail when it is zero for a
      game. The existing touch guard's near-miss is the reason: an early cut
      swept Untangle, hit nothing, and would have reported health.
- [ ] 1.3 Confirm the derivation's totals against the registry, not the catalog —
      `touch-input.test.ts` once guarded itself with the catalog's length while
      iterating the registry, so an empty registry would have passed.

## 2. Sweep 57 games × 3 modes

- [ ] 2.1 **Mouse**: baseline. Every game's documented interaction, exercised.
- [ ] 2.2 **Touch**: press (already guarded), and then what is not — drag
      sequences, long-press-as-`RIGHT_BUTTON` (§3.8c), two-finger tap, and any
      game whose gesture needs a pause mid-press.
- [ ] 2.3 **Keyboard**: can each game be played to completion with no pointer?
      Include the §3.8a keypad trap — a binding testing `MOD_NUM_KEYPAD | digit`
      can never fire here, so check for bare-digit fallbacks wherever the keypad
      is the only route to an input.
- [ ] 2.4 Record every cell in `audit.md` with verdict OK / BROKEN / EXEMPT (D1),
      and for EXEMPT, the reason — which then has to go in the spec, not just the
      table.
- [ ] 2.5 Browser pass (Chrome, `playwright-cli`) on a sample chosen for
      *gesture variety*, not alphabetically: at least one drag game, one
      accreting-drag game, one keypad-digit game, one game with a lock mode, and
      Untangle (arbitrary hit targets).

## 3. Extend the guards

- [ ] 3.1 Gesture-level touch equivalence for every registered game that handles
      drags: press → drag → release from a finger does what the same sequence
      does from a mouse.
- [ ] 3.2 A long-press case: a press delivered as `RIGHT_BUTTON` by
      `detectSecondaryButton` does not break a game whose gesture is a drag.
- [ ] 3.3 Keyboard reachability: every game either handles cursor input or is on
      an explicit exemption list with its reason. The list is the point — it makes
      "no keyboard" a decision rather than an oversight.
- [ ] 3.4 Prove each new guard fails: break one game deliberately per guard,
      watch it go red, revert. A guard that has never failed may not work.

## 4. Fix and file (D4)

- [ ] 4.1 Fix inline: local fixes with no product decision in them.
- [ ] 4.2 File separately: anything needing an interaction designed. Each gets a
      scaffolded change with the finding quoted, not a TODO.
- [ ] 4.3 **Force the Loopy decision** (D5): EXEMPT with the reason written into
      the `loopy` spec and its help page, or BROKEN with a change filed. Not
      undecided.
- [ ] 4.4 Every fix must be shown not to change what the *other* modes do.

## 5. Specs, docs and close-out

- [ ] 5.1 `ts-engine`: MODIFIED "Touch equivalence is guarded for every registered
      game" → gesture-level; ADDED keyboard reachability.
- [ ] 5.2 Per-game specs: any game whose requirement says "mouse only" is either
      corrected or has its exemption reason written in.
- [ ] 5.3 `docs/games/input.md § "The on-screen keypad": fold whatever the sweep
      teaches back into the traps list — it is a live wiki, and this change is
      exactly the kind of thing that should update it.
- [ ] 5.4 Help pages: where a game's controls differ by mode, `help/games/<id>.md`
      says so. `help/features.md` already documents the touch affordances.
- [ ] 5.5 `openspec validate audit-input-mode-parity --strict`.
- [ ] 5.6 Owner acceptance before archiving.
