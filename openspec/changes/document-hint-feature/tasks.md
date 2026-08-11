# Tasks — document-hint-feature

> These pages are **product**, not reference. Read the existing
> [`help/features.md`](../../../help/features.md) first and match it: seven
> sections, second person, `::icon::` glyph references, `<command-link>` for
> anything reachable from preferences, and an anchor (`{#name}`) on every
> heading because other pages link to them.

## 1. Settle the two decisions first (they change what gets written)

- [ ] 1.1 **The "checkpoint" collision** (design D2): the quick-save toast says
      *"Checkpoint saved"* while `features.md` §Checkpoints documents the
      *multi*-checkpoint history panel. Rename the toast (recommended) or
      disambiguate in the help. Owner call — it is a shipped user-visible
      string. Record the call in `design.md` either way.
- [ ] 1.2 **What the coverage guard derives its feature list from** (design D1):
      anchors alone, the game hooks, or the command map. Recommendation is the
      hooks driving an anchor check. Decide before writing the prose, because
      the anchors are the contract.

## 2. Write the hint section

- [ ] 2.1 `## Hints {#hints}` in `help/features.md`. Lead with what makes it
      *this* fork's hint: it explains **why** a move is forced, not just which
      move. Upstream's returns one move with no explanation; that difference is
      the reason the section exists.
- [ ] 2.2 The **stepper rhythm** — first press shows the step (highlight only,
      the move is still yours to make), a second press with nothing done in
      between applies that one step and stops. Any action in between re-arms the
      show. Source: `add-hint-button-stepper`, orchestrated in
      [`src/puzzle/puzzle.ts`](../../../src/puzzle/puzzle.ts).
- [ ] 2.3 **Auto-Hint** — the toolbar play/pause that rolls continuously, one
      second per step (floored by the move's own animation). It stops on
      "Solved!" and on a refusal.
- [ ] 2.4 **Refusal** — a hint asked on a board that contradicts its clues
      refuses *and lights the offending squares*, because deducing from a wrong
      position would mislead. This is the behaviour a player is most likely to
      meet without warning and least likely to interpret correctly.
- [ ] 2.5 **The colour legend, once** (design D3, and `ts-engine`'s
      "element-type colour legend"): blue is the square the hint is acting on;
      the wash is what it is reasoning *from*. Do not name colours the player
      cannot rely on across games, and do not let colour be the only cue in the
      wording.
- [ ] 2.6 State the **rule** that governs which puzzles have a hint — a
      deductive puzzle whose reasoning the game can narrate — and **name no
      games** (design D3).
- [ ] 2.7 **The other refusal: deduction running out.** A hint can also stop
      because nothing further *follows* — distinct from the mistake refusal in
      2.4, and the player has no way to tell them apart without being told.
      Say what to do instead (checkpoint, try it, undo; or Solve). Galaxies is
      the first game to phrase this refusal deliberately
      (`add-galaxies-hint`); the wording here should generalise, since any
      game with an Unreasonable tier can reach it.

## 2a. Say what "Unreasonable" promises

> Owner request, 2026-08-11, out of `add-galaxies-hint` acceptance. The rule
> the collection actually holds: **if a board requires *guessing* rather than
> *checking*, its tier is named Unreasonable** — and no other tier name may.
> Nothing player-facing says this, so the name reads as bravado rather than as
> the contract it is.

- [ ] 2a.1 A `## Difficulty {#difficulty}` section in `help/features.md`
      (there is none today) stating the contract in the player's terms: on
      every other tier, pure deduction is enough to finish; on an
      **Unreasonable** board you may reach a position where it is not, and the
      way on is to try something and be ready to take it back.
- [ ] 2a.2 Tie it to the hint: on such a board the hint will **say** it has run
      out rather than guess for you, because a guess is not a technique it
      could teach. Cross-link 2.7.
- [ ] 2a.3 Name the mechanics that make trial-and-error survivable — the
      checkpoint slot and undo — and link §Checking / §Checkpoints.
- [ ] 2a.4 **Do not name the games.** The set is derivable
      (`difficulty.tiers` per game) and hand-listing it in prose rots; the same
      rule as 2.6. If a coverage guard can assert "every tier named
      Unreasonable is described by this section", say so in design instead.

## 3. Write the checking section

- [ ] 3.1 `## Checking your work {#checking}` covering mistake highlighting
      (`findMistakes`): what it proves (this entry contradicts the unique
      solution) and what it does *not* (a missing entry is incomplete, never a
      mistake).
- [ ] 3.2 **Check & Save / Quick-save + Quick-load**, including the adaptive
      button label and — the part with a real consequence — that a mistake
      **hard-blocks** the save and leaves the previous checkpoint intact.
      Cmd/Ctrl+S too.
- [ ] 3.3 Apply the 1.1 decision so the page and the app use one word for one
      thing.
- [ ] 3.4 Cross-link: §Checkpoints ↔ §Checking, and the hint refusal ↔ mistake
      highlighting (they are the same overlay, which is worth the player
      knowing).

## 4. The guard

- [ ] 4.1 Extend `src/help-coverage.test.ts` per the 1.2 decision. Derive from
      the app, not a hand-written list (design D1).
- [ ] 4.2 **Prove it fails.** Delete a section locally, watch it go red, restore.
      A guard never shown to fail is not known to work — the finding
      `add-game-difficulty-contract` recorded when its first sampling guard
      silently did nothing.
- [ ] 4.3 Carry a **vacuity guard** ("the file was found, the pattern matched"),
      as the three existing blocks in that file already do. A check that
      silently inspects nothing reports success.
- [ ] 4.4 Do **not** write the check as a grep for a spelling. The repo has hit
      that shape six times; aim it at the resolved structure, not at one way of
      writing a reference (design D1).

## 5. Close out

- [ ] 5.1 Confirm no per-game page needs a matching edit — a game whose hint
      introduces vocabulary fixes its own page in its own change, and Sticks
      already did (`add-sticks-hint` §6.2).
- [ ] 5.2 Read the two new sections **against the running app**, clicking each
      control as the prose describes it. Every sentence about a control is a
      claim; the ones about the stepper's second press and the hard-blocked save
      are the ones most likely to be subtly wrong.
- [ ] 5.3 Full gate green (`vite build` renders the help pages, so a malformed
      `<command-link>` or a broken anchor fails there, not in vitest).
- [ ] 5.4 Owner acceptance, then archive.
