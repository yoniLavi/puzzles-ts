# Tasks — add-clusters-hint

## 1. Guess-free audit (design D2 — do this first)

- [x] 1.1 Fixed-seed sweep (~500 boards/preset): count how many generated boards
      need `solverRecurse` (depth-1 lookahead) beyond `solverTry`-only. Recorded
      in `design.md` (39–56% of boards; ~1–1.8 stalls per stalling board under
      the restart discipline; shortest-chain median 2–3, max 11).
- [x] 1.2 Confirm `solverRecurse`'s propagation never needs a *second* standing
      hypothesis — confirmed by code inspection: the hypothetical runs
      `solveGame(…, 0)`, pure `solverTry`, which never hypothesises. Forcing
      chain = deduction; no reject-at-generation needed (and none possible at
      the measured rates without breaking the byte-match differential).
- [x] 1.3 Decision recorded (design D3 overturn note): narrate — as ONE rich
      step per chain firing with the what-if walk displayed statically
      (multi-leg journeys are mechanically closed: `HintStep.move` is required
      and auto-play applies every leg's move). Flagged for owner acceptance.

## 2. Recording deduction pass (design D1)

- [x] 2.1 `deduceHintPlan(grid, w, h)` in `solver.ts` — a *parallel recorder*
      (Undead §9.4 shape): the generator's `solveGame`/`clustersValidate` are
      untouched by construction. Per firing: `index`, `fill`, `refuted`, and the
      re-derived `reason` (which rule the refuted colour trips, at which cell).
      The `evidence` list was dropped (design F3): every premise tile is
      orthogonally adjacent to the target/danger tile, already in view.
- [x] 2.2 Chain firings record the hypothesis propagation trace (`ChainStep[]`)
      with per-cell early stop; the plan takes the *shortest* available chain at
      each stall (no length cap needed — max 11 measured).
- [x] 2.3 Tier-1 tests (`clusters-hint.test.ts`): each rule kind fires with a
      true, checkable premise (asserted on real firings via fixed-seed scan —
      stronger than hand-crafted grids, which the ≥2-neighbour rule makes
      fiddly); plan order is deterministic and recompute-stable (applying the
      first move leaves exactly the rest of the plan).

## 3. hint / hintKeepTrack (design D4, D6)

- [x] 3.1 `hint(state)` in `index.ts`: refuses on solved / on mistakes / on a
      contradictory-but-locally-clean position (design F2 — the plan verdict
      certifies the position, no solution comparison needed); else one step per
      firing with premise→contradiction→conclusion prose in the necessity voice.
- [x] 3.2 `hintKeepTrack`: completed iff the move paints exactly the hinted cell
      with the hinted colour; multi-cell drags are off-plan (design F6).
- [x] 3.3 Hint button appears via the hook's presence (engine-provided); covered
      by the midend walk test and dev-verification.

## 4. Generation change (only if 1.2/1.3 require it)

- [x] 4.1 Not needed: no board requires nested speculation (1.2), so generation
      is untouched and the byte-match differential stays green.

## 5. Rendering (design D5, revised by F3)

- [x] 5.1 `COL_HINT` target fill, `COL_HINT_CELL` + small forced-colour mark on
      chain what-if cells, `COL_HINT_DANGER` double ring on the endangered tile;
      packed via an `OverlaySidecar` on the draw state, stale-checked in the
      cache-miss branch, committed after draw. No forced-colour pre-placement.
      The premise-ring role was dropped (F3 — "ringed" is unambiguous).
- [x] 5.2 Clusters added to `src/native/engine/testing/hint-games.ts` (and to
      `hint-quality.test.ts`'s DEDUCTIVE set) — covered by `hint-overlay`,
      `hint-resume` and `hint-quality` cross-game guards.
- [x] 5.3 Tier-2.5 render scenarios: a direct hint frame (COL_HINT target op +
      snapshot) and a chain frame reached via `hintUntil` (what-if marks in the
      forced tile colours + danger ring ops + snapshot).

## 6. Tests + gate

- [x] 6.1 `clusters-hint.test.ts`: rule-kind properties, narration↔highlight
      agreement ("ringed" uttered iff the danger ring is displayed), refusals
      (solved / mistakes / wrong-but-locally-clean), midend walk to solved,
      recompute stability, `hintKeepTrack` verdicts.
- [x] 6.2 Full gate green (`tsc -b --noEmit` → biome → `vitest run` → `vite build`;
      4134 tests, 203 files).
- [x] 6.3 `openspec validate add-clusters-hint --strict` — valid.
- [x] 6.4 Dev-verified in the browser (2026-07-21): direct hint frame (blue
      target + narrated why), follow → next hint, Auto Hint plays a whole plan
      to solved, chain frame (`7x7#live-41` opens on a chain: what-if marks +
      danger double ring on screen), contradiction refusal on a
      wrong-but-locally-clean tile, mistakes refusal with the live red frame.
      0 console errors. One wording fix came out of the live read: the
      reachTwo-at-target "no room left around it" (false when one open
      neighbour remains) became "at most one neighbour could ever match it".
- [x] 6.5 `hint-authoring.md` §5.6b′ added: the static what-if display for a
      forcing chain with no board vocabulary, shortest-chain selection, the
      reject-at-generation price, and the one-ring-role lesson.

## 7. Close out — on owner acceptance

- [ ] 7.1 Archive `add-clusters-hint`; commit hint + archive together.
