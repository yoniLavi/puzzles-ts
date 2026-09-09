# state-the-gate-steps-once

**Readiness: ready.** Every figure below was read off the tree on 2026-09-09.

## Why

**The gate's step list is transcribed in eight places, no two of them agree, and
all eight name a compiler the gate stopped running on 2026-08-05.**

> *Corrected during task 1.1, which exists to treat a proposal's own table as the
> prose census it is.* This said **five** when it was written; verifying it found
> three more — `.husky/pre-commit`, the `build-pipeline` spec's Purpose, and the
> gate requirement's own `SHALL`, which reads "all six checks" and names them
> where the gate now runs eleven. The three the first pass missed are the two
> normative ones and a shell comment, which is to say: the ones nobody thinks of
> as documentation. See tasks Finding 1.

`scripts/gate.sh` exists so that `.husky/pre-commit` and `npm run gate` "cannot
drift" — the build-pipeline spec requires they mirror each other, and one script
is how that is guaranteed. The *description* of that script then got copied into
five documents, and every copy rotted on its own schedule.

What the gate actually runs, in order: `tsgo -b --noEmit`, `tsgo --noEmit -p
tsconfig.node.json`, biome, the probe anchor, spelling, the engine catalog, the
change-citation guard, the openspec version floor, `openspec validate --all
--strict`, then — after the documentation-only shortcut and the test selector —
`vitest` alongside `vite build`.

| Copy | Says | Wrong |
| --- | --- | --- |
| `scripts/gate.sh` header | `tsc -b --noEmit`, then biome, then the probe anchor | names `tsc`; the line running `tsgo` is eight lines below it |
| `.husky/pre-commit` header | tsc → biome → probe → spelling → validate | names `tsc`; omits three |
| `AGENTS.md` § "Test discipline" pt 3 | tsc → biome → probe → vitest → build | names `tsc`; **omits five checks** |
| `AGENTS.md` § "Test discipline" (the gate is not what gets trimmed) | tsc → biome → probe → spelling → validate → vitest → build | names `tsc`; omits three |
| `AGENTS.md` § "Git" | same seven | names `tsc`; omits three |
| `docs/games/README.md` § "Close out" | same seven | names `tsc`; omits three |
| `build-pipeline` spec § "Purpose" | same seven | names `tsc`; omits three — **and it is normative** |
| `build-pipeline` spec, the gate requirement | "SHALL run all **six** checks (`tsc -b --noEmit`, biome, probe, spelling, vitest, build)" | a **`SHALL` with a count in it**: the gate runs eleven |

**`tsgo` (`@typescript/native-preview`) replaced `tsc` in `a8ff83ec` on
2026-08-05** — thirty-five days ago — and appears in **no live document**, only
in two archived changes. The gate also runs it **twice**, over two tsconfig
projects, because the build-side TypeScript is a separate project that runs in
Node; no copy shows the second pass, and that pass is the one whose absence once
let a whole file go unchecked (`typecheck-the-build-side`).

**Why this is worth a change rather than five small edits.** `AGENTS.md`
§ "Method" already says it: *don't repoint a dead recipe — retire it.* Adding
the change-citation guard to five lists — the edit that surfaced this — would
leave every list still naming the wrong compiler, still missing the second
typecheck pass, and now looking freshly maintained. The failure mode is not that
a list is incomplete; it is that **a sequence with one executable definition was
given five prose definitions**, which is the same defect as a hand-maintained
status column and the same defect as a count written in prose.

**And the reader this hurts is a real one.** A session told the gate runs
`tsc -b --noEmit` and wanting to check its work by hand runs a different compiler
from the one that will judge the commit — slower, and free to disagree about what
a type error is. `npm run typecheck` is the command that does what the gate does,
and no document names it.

## What Changes

- **One prose enumeration, in `AGENTS.md` § "Git"**, correct and complete, and it
  keeps the per-step rationale that makes it worth reading (why biome is scoped
  by role, why the probe's rate is never gated, why `vite build` is in the gate).
- **The other three prose copies stop enumerating** and point at it. Each keeps
  the sentence that was actually its point — "the gate is not what gets trimmed",
  "never bypass it" — which never needed the list.
- **`scripts/gate.sh`'s header stops transcribing its own body.** It describes
  the *shape* (fast fail-fast prefix, then the two heavy branches run
  concurrently) and names no command that lives below it.
- **The runnable commands get named**: `npm run gate` for the whole thing,
  `npm run typecheck` for the two `tsgo` passes.

## What this deliberately does not do

- **It does not add a guard asserting prose matches the script.** The population
  is one enumeration after this change; a guard over one item is machinery
  guarding a thing that no longer has the shape that rots. If the list is
  re-copied, that is the moment to reconsider.
- **It does not rewrite the archive.** Two archived changes name `tsgo`
  correctly and several name `tsc`; both were true when written.

## Impact

- Affected specs: `build-pipeline` (one added requirement).
- Affected code: `scripts/gate.sh` (comment only), `AGENTS.md`,
  `docs/games/README.md`.
- Owner acceptance: not required — an internal doc-accuracy contract.
