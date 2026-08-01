# Reference source for this change

`path.c` is **upstream Simon Tatham's** experimental Number Link grid generator,
copied here verbatim from `puzzles/unfinished/path.c`. It is reading material
for whoever implements this change, and nothing else:

- **It does not compile and cannot be run.** It `#include`s `puzzles.h` and links
  against the C engine's `common` library (`malloc.c`, `misc.c`, `random.c`,
  `nullfe.c`), all of which `retire-c-engine` deleted. There is no build system
  under `puzzles/` any more. Do not try to resurrect one to run it — see
  "one-way divergence" in `AGENTS.md`.
- **It is not an oracle.** Even when it built, it was `cliprogram(path path.c
  COMPILE_DEFINITIONS TEST_GEN)` — a standalone generator with **no solver**,
  whose own header says the grids it produces "are not of suitable quality to be
  used directly as puzzles". This change's assurance is behavioural from the
  start; there is nothing here to match.
- **What it is genuinely good for** is the generator strategy in its long header
  comment (grow paths, push neighbours into new shapes, fill the grid) and the
  honest account of where that strategy falls down. That is why it was worth
  carrying rather than leaving in git history.

Upstream lived at `puzzles/unfinished/`, a directory for implementations that
were "half-written, fundamentally flawed, or in other ways unready to be shipped
as part of the polished Puzzles collection" — accurate, and the reason this is a
greenfield build rather than a port.

**Licence.** MIT, © Simon Tatham and the Puzzles contributors — the same notice
as the rest of the collection, preserved at
[`puzzles/LICENCE`](../../../../puzzles/LICENCE). Copying it here does not change
its terms or its authorship.

This directory travels with the change into `openspec/changes/archive/` when the
change is archived (`openspec archive` renames the whole directory), so the
reference stays next to the work that consumed it. If the change is ever
withdrawn instead, delete this with it.
