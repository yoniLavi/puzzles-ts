# Stop gating tests on the clock

## Why

A green commit was rejected because two Sixteen hint tests exceeded their 120s
timeout while the box sat at **load ~32 on 8 cores**. Both pass in isolation:
the work was correct, only slow. The existing `repo-layout` determinism
requirement already forbids exactly this — *"a test SHALL NOT fail as a function
of … CPU contention"* — yet the suite carried **39 per-test timeouts** whose sole
purpose was to guess how much contention to absorb.

Every one of them said so in its own comment ("absorbs scheduling jitter under
full-suite CPU contention", "keeps a correct-but-slow search from flaking"), and
each had been guessed separately (30s / 60s / 120s / 300s / 600s) and bumped as
the suite grew — Sixteen's went 30 → 60 → 120 and still lost. The playbook's
stated reason for keeping them per-test (*"the ~1400 fast tests keep the tight 5s
default, preserving their regression sensitivity"*) had already been overtaken:
`vitest.config.ts` set a 60s **global**, so no test had run on the 5s default in
a long time.

Owner directive (2026-07-17): *"I would prefer that an otherwise good commit not
fail just because a lot of time elapsed, especially as this box is intentionally
loaded most of the time, and we shouldn't be just waiting for it to quiet down."*

The existing requirement's *"not papered over with a blanket timeout increase"*
clause reads against that, so the spec is corrected here rather than quietly
contradicted.

## What Changes

- **One generous ceiling, no per-test timeouts.** All 39 per-test timeouts are
  removed in favour of a single 600s `testTimeout`/`hookTimeout` in
  `vitest.config.ts`. Every affected test already asserts its real guarantee
  deterministically (`hintCalls === 1`, `fallbackEngaged`, a solved board) — the
  clock was a tripwire under the guarantee, never the guarantee.
- **The spec is amended, not bent.** `repo-layout`'s determinism requirement
  keeps its teeth (seed-determinism, finite generator caps, no asserting elapsed
  time, load-only failures root-caused) but says plainly that a timeout is a
  runaway backstop rather than a gate, and that removing a clock gate is the
  *correct* fix when the diagnosis is contention on terminating work.
- **`gate.sh` drops its adaptive load probe** and always runs `vitest` and
  `vite build` concurrently. The probe existed only because oversubscription
  starved tests past their timeouts; with nothing clock-gated, contention makes a
  test slower, never failed. On a permanently-busy box it read "busy" nearly
  always and put the build on the critical path for a danger that no longer
  exists.
- **The playbook's §5.2 is rewritten** to match (it currently prescribes the
  per-test timeouts being removed).

## Impact

- Affected specs: **`repo-layout`** (MODIFIED: "The test suite is deterministic
  under parallel load").
- Affected code: `vitest.config.ts`, `scripts/gate.sh`, 19 test files (timeout
  removal + stale comments), `docs/porting/game-port-playbook.md` §5.2,
  `docs/porting/hint-authoring.md`.
- Risk: a timeout no longer acts as an incidental perf canary. That signal was
  never trustworthy under load anyway — the spec already required efficiency to
  be asserted by a deterministic proxy — and a genuine non-terminating loop is
  bounded where it can actually be caught (`engine/retry-limit.ts`,
  `engine/step-budget.ts`), since a `setTimeout` cannot interrupt this repo's
  synchronous tests at all.
