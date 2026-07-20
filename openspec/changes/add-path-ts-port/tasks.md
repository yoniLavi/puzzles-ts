# Tasks — add-path-ts-port

**Status: speculative / lowest readiness.** Numberlink has no upstream game and
no upstream solver. The solver is the crux; prove it works (§1) before building
anything on top of it. If the solver spike fails or the quality bar can't be
met, the change may end at §1.

## 0. Decide, and de-risk the crux first

- [ ] 0.1 Confirm with the owner that Numberlink belongs in the collection and
      that a from-scratch solver + generator is in scope (this is a build, not a
      port). If no, archive as "considered, declined".
- [ ] 0.2 **Solver spike, gating.** Write a Numberlink solver good enough to
      *prove uniqueness* on hand-authored boards. Until this exists, guess-free
      unique generation is impossible and the rest of the change cannot proceed.
      Decide the approach (constraint propagation vs. path-DFS with pruning);
      record it.

## 1. The solver (the blocker upstream never resolved)

- [ ] 1.1 `src/native/games/path/solver.ts`: given a board (numbered endpoints),
      determine solvability and whether the solution is unique. Uniqueness is the
      required output — a mere "a solution exists" is not enough to gate a
      generator.
- [ ] 1.2 Tier-1 tests over hand-authored boards with known unique / ambiguous /
      unsolvable status.

## 2. The generator (path.c as a starting point, not an oracle)

- [ ] 2.1 Port `path.c`'s path-growing strategy (add-a-path / extend-and-push)
      into `generator.ts` as the *candidate* producer.
- [ ] 2.2 Gate every candidate on the §1 solver for a unique solution; reject
      the rest. Tune against upstream's two named quality failures — too many
      trivial short paths vs. hopelessly-interwoven grids, and boring
      straight-line paths (e.g. a whole edge row as one path).
- [ ] 2.3 The `tree234`/other leaf usage in path.c becomes idiomatic TS (Map/Set
      lookups; no literal tree234 port).
- [ ] 2.4 Params (size, difficulty) + desc codec + validate.

## 3. The game (invented from upstream's header sketch)

- [ ] 3.1 State + data model: track connections between *adjacent* cells (so the
      player can mark path sections not yet joined to an endpoint), per
      upstream's UI notes.
- [ ] 3.2 Input: click-and-drag to link adjacent cells, tolerating a rook-move
      drag to an in-line square; win when every pair is joined by a
      non-crossing path filling the grid (per the chosen ruleset).
- [ ] 3.3 `newUi`, move model, undo.

## 4. Render + present

- [ ] 4.1 Render numbered endpoints, drawn links, and completion state; tier-2.5
      render scenarios.
- [ ] 4.2 Solve button (from the §1 solver) and a hint narrating one forced link.

## 5. Tests + registration (stage 1)

- [ ] 5.1 Tier-1 solver/generator/codec tests; tier-2.5 render scenarios.
      Assurance is behavioural (generated boards are uniquely solvable), not a
      C differential — there is no C game or solver to match.
- [ ] 5.2 Register in `ts-ported-ids.ts` + `games/index.ts`; add a catalog entry
      + two new icon PNGs (path was never catalogued).
- [ ] 5.3 Full gate green; `openspec validate add-path-ts-port --strict`;
      dev-verify in the browser.

## 6. Stage 2 — on owner acceptance only

- [ ] 6.1 Delete `puzzles/unfinished/path.c` and its build entry.
- [ ] 6.2 Archive, then commit game + archive together.
