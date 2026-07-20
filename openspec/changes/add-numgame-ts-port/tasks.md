# Tasks — add-numgame-ts-port

**Status: speculative / not scheduled.** This is a build-from-scratch, not a
port. Do the design decisions (§0) *before* committing to implementation — the
answer to "should this game exist at all" may end the change here.

## 0. Decide whether to build it (owner gate, before any code)

- [ ] 0.1 Confirm with the owner that a mental-arithmetic puzzle belongs in a
      logic-puzzle collection at all. If no, archive this change as
      "considered, declined" and stop.
- [ ] 0.2 Decide the game's exact rules: pure Countdown (`+ − × ÷`, no
      fractional intermediate results, use each source at most once) or a
      variant (Flippo etc.). Record the choice; it drives everything below.
- [ ] 0.3 Decide the difficulty model — a simple "number of operations / uses a
      non-obvious step" heuristic vs. taking on upstream's unsolved path-count
      analysis. Recommend the simple one for v1; record why.

## 1. Port the solver (the one existing asset)

- [ ] 1.1 Transcribe `numgame.c`'s breadth-first exhaustive solver into
      `src/native/games/numgame/solver.ts`: from a multiset of numbers, produce
      every reachable value and the count of distinct ways to make each.
- [ ] 1.2 Differential-check the solver's *arithmetic* against the C utility:
      for a set of number sets, the reachable-value map matches
      (`puzzles/auxiliary/numgame-trace.c` if the C is still present; otherwise
      a fixed hand-computed fixture, since numgame.c is slated for deletion).
- [ ] 1.3 Port the `tree234`-backed dedup idiomatically (a `Set`/`Map` keyed by
      value — the ordering is a pure lookup, per the playbook's leaf rule). Do
      NOT transcribe tree234.

## 2. Invent the game (no upstream reference)

- [ ] 2.1 Params: number count, source-number range, target range, difficulty.
      Encode/decode, validate.
- [ ] 2.2 Generator over the solver: pick sources + a target that is reachable,
      uniquely-ish, and at the requested difficulty; reject too-easy/too-many-
      solution targets.
- [ ] 2.3 State + move model: the player builds an expression from source tiles
      and operators; a move applies one operation combining two available
      numbers into a new one (or an undo). Win when a built number equals the
      target.
- [ ] 2.4 `newUi`, input handling (tile selection + operator), and a text
      format if sensible.

## 3. Render + present (no upstream reference)

- [ ] 3.1 Design the board: source tiles, the running set of derived numbers,
      operator affordances, the target, and progress feedback. Tier-2.5 render
      tests.
- [ ] 3.2 Solve button (reveal one exact solution from the solver) and a hint
      that narrates one useful combining step.

## 4. Tests

- [ ] 4.1 Tier-1 solver/generator/codec tests; tier-2.5 render scenarios.
- [ ] 4.2 The solver-arithmetic differential from §1.2.

## 5. Registration and stage 1 close-out

- [ ] 5.1 Register in `ts-ported-ids.ts` + `games/index.ts`.
- [ ] 5.2 Add a catalog entry + the two icon PNGs (numgame was never
      catalogued, so both are new — see `puzzle-icons` spec).
- [ ] 5.3 Full gate green; `openspec validate add-numgame-ts-port --strict`.
- [ ] 5.4 Dev-verify in the browser.

## 6. Stage 2 — on owner acceptance only

- [ ] 6.1 Delete `puzzles/unfinished/numgame.c` and its `unfinished/CMakeLists`
      entry (it is a standalone utility, not a `puzzle()` — confirm how it is
      built and remove that).
- [ ] 6.2 Archive, then commit game + archive together.
