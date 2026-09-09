# parallelize-ci-test-workers

Owner, 2026-09-09: *"Yes, let's reduce the worker count too"*, then — after a
measurement said the opposite — *"yes, let's reduce locally too; this is one
of ~4 repos I'm typically working on in parallel."*

**The second message is the whole change.** It supplied the variable the
measurement was holding at zero.

## What was measured, and why it answered the wrong question

`vitest.config.ts` capped the pool at `availableParallelism() - 2` = 6 here, on
purely CPU reasoning: *"leaving two cores free costs a quiet box very little wall
clock."* The box has 16 GB of RAM and sits ~24 GB into swap, so the natural
hypothesis was that six module graphs are the real cost and fewer workers would
be faster.

Measured over the whole suite, in both orders to control for a settling box:

| workers | run A (6 first) | run B (4 first) |
| ---: | ---: | ---: |
| 4 | 126.7 s | 117.6 s |
| **6** | **96.7 s** | **96.7 s** |

Six was identical to a tenth of a second across two runs an hour apart; four was
21–31% slower *even going first on the quieter box*. Clean result, order
confound excluded — and **irrelevant**, because it measures this suite alone and
the suite is never alone.

At four concurrent checkouts, `cores - 2` is not six workers. It is **24 worker
processes and ~10.8 GB of module graph against eight cores and 16 GB of RAM**,
which is a complete account of why the machine sits permanently in swap. A
benchmark that holds the other three tenants at zero cannot see the term that
dominates.

**The correct unit is the machine, not the suite.** Optimizing one tenant's
latency on a shared box is how the box ends up thrashing.

## What changes

- **Local: one repo's share** — `floor(cores / 4)`, so **2** here rather than 6.
  The divisor is a dated, owner-supplied environmental fact, written down as
  `CONCURRENT_REPOS` with attribution, because if it stops being true the
  division is wrong in a way no test can notice.
- **CI: the whole machine.** A dedicated runner has no developer to leave room
  for and no sibling checkout to share with.
- **The comment stops lying.** It read *"`VITEST_MAX_WORKERS` overrides it — set
  it to the core count in CI"*, describing an intention nobody carried out:
  `.github/workflows/ci.yml` passes three `VITE_*` variables and nothing else, so
  CI inherited a laptop courtesy and ran a 4-core runner with **two** workers.
  Reading `CI` directly makes the claim true by construction rather than by
  someone remembering — a rule needing external cooperation is the shape this
  repo keeps refusing.
- **The single-suite benchmark is recorded in the config**, precisely because it
  disagrees with the setting. A number that contradicts the code is exactly the
  thing a later reader will re-derive unless they are told it was already
  weighed.

## What softens the local cost

`isolate: false` means a worker's module graph is paid once and reused across
files, so the *marginal* worker is a whole extra graph rather than a slice of one
— which is the term that multiplies by four here, and the reason cutting workers
buys more than it looks like it should.

And the pre-commit hook no longer runs the whole suite:
`select-tests-in-the-precommit-hook` landed an hour earlier, so the common case
is ~47 files rather than 302. `VITEST_MAX_WORKERS=6` recovers the 96.7 s number
whenever the box actually is free.

## The pattern, third time today

Three instrument corrections in one session, each one level deeper: summed wall
duration was 5× off under load; per-file CPU was 1.7–1.8× off because the scarce
resource was memory, not cores; and this one, where the instrument was sound and
the *scenario* was wrong. `AGENTS.md` now carries the general form — ask which
resource is scarce, then check that the thing you are measuring is the thing
that actually happens.

## Impact

- Affected specs: none. `build-pipeline` already requires cost figures to be
  measured with their conditions recorded; this applies that rule, and the
  finding lives in the config comment where the next reader of the number is.
- Affected code: `vitest.config.ts` only. **No production code, no test
  changes.**
- Owner acceptance: given, twice, the second time with the reason that decided
  it.
