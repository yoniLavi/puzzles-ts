# derive-hint-enrollment — tasks

## 1. Derive

- [x] 1.1 `HINT_GAMES` is now `registeredGameIds().sort().map(getTsGame)
      .filter(g => typeof g.hint === "function")`, replacing a hand-maintained
      thirty-game array and its thirty imports.
- [x] 1.2 Exported shape unchanged (`[id, game][]`), so none of the six
      consumers changed.

## 2. Guard the instrument, not just the games

- [x] 2.1 `REGISTERED_GAME_COUNT` exported and floored at >50 — the
      *population*, asserted before the result, because a filter can return a
      healthy-looking count from a short population.
- [x] 2.2 Enrolled set floored at 30 (the count the hand list carried on the day
      it was replaced) and asserted strictly less than the registry, since the
      collection deliberately keeps games hintless — an enrolled set equal to
      the registry would mean the filter stopped filtering.
- [x] 2.3 **Deliberately NOT asserted: "every registered game declaring `hint`
      is enrolled".** Under a derivation that is the definition, so the
      assertion would be a tautology — the exact shape AGENTS.md warns about.
      Recorded in the test file so the next reader does not "helpfully" add it.

## 3. Prove it fires

- [x] 3.1 Derivation broken to match nothing; the vacuity guard goes red. See
      Findings 2 for what the six consumers did — which is the whole reason this
      file exists.
- [x] 3.2 Derived set compared against the hand list it replaced: **30 = 30,
      nothing gained, nothing lost**, registry 57. No coverage change today, as
      the proposal predicted.

## 4. Close out

- [x] 4.1 `docs/games/testing.md` § "Enrollment duties" — the Hints bullet
      claimed a game "adds one line", contradicting the section's own opening
      ("a game enrolls by declaring, not by being remembered"). It now matches.
- [x] 4.2 `AGENTS.md` — the owner's forward-looking bar recorded in the present
      tense, with the hintless games named as a deliberate assessment corpus.
- [x] 4.3 Full gate, commit, archive.

## Findings

1. **The list was complete, and that was never the point.** Derived set and hand
   list agree exactly — thirty games, none gained, none lost. So this change adds
   no coverage today and the proposal said so up front. What it removes is a
   failure mode: a game could acquire a `hint()` and get **zero** of the six
   guards, with nothing anywhere asserting otherwise. The list being correct on
   the day it was replaced is the state in which that absence is invisible, not
   the state in which it is unnecessary.

2. **`--passWithNoTests` is what makes the vacuity guard load-bearing, and I
   nearly recorded the opposite.** With the derivation broken to match nothing,
   a bare `vitest run` *errors* on all six consumers — "No test found in suite",
   because each builds its `it()` blocks in a loop and an empty array leaves an
   empty `describe`. That looked like adequate protection already, and would have
   made the floors decorative. But the gate does not run a bare `vitest run`:
   `npm run test:run` passes `--passWithNoTests`, and under **that** flag the
   same five files report `Test Files 5 passed / Tests: no tests` and the gate
   goes green having checked no game at all. Measured under the configuration
   that actually ships, not the one that happened to be convenient — which is the
   difference between a guard and a belief about a guard.

3. **A tautology was the obvious test to write, and writing it would have been
   worse than writing nothing.** The instinct after deriving a set is to assert
   the derivation ("every game with a hint is enrolled"). Under a filter that is
   its own definition: it cannot fail, it reads as coverage, and it would sit
   there looking like the guard while the real risk — an empty result — went
   unwatched. The file says so explicitly, because the next reader's instinct
   will be the same.

4. **The engine-imports-no-game layering exemption survives and got smaller.**
   `module-layering.test.ts` exempts `testing/hint-games.ts` from "the engine
   imports no game". It used to import thirty game modules by name; it now takes
   a single side-effect import of `games/index.ts`, the same route
   `difficulty-contract.test.ts` uses. The exemption is unchanged, but what it
   exempts is one line rather than thirty.
