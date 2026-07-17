## Context

Orphaned vitest fork workers (PPID 1, ~78% CPU, running for hours) are the root
cause of a long-standing dev-box slowdown. The full mechanism is in the memory
note `project_vitest_worker_orphaning` and the proposal's Why. The essential
constraint: **a synchronous JS loop cannot be interrupted** — not by
`testTimeout` (a timer on the blocked loop) and not by the pool's IPC shutdown
(also event-loop-driven). So there is no in-worker hook that reliably kills a
sync-blocked worker on parent death; prevention must stop the runaway loop, and
reaping must clean up whatever still leaks.

## Goals / Non-Goals

- Goals: (1) never let orphans accumulate — reap them cheaply and safely before
  each run; (2) stop generators from being able to spin forever, so the reaper
  has less to do and a bad seed fails fast.
- Non-Goals: making synchronous tests interruptible (not possible without an
  invasive async/yield rewrite the tests don't want); changing vitest's pool
  (`forks` + `isolate:false` stays — it already reduces worker churn).

## Decisions

- **D1 — Reaper keys on PPID==1 + repo-specific worker path.** A live run's
  workers are children of their vitest runner (PPID ≠ 1); only orphans reparent
  to init. Matching `vitest/dist/workers/forks.js` under this repo's
  `node_modules` path scopes it to our leak and never to another project or
  another user's processes. The reaper is **fail-safe**: any error (no `ps`,
  parse miss) is swallowed and the run proceeds — it must never block a commit.
  Kill by exact PID (never `pkill`/`killall`, per project rule).

- **D2 — Run the reaper *before* runs, not after.** A `post`-hook does not run
  when the process is Ctrl-C'd (the interrupt that creates the orphan also kills
  the hook). A `pre`-hook reliably cleans up the *previous* run's leak at the
  start of the next. Wired in two places sharing one script: `scripts/gate.sh`
  (top) and `pretest`/`pretest:run` npm hooks (covers `npm test` watch and
  `npm run test:run`).

- **D3 — Finite caps only on generate-until-success loops.** Fixpoint solvers
  (`repeat until no progress`) terminate by monotone progress and are left
  alone. The targets are unbounded retry loops that regenerate on failure
  (`net`'s `beginGeneration: for(;;)`, and any peer without a guard). ~~Follow
  the in-repo precedent exactly: a `MAX_REGENERATE`-style counter that `throw`s
  on exhaustion.~~ The cap must be high enough never to fire on a valid seed and
  low enough to fail in seconds, not hours.

- **D3a — supersedes D3's "hand-rolled counter" clause** (owner directive
  2026-07-16: treat this design as a sketch, go deeper). Copying the inline
  `MAX_REGENERATE` precedent to ~18 new sites would have left 23 near-identical
  counter+throw+comment blocks. Instead a shared `engine/retry-limit.ts` exports
  `retryLimit(label, max?)` → a per-attempt guard, plus a typed
  `RetryLimitExceeded`; all 18 new sites *and* the 7 pre-existing hand-rolled
  caps (dominosa, keen, singles, solo, towers, unequal, tracks) now use it, so
  the pattern is uniform repo-wide and the "why bound at all" reasoning lives in
  one docblock. Per `AGENTS.md`, "noticeably cleaner" is sufficient justification.

  *Why a guard, not a `for…of` iterator.* An iterator (`for (const _ of
  retries(…))`) puts the bound in the loop header and was the first cut — but
  `for…of` is a loop TypeScript believes can *complete*, so every generator that
  returns from inside its retry loop needed a trailing unreachable `throw` to
  satisfy control-flow analysis. `for (;;)`/`while (true)` are understood never
  to complete, and a guard also drops into `do…while` and rejection-sampling
  loops without reshaping control flow that is matched byte-for-byte against C.
  The type checker chose the API.

- **D3b — exhaustion may recover, not only throw.** A cap converts a hang into a
  *crash*: right for a porting divergence, wrong for a rare-but-legal seed a
  player might hit. Where the algorithm already has a recovery path, take it and
  let an outer `retryLimit` bound the recovery. `net`'s loop-fixing is the case
  in point (D4).

- **D4 — `net`'s loop-fix stall: fix the root cause, don't cap it.** The audit
  flagged `net/generator.ts:138` as possibly-never-terminating. Checking the
  C (`net.c:1485`, via the sibling clone — Net's own C is deleted) showed the
  `>` is **faithful**: upstream has the same latent hang. But upstream's comment
  states the intent as *"increasing rather than reducing"*, while the predicate
  tests only *increasing* — so a plateau, which is a failure to reduce, silently
  re-loops instead of reaching the `goto shuffle` recovery that already exists.
  The count sequence is non-increasing, so it converges; if it converges above
  zero the loop spins until a random rotation happens to break the tie, and a
  grid where every rotation yields the same count never escapes at all.

  So: detect the stall the predicate misses and take upstream's own escape hatch.
  Each round now either strictly reduces the count (≤ `wh` times) or burns one of
  `MAX_STALLED_ROUNDS`, giving a real bound (`wh * MAX_STALLED_ROUNDS`) in place
  of a probabilistic argument — and a pathological seed yields a slower puzzle,
  not a failed one. **Measured before choosing the constant**: over 720 boards
  (3x3…13x11, wrapping and not, 60 seeds each) the longest plateau was **3**
  rounds and the escape fired **zero** times, so 100 leaves ~33x headroom and
  every seed C converges on takes the identical path. The differential's
  byte-match confirms it.

## Audit result (task 2.1)

Every top-level unbounded `for(;;)`/`while(true)` under `src/native/games/*/
generator.ts` and `engine/{laydomino,divvy,latin}.ts` was classified. **18 sites
capped** (13 `for(;;)`/`while(true)` + 5 `do/while` retries of the same defect
class, found adjacent and fixed here rather than left as a known-partial fix):

| capped | site |
|---|---|
| bridges | `generator.ts:32` full-restart on rejection |
| filling | `generator.ts:114` `retry:` reshuffle/re-partition |
| lightup | `generator.ts:284` blackpc-ramp rounds; `:116` black-cell rejection sampling |
| magnets | `generator.ts:100` re-lay dominoes; `:208` regenerate until difficulty accepted |
| mines | `generator.ts:328` `do/while(!success)`; `:372` solve/perturb rounds |
| net | `generator.ts:59` `beginGeneration:`; `:128` `reshuffle:`; `:138` loop-fixing |
| signpost | `generator.ts:169` regenerate; `:175` fill retry; `:180` distinct head/tail draw |
| tents | `generator.ts:44` place-tents regenerate |
| tracks | `generator.ts:87` `layPath` — uncapped *inside the precedent file* |
| unruly | `generator.ts:74` regenerate; `:78` `while(!fillGame(...))` |
| untangle | `generator.ts:185` re-roll-until-tangled |

Already capped: dominosa, keen, singles, solo, towers, unequal, tracks:184,
divvy. **Exempt** (terminating argument named, so a cap would only add a false
failure mode): the fixpoint solvers, plus `net:263` (wall-follower orbit on a
finite state space with an invertible transition — a cycle, never a rho),
`latin:250` (binary counter overflows in ≤2ⁿ), `latin:681/695/740`
(Hopcroft–Karp: each phase augments ≥1, bounded by `min(nl,nr)`), `keen:203`,
`separate:58`, `signpost:49`, `solo:439`, `undead:152`, `unequal:166`,
`untangle:112`, `bridges:65`, `laydomino:55/112`, `divvy:96/176`.

Three findings worth keeping:

- **`net:138` could genuinely never terminate** — root-caused and fixed rather
  than capped; see D4.
- **Retrofitting a bound onto byte-matched code adds state, never perturbs it.**
  `mines`' `ntries` gates `allowBigPerturbs` and its `prevret` is a `const -2`
  whose give-up guard is dead *by faithful transcription* (design D6, trap 4).
  Both guards there keep their own counts and only read those variables; nudging
  either would silently change generated boards.
- **The bound is not merely theoretical.** A probe with `net` params of
  `2xN wrapping + unique` — which `validateParams` rejects because upstream
  *proves* no such puzzle has a unique solution — hit `RetryLimitExceeded` in
  seconds. Before this change that same call spun a core indefinitely.

## Risks / Trade-offs

- Reaper kills a legitimate process → mitigated by the PPID==1 + repo-path
  double key (a live worker is never PPID 1) and kill-by-exact-PID.
- A cap set too low fails a valid generation → mitigated by matching the
  existing generators' generous bounds and by the differential/behavioural tests
  catching a regression.
- Residual: a worker can still be orphaned *during* a run that is then killed;
  the pre-run reaper catches it next time, so it never accumulates. This is the
  accepted floor, since sync loops are fundamentally uninterruptible.

## Migration Plan

Ship D1 (reaper) first — it stops the bleeding immediately and is pure tooling.
Then D2 wiring, then D3 (audit + caps) as a bounded hardening pass. Each is
independently landable.

## Open Questions

- Should the reaper also warn (print the reaped PIDs/ages) so a developer learns
  they left orphans, or stay silent? Lean: print a one-line notice when it
  reaps something, silent when there is nothing to do.
