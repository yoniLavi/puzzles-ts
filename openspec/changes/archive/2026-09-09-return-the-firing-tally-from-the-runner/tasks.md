# return-the-firing-tally-from-the-runner — tasks

- [x] 1.1 Opt-in shape decided in [`design.md`](./design.md) D1: **a
      caller-supplied sink**, not a returned value. The proposal offered both;
      only the sink does the job, because the runner is called *inside* a game's
      solver and a returned tally would have to be threaded back out through
      seven different return shapes.
- [x] 1.2 `firings?: FiringTally` on `DeductionFixpointOptions`, reusing the map
      the runner already keeps for budget attribution:
      `opts.firings ?? (opts.budget ? new Map() : null)`. The generator path
      still allocates nothing.
- [x] 1.3 `ladder-equivalence.ts` takes the tally instead of a callback, and
      `viaRunner`'s third parameter changes type rather than disappearing —
      a game must forward *something*, and the alternative is a module-level
      hook.
- [x] 1.4 Seam deleted from all seven adopters — **eight call sites**, because
      Galaxies has three entry points and two runner calls.
- [x] 1.5 Every ladder-equivalence test and every frozen differential unchanged:
      29 files, 600 tests green. The census still names exactly the same two
      unreached rungs.
- [x] 1.6 Proved it can fail, both arms — see Findings.

## Findings

### The verb in this change's own name is wrong, and the sink is why

The proposal said *return the tally*; the implementation supplies a sink, which
it also offered. **A returned tally does not delete the seven parameters** — it
enlarges them. `runDeductionFixpoint` is called inside each game's solver and its
result is consumed there, so getting a tally out to the harness would mean
widening seven *different* return shapes (`{ ret, maxDiff }`, a bare `number`, a
status enum) with a field only a test reads. That is seven bespoke edits traded
for seven identical wrappers.

The id is a handle, not a claim, and renaming an open change strands citations —
this repo's worked example of exactly that is in
`docs/framework-rdd/README.md`. Recorded rather than repaired.

### The bulk edit, verified by shape

Per `AGENTS.md` — *verify a bulk edit by shape, not by a green suite*. Every
added line across the seven games is one of five kinds, and every removed line
one of four:

| added | n | removed | n |
| --- | --- | --- | --- |
| `firings?: FiringTally,` | 9 | `onFiring?: (id: string) => void,` | 9 |
| `techniques: ladder,` | 8 | the ten-line wrapper, complete | 8 |
| `firings,` | 8 | | |
| `type FiringTally,` (import) | 7 | | |
| 3 `viaRunner` adaptations + 3 forwarding lines + 1 doc line | 7 | same 7 | 7 |

The counts reconcile: 8 runner call sites (Galaxies has two), 9 parameter
declarations (Galaxies has three entry points), 7 imports, and `solveSub`'s
inline signature counted separately. **97 insertions, 104 deletions**, nothing
else touched.

### A live instance of the name-keyed-scan trap

Sweeping for leftover `onFiring` returned three hits in **Pattern**, a game this
change never touched — because `intersectionFiring` contains the substring
(`intersecti`+`onFiring`). Reading the three lines cost nothing; trusting the
count would have manufactured a defect. `AGENTS.md` § "A scan that keys on a
name", from the other direction than usual.

### Proving it fails — two arms, and they fail differently

The harness makes two independent promises and this change touched only one, so
both were broken deliberately:

1. **Neuter a rung** (`check-loop` returning 0 while still running). **The
   equivalence arm fires** — 8 of 9 cases red, on both "verdict or grade differs"
   and "same result but a different board". The census never reports, because the
   vacuity floor trips first.
2. **Kill the tally** (drop the runner's `firings.set`). **Only the census
   fires**, on Tracks and Rome, naming every rung as unreached — and the **50
   equivalence assertions stay green**.

The second is the arm this change is responsible for, and its isolation is the
result: the census reads the tally and nothing else stands in for it. Both
restored, both re-run green.
