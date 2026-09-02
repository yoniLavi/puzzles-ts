# Reference source for this change

`numgame.c` is **upstream Simon Tatham's** exhaustive breadth-first solver for
the Countdown numbers game (and Flippo-style variants), copied here verbatim
from `puzzles/unfinished/numgame.c`. It is reading material for whoever
implements this change, and nothing else:

- **It does not compile and cannot be run.** It was
  `cliprogram(numgame numgame.c)`, linked against the C engine's `common`
  library (`malloc.c`, `misc.c`, `nullfe.c`) — all deleted by
  `retire-c-engine`, along with the build system. Do not resurrect one to run
  it; see "one-way divergence" in `AGENTS.md`.
- **This is the one place that changes what the change said.** The proposal
  notes that the solver's results "can be checked against a hand-run of the C
  utility if ever wanted, independently of the Emscripten build being alive".
  That is **no longer true**: the utility needs the engine's C, not just its
  own file. A TS port of this solver is verified against its own invariants
  (every expression it emits evaluates to the number it is filed under; the
  reachable-set counts are stable), not against a running binary.
- **What it is genuinely good for** is the algorithm: the BFS over reachable
  values, the rule-set parameterization that makes Flippo a variant rather than
  a separate program, and the deduplication that keeps the search finite. That
  is the whole reason to carry it rather than leave it in git history.

Upstream lived at `puzzles/unfinished/`, for implementations "half-written,
fundamentally flawed, or in other ways unready to be shipped". Here that meant
something specific and still true: there is a solver but **no game** — no
`struct game`, no UI. This change is a build, not a port.

**License.** MIT, © Simon Tatham and the Puzzles contributors — the same notice
as the rest of the collection, preserved at
[`puzzles/LICENSE`](../../../../puzzles/LICENSE). Copying it here does not change
its terms or its authorship.

This directory travels with the change into `openspec/changes/archive/` when the
change is archived (`openspec archive` renames the whole directory), so the
reference stays next to the work that consumed it. If the change is ever
withdrawn instead — and this one is explicitly "maybe never", pending the open
"should the collection even have a mental-arithmetic puzzle?" call — delete this
with it.
