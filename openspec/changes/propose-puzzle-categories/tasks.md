# Tasks — propose-puzzle-categories

**Parked.** Nothing below starts until the four questions in `proposal.md`
§"What needs deciding" have answers, because every one of them changes what the
tasks are. The proposal is the deliverable for now.

## 0. Decide (owner)

- [ ] 0.1 One taxonomy or several independent axes?
- [ ] 0.2 Which axes, and their values.
- [ ] 0.3 Which parts are derived rather than declared.
- [ ] 0.4 Where it surfaces: a filter, a facet row, sections, or related-games
      links on the puzzle screen.

## 1. Data

- [ ] 1.1 Add the chosen field(s) to `PuzzleData`, documented as a declaration
      a mechanism consumes — with the reason, so the next reader does not
      re-litigate it against `AGENTS.md`'s manifest rule.
- [ ] 1.2 Classify all 57 games.
- [ ] 1.3 Guard it: every game classified, every declared category non-empty,
      no category of one, and a vacuity count. Prove the guard fails.
- [ ] 1.4 Derive what can be derived rather than declaring it (see 0.3), so the
      hand-written part is only the part that genuinely needs a person.

## 2. Surface

- [ ] 2.1 Fold into `catalog-search.ts`, so a category word finds its games.
- [ ] 2.2 Render per 0.4.
- [ ] 2.3 Check at 390px and at desktop, in both schemes.

## 3. Close

- [ ] 3.1 `openspec validate propose-puzzle-categories --strict`.
- [ ] 3.2 Owner acceptance — this is player-visible navigation.
