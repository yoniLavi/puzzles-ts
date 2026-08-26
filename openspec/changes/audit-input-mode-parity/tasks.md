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
- [ ] 2.3a **Two outputs this sweep owes its successor**, because
      `unify-cross-game-vocabulary` is sequenced *after* this change and would
      otherwise rebuild them: (a) which games' tests actually press an arrow key
      — that change's task 0.1, and the only thing that makes a
      behaviour-preserving rename's green suite mean anything; (b) which games
      reveal-only on the first arrow press versus reveal-and-move, with a count.
      The second is a finding of this audit, not a decision to be taken inside a
      rename.

- [ ] 2.3 **Keyboard**: can each game be played to completion with no pointer?
      For the keypad, check for bare-digit fallbacks wherever the keypad is the
      only route to an input — **not** because `MOD_NUM_KEYPAD | digit` cannot
      fire (it can, and Cube and Bricks depend on it — see the corrected §3.8a
      bullet), but because a numpad key only arrives as a digit with Num Lock on
      and a laptop may have no numpad. Convicting a keypad binding as dead would
      break working, tested code.
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

- [x] 3.5 **Emittable-key guard — built 2026-08-26**,
      `src/engine/emittable-keys.test.ts`: no game may compare a button against
      a control code `puzzleKeyMap` cannot produce, and no game may declare a
      private copy of one. Proved to fail (restoring Unruly's `button === 8`
      reds it, naming file and line).

      **It found a dead binding in fourteen of the fifty-seven games** — Ascent
      (×2), Boats, Bricks, Clusters, Filling (×2), Group, Guess, Pearl,
      Rectangles, Rome, Slant, Sticks, Subsets (×2), Undead (×2), Unruly — every
      one of which every behavioural instrument in D2 scores as OK. See D2's
      third clause for why a source scan and not a sweep.

      **The count matters more than the list**: this is a quarter of the
      collection, found in one pass by an instrument nobody had built, against a
      trap that has been written up in the playbook for months. It is the
      strongest available argument for this audit's central claim — that a
      per-game obligation without a mechanical check is live for every game
      nobody has thought about lately.

      Fixed in the same pass via new shared `isEraseKey`/`isCancelKey` in
      `engine/pointer.ts`, rather than fourteen more copies of the two codes.

      **What it does not yet cover, and should:** it scans numeric literals in
      the shape `button === <n>` plus `const NAME = <n>` declarations — the two
      shapes that have actually shipped the bug. It cannot see a code reached
      through a lookup table or `String.fromCharCode` (Sokoban's
      `DIGIT_DIRECTIONS` is the live example). Widening it is a task for this
      audit, and the vacuity assertions it already carries are the model —
      *count what you looked at*; the first cut of its key-map parser was wrong
      and those assertions are what said so.

- [ ] 3.6 The neighbouring gap the above exposes: nothing checks the **reverse**
      direction — a key `puzzleKeyMap` sends that no game consumes is harmless,
      but a key a *player* would expect (Home/End from a numpad with Num Lock
      off) reaching nothing is not. Decide whether that is in scope; it is the
      difference between "the wiring is connected" and "the input is reachable",
      which is D1's actual bar.

## 4. Fix and file (D4)

- [ ] 4.1 Fix inline: local fixes with no product decision in them.
- [ ] 4.2 File separately: anything needing an interaction designed. Each gets a
      scaffolded change with the finding quoted, not a TODO.
- [ ] 4.3 **Force the Loopy decision** (D5): EXEMPT with the reason written into
      the `loopy` spec and its help page, or BROKEN with a change filed. Not
      undecided.
- [ ] 4.4 Every fix must be shown not to change what the *other* modes do.

## 4b. One finding handed over from `audit-vestigial-contract-surface` (2026-08-21)

- [ ] 4b.1 **`Game.needsRightButton` has eighteen implementers and no reader.**
      That audit swept every optional `Game` member for implementers *and*
      consumers; this is the one that has the first and not the second. The
      midend forwards it into `PuzzleStaticAttributes` and the shell carries it
      to `Puzzle.needsRightButton`, and there the trail stops — the only site
      that ever considered branching on it, `view-interactive.ts`'s
      `handleContextMenu`, says in a comment why it doesn't ("some puzzles,
      e.g. Tracks, say they don't *need* the right button, even though they can
      *use* it"), and the secondary-action affordance upstream's
      `REQUIRE_RBUTTON` existed to gate is offered to every game
      unconditionally anyway (long-press / two-finger-tap, global settings).

      It was **not** deleted, for two reasons this audit is the right place to
      weigh. First, the proposal already asks for the control it is half of:
      *"a game cannot tell the frontend 'I have no secondary button, do not
      long-press me'"* — that is `needsRightButton`, inverted, and Slide's
      `asPrimary` fold is the per-game workaround for its absence. Second, the
      eighteen declarations are upstream knowledge with no C build left to
      re-derive them from. So: **give it a consumer or remove it and the
      eighteen declarations together** — but not leave it as surface that reads
      as a capability and is not one. Its doc comment in `game.ts` now says so
      and names this task.

## 5. Specs, docs and close-out

- [ ] 5.1 `ts-engine`: MODIFIED "Touch equivalence is guarded for every registered
      game" → gesture-level; ADDED keyboard reachability.
- [ ] 5.2 Per-game specs: any game whose requirement says "mouse only" is either
      corrected or has its exemption reason written in.
- [ ] 5.3 `docs/games/input.md`: fold whatever the sweep teaches back into the
      traps list — it is a live wiki, and this change is exactly the kind of
      thing that should update it. **Two of its four traps were already
      corrected on 2026-08-26** (§3.8a's `MOD_NUM_KEYPAD` claim was false; the
      cancel-key trap was understated at two games and is seven) — so read the
      traps as claims to *re-verify against the frontend*, not as findings to
      act on. A trap paragraph nobody has checked is exactly as reliable as a
      guard nobody has seen fail.
- [ ] 5.4 Help pages: where a game's controls differ by mode, `help/games/<id>.md`
      says so. `help/features.md` already documents the touch affordances.
- [ ] 5.5 `openspec validate audit-input-mode-parity --strict`.
- [ ] 5.6 Owner acceptance before archiving.
