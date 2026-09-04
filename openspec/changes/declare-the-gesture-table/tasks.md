# declare-the-gesture-table — tasks

Scaffolded 2026-09-04. **Not ready to implement — task 0 first.**

## 0. Explore before proposing anything concrete

- [ ] 0.1 `/opsx:explore`.
- [ ] 0.2 **Classify the corpus by reading `interpretMove`, all of it.** Key on
      the *shape* of the interaction, never on a name — the repo's most repeated
      instrument failure. 57 function bodies is a readable population and
      AGENTS.md says to read a readable population rather than heuristic over it.
- [ ] 0.3 Reuse `audit-input-mode-parity`'s `audit.md` as a starting point, but
      **do not read it as if it answered this question** — it measured mode
      parity, not gesture shape, and a measurement reused for a question it was
      not taken for is how this repo has been wrong before.
- [ ] 0.4 **Try Sixteen's drag-to-slide early.** `migration.md` names it as the
      falsifier for this whole direction. A design that cannot express it should
      end the change, not be worked around.
- [ ] 0.5 Rewrite this task list from what the exploration finds.

## Standing constraints

- [ ] C1 Input is player-visible: owner acceptance, and run the app on touch as
      well as pointer. "It type-checks" is not evidence a gesture feels right.
- [ ] C2 The four frontend traps (`docs/games/input.md`) must be handled by the
      library, and each must be *shown* to fail without it — a trap handled
      invisibly is a trap waiting to come back.
- [ ] C3 A game with genuinely bespoke interaction keeps raw `interpretMove` as
      a first-class hatch, with its obligation stated.
- [ ] C4 Escape is a live key app-wide (`add-slide-keyboard-control` found three
      games' cancel arms unreachable); a derived binding layer must not
      re-break it.

## Findings

_(none yet — not started)_
