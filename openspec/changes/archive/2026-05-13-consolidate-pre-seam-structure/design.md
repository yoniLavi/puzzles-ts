# Design

## Context

Three small structural debts blocking the next seam. Each is too small
to warrant its own proposal; bundled they share one review pass.

The current state is documented in `PLAN.md` (being deleted in this
change), `openspec/specs/repo-layout/spec.md`, and
`openspec/specs/build-pipeline/spec.md`. The bundling rationale is that
all three changes target the same audience (next-seam author, human or
AI) and the same risk window (set conventions before they're
multiplied across 6+ leaf modules).

## Goals / Non-Goals

### Goals

- `src/native/` has a per-module shape that absorbs tree234, dsf,
  combi, sort, findloop, matching, divvy without churn.
- One source-of-truth for agent docs at `AGENTS.md`, with `CLAUDE.md`
  pointing at it.
- The `build-pipeline` spec's claim that harnesses build into
  `/build/native/` is true in practice, not just on paper.

### Non-Goals

- Splitting `src/utils/`, restructuring `src/css/`, or any other
  re-org of the existing UI tree. The previous reorganization
  (`reorganize-src-layout`) is recent and fine.
- Building a "build:native" npm wrapper. Harnesses are run on demand,
  not as part of `npm run build:assets`.
- Codifying a documentation lifecycle (when to update AGENTS.md, etc.).
  The single-source convention is enough.
- Renaming `AGENTS.md` or moving it. The project-root file stays
  `AGENTS.md` per common convention; the openspec one moves out of the
  way (becomes `OPENSPEC_AGENTS.md`) so a recursive scan for `AGENTS.md`
  doesn't trip on two of them.

## Decisions

### Decision 1: `src/native/<module>/{index.ts, bridge.ts, sha1.ts, __fixtures__/, *.test.ts}`

Each ported C module gets its own folder under `src/native/`:

```
src/native/random/
├── index.ts                # TS port of puzzles/random.c
├── bridge.ts               # Worker-side bridge: handle table + JS-library shim consumers
├── sha1.ts                 # Internal dep (only random uses it today)
├── __fixtures__/
│   └── corpus.json
└── random.test.ts          # Corpus replay
```

Conventions:

- `index.ts` is the TS impl, exported as the module's public surface.
- `bridge.ts` exists only when the module has a wasm-side bridge (e.g.
  `--js-library` for `random`). Pure-TS-only seams may not need one.
- `__fixtures__/` holds the C-recorded corpus.
- Tests sit at the module-folder root with a descriptive name
  (`random.test.ts`, not `index.test.ts`) so they read well in test
  output.

**Alternatives considered:**

- *Flat `src/native/{random,sha1,random-bridge}.ts` + per-module
  fixture folders.* Current half-state. Mixes module internals with
  fixture/test folders at the same depth — the next 6 modules turn
  this into chaos.
- *`src/native/<module>.ts` + `src/native/<module>/__internals__/`
  for sub-pieces.* Keeps the public API at module-name.ts but pushes
  internals down. Rejected: the bridge file is sometimes co-equal with
  the impl, not an internal, and the `module.ts` + `module/`
  juxtaposition is awkward in editors and `ls` output.
- *`src/native/<module>/<module>.ts` (`src/native/random/random.ts`).*
  Repetitive in import paths (`from "./random/random"`); `index.ts` is
  the conventional name and benefits from TypeScript's implicit
  `index.ts` resolution if/when we move off `verbatimModuleSyntax`'s
  explicit extensions.

### Decision 2: `sha1.ts` lives inside `random/`

`sha1` was implemented for `random.c` only; `misc.c`'s other SHA-1
callers stay on the C side until a separate `port-sha1-from-misc` seam
exists. Putting `sha1.ts` at `src/native/sha1.ts` would imply a
shared-library status it doesn't have.

If `misc.c`'s SHA callers ever come over, lift `sha1.ts` out to
`src/native/sha1/` then. Today, internal placement keeps the public
shape honest.

### Decision 3: Single `AGENTS.md`, symlinked `CLAUDE.md`, renamed `openspec/OPENSPEC_AGENTS.md`

Pattern borrowed from `~/codeliance/codeliance-stack/evaluator`:

- `AGENTS.md` — the single source of strategic context and conventions
  for agent-style readers (Claude Code, codex, OpenAI's agents, human
  contributors).
- `CLAUDE.md` — symlink → `AGENTS.md`. Claude Code reads `CLAUDE.md`;
  keeping it a symlink means it never drifts.
- `openspec/OPENSPEC_AGENTS.md` — renamed from `openspec/AGENTS.md`.
  Disambiguates from the project-root `AGENTS.md` for any tool or
  contributor that scans for `AGENTS.md` recursively. The managed
  `<!-- OPENSPEC:START -->` block in the project-root `AGENTS.md`
  points at this renamed file.

**Risks / trade-offs:**

- `openspec update` (the upstream openspec CLI command that refreshes
  instruction files) writes to `openspec/AGENTS.md`. After this change,
  running it would re-create `openspec/AGENTS.md` alongside our
  renamed `openspec/OPENSPEC_AGENTS.md`, and possibly write a stale
  managed block to the project-root `AGENTS.md` and `CLAUDE.md`. The
  evaluator project lives with this — they re-rename after running
  `openspec update`. We accept the same cost. Worth a one-line note in
  the new `OPENSPEC_AGENTS.md` saying "if you just ran `openspec
  update`, rename `openspec/AGENTS.md` → `openspec/OPENSPEC_AGENTS.md`
  again."

**Alternatives considered:**

- *Keep three separate files (PLAN.md / AGENTS.md / CLAUDE.md).*
  Status quo. The duplication is already visible: `CLAUDE.md` says
  "no tests yet"; `PLAN.md` describes the landed test discipline. Three
  homes → three drift sources.
- *Single file but call it `CLAUDE.md` (no symlink).* Breaks the
  user's cross-project convention (every other project of theirs uses
  `AGENTS.md` as the source-of-truth). Also less portable: other
  agents (codex, OpenAI, etc.) look for `AGENTS.md`.
- *Keep `openspec/AGENTS.md` as-is and accept the collision with the
  project-root `AGENTS.md`.* Tools that find files by `AGENTS.md`
  alone (no path constraint) would pick whichever comes first. The
  rename is a small one-time cost vs. an open-ended ambiguity.

### Decision 4: `scripts/build-native.sh` mirrors `build-icons.sh`

The build-pipeline spec already says characterization harnesses build
into `/build/native/`. The implementation is missing. New script:

```bash
#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC_DIR="${REPO_ROOT}/puzzles"
BUILD_DIR="${REPO_ROOT}/build/native"

JOBS=${JOBS:-$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1)}

# Force the unix path on every host so cliprogram() compiles natively.
# (macOS would otherwise pick the osx.cmake platform, which is gone but
# CMake's autodetect still tries.)
cmake \
  -B "${BUILD_DIR}" \
  -S "${SRC_DIR}" \
  -DCMAKE_SYSTEM_NAME=Linux \
  -DCMAKE_CROSSCOMPILING=FALSE

TARGETS=("$@")
[ "${#TARGETS[@]}" -eq 0 ] && TARGETS=(random-trace)
(cd "${BUILD_DIR}" && make -j"${JOBS}" "${TARGETS[@]}")
```

**Alternatives considered:**

- *Reuse `build-icons.sh` and rely on its side-effect of compiling
  `puzzles/auxiliary/*` into `build/icons/auxiliary/`.* Status quo.
  Works but contradicts the spec's stated location and ties harness
  builds to icons (which need GTK+3). Rejected.
- *Move auxiliary out of the main `puzzles/CMakeLists.txt` chain so it
  only builds when `build-native.sh` runs.* More invasive — would
  patch the upstream subtree. Rejected for fidelity reasons.
- *A separate top-level CMakeLists.txt that pulls in just
  `puzzles/auxiliary/`.* Cleaner long-term but bigger change. Defer
  until there are enough harness binaries to justify it.

### Decision 5: Land all three concerns in one change

Each item is small and mechanical; one review pass is cheaper than
three. They share an audience (the next-seam author) and a risk
window (set conventions before the next seam multiplies them).

**Alternatives considered:**

- *Three separate changes.* The prior pattern (`reorganize-repo-tooling`
  + `reorganize-src-layout`) split work by *kind* of file (tooling vs.
  app source). These three are unified by *who reads them* (next
  contributor) and *when they matter* (before next seam), so bundling
  is the better axis here.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| `openspec update` regenerates `openspec/AGENTS.md` | One-line note in `OPENSPEC_AGENTS.md`; accept the manual rename cost (matches evaluator pattern). |
| `AGENTS.md` grows too long to keep mentally fresh | Section headings act as a TOC; nothing in this change adds new content — it's reorganization. |
| Symlink doesn't survive on Windows checkouts | Repo already uses POSIX-only build scripts (`.sh`); Brewfile gates everything. Windows is not a supported dev platform. |
| `scripts/build-native.sh` masks an upstream CMakeLists change | Same risk as `build-icons.sh`. Mitigated by the corpus round-trip in tasks §2.4 — if the harness drifts, the corpus diff catches it. |
| Renaming `random.ts` → `index.ts` confuses `git log` | Mitigated by using `git mv`. Tasks §5.6 verifies `git log --follow` works. |

## Migration Plan

Single PR; tasks ordered so each section's verification can run in
isolation.

1. Native reorg (§1) — moves + import updates; verify with `tsc` +
   `vitest`.
2. Build-native script (§2) — adds new script; verify with corpus
   round-trip.
3. Agent-docs consolidation (§3) — content move + symlink + rename;
   no functional verification beyond `cat CLAUDE.md` reading the new
   content.

No rollback plan. If something breaks, revert the PR.

## Open Questions

- Should the new `OPENSPEC_AGENTS.md` add a "what to do when openspec
  update runs" footnote, or do we just rely on contributors noticing
  the regenerated file? Leaning toward the footnote; it's two lines.
- Once tree234 lands, do we want `src/native/<module>/types.ts` as a
  convention (mirroring `src/puzzle/types.ts`)? Probably yes, but the
  random module doesn't need one yet — defer.
