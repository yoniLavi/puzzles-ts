# Plan: TypeScript port of Simon Tatham's Puzzle Collection

This document is the durable strategic context for this project. New collaborators (human or AI) should read it first before starting work. Granular per-task structure will be managed via **openspec** (see [Work management](#work-management) below); PLAN.md carries the why and the shape.

## Goal

Gradually replace the C/WASM puzzle engine in this project with a native TypeScript implementation, while keeping the app green at every step. The non-negotiable bar is **fidelity** (byte-identical behavior at every replaced seam, verified by characterization tests) combined with **incremental risk** (no big-bang rewrite, no sustained red bar).

## Lineage

- **Upstream**: [Simon Tatham's Portable Puzzle Collection](https://git.tartarus.org/?p=simon/puzzles.git). ~40 puzzles, MIT-licensed, actively maintained by Simon and a long list of contributors.
- **Direct parent**: [medmunds/puzzles-web](https://github.com/medmunds/puzzles-web). A PWA shell over upstream's C compiled to WASM via Emscripten, using a C++ `webapp.cpp` + Embind as a typed frontend adapter, running the WASM in a Web Worker (via Comlink), with a Lit/Web-Awesome/Vite-based TS app. The puzzles directory in puzzles-web is a git subtree of upstream with a small number of local patches.
- **This project**: forked from puzzles-web. The goal is to push the TS/WASM seam **progressively deeper** into the C code, eventually displacing it entirely.

## Approach: Feathers-style seam replacement

Treat each C module as a unit to "characterize, seam, replace" per Michael Feathers' *Working Effectively with Legacy Code*:

1. Pick a seam — typically a single C module with a clean, well-bounded interface.
2. Generate **characterization tests**: feed the existing C implementation a corpus of inputs, capture outputs as golden data.
3. Implement a TS equivalent.
4. Replay the corpus against the TS impl; assert byte-identical outputs.
5. Add an Embind/cwrap bridge so the rest of the C code can call the TS impl instead of its own. Verify benchmark-style integration tests (generate N boards per preset per puzzle, all solvable) still pass.
6. Once stable, delete the C impl; the TS impl becomes the only implementation.

This pattern is already proven for the frontend boundary in puzzles-web (`webapp.cpp` + Embind + Comlink). The work here extends it inward.

## Why this approach (alternatives considered and rejected)

- **Full native TS rewrite from scratch.** Rejected. ~100–150 KLOC of subtle generator/solver logic with no fidelity bar during the journey; loses upstream's bug-fix lineage; multi-person-year effort with no incremental green bar.
- **Port one whole puzzle end-to-end, side-by-side with WASM.** Simpler infra and a quicker first ship, but each puzzle requires re-deriving its dependencies (midend slice, drawing, library helpers). Higher per-puzzle cost and no shared TS library to amortize across puzzles.
- **Seam-by-seam (this plan).** Most disciplined. Highest fidelity (golden tests at every step). Keeps upstream integration viable for un-displaced modules. The cost is real bridge boilerplate per seam and the obligation to maintain two parallel implementations during each transition.

## Test discipline

There is **no inherited test suite** of any depth. Upstream has per-module unit tests in `auxiliary/` (e.g. `tree234-test.c`, `latin-test.c`) and a `benchmark.sh` smoke test, but no golden-output regression tests for puzzle behavior. puzzles-web has no tests at all yet ("no tests yet" at v0.0.1, per their README). We are building this discipline from scratch.

Three layers of testing, in increasing scope:

1. **Characterization tests per seam.** Golden input/output corpora captured from the native C binary; replayed against the TS impl with byte-identical assertions. Each new seam ships with its corpus. This is the primary fidelity guarantee.
2. **Upstream per-module unit tests, ported.** Where upstream's `auxiliary/*-test.c` covers a module we're replacing (tree234, latin, dsf-via-findloop, sort, combi, hat, penrose, spectre), port the test to TS alongside the module. The C test becomes the spec.
3. **Benchmark soak (end-to-end).** Equivalent of upstream's `benchmark.sh`: for every preset of every puzzle, generate N boards via the hybrid TS/WASM build and prove each is solvable. Both the pure-WASM and hybrid builds must stay green.

The bit-identical RNG requirement is **important** for characterization tests (so traces replay deterministically), and is also a product-side win (existing game IDs and shared puzzles keep working in the TS build).

## Seam order

Bottom-up, leaves first, to maximize how much downstream code benefits from each replacement:

1. **`random.c`** — first, as the pilot. ~350 lines (SHA-1 based pure state machine), every puzzle uses it. Each seam splits naturally into two openspec changes: **`port-random-to-typescript`** (characterize → TS impl → corpus replay), then **`wire-random-to-wasm`** (`--js-library` bridge + build flag, WASM rebuild, browser verification). The first half completed faster than feared; if both halves can't finish within a small handful of working days, the larger plan needs reconsidering. Patterns established here — in-tree harnesses, JSON corpus replay via Vitest, the integer-handle bridge — carry to every later seam.
2. **Leaf libraries**: `tree234.c`, `dsf.c`, `combi.c`, `sort.c`, `findloop.c`, `matching.c`, `divvy.c`. Each has a clear interface; most have existing C unit tests.
3. **Mid-level shared logic**: `latin.c`, `loopgen.c`, `grid.c`, `laydomino.c`, `penrose.c`, `hat.c`, `spectre.c`.
4. **Drawing API**: `drawing.c` is already a function-pointer dispatcher — a natural seam. In the WASM build, per-frontend drawing handlers are already JS (in `emcclib.js`); displacing the C wrapper is mostly removing a layer.
5. **Per-puzzle back ends**: ~40 files, smallest first (Cube, Pegs, Flip). Each back end's `const game thegame` table is a natural seam.
6. **`midend.c`** — last. ~3.2 KLOC of stateful undo/redo/timing/serialisation. The biggest single port; it benefits enormously from having all its transitive callees already in TS.

## License & attribution

Keep `puzzles/LICENCE` (Simon + upstream contributors, MIT) intact wherever the upstream subtree lives. This satisfies MIT's "include in all copies" obligation.

Top-level `LICENSE.md` carries a layered MIT notice crediting, in chronological order: Simon Tatham + upstream contributors (deferring to `puzzles/LICENCE` for the full list), Mike Edmunds (puzzles-web), Yoni Lavi (this project). Single MIT body covers all three. Top-level `CREDITS.md` is the graceful gesture with explicit thanks and links to upstream and puzzles-web. Legal compliance is satisfied by the layered MIT notice alone.

## Reference directories

Two roles to keep distinct:

- **`puzzles/`** (in-tree subtree of upstream). The full upstream source, including `auxiliary/`. **All project work** — characterization harnesses, fixtures, any auxiliary tooling — lives here. Native builds use `puzzles/build/` (gitignored). The harness pattern is established by `puzzles/auxiliary/random-trace.c`.
- **`../puzzles/`** (sibling clone). Useful only for running upstream's own tools (`benchmark.sh`, future upstream auxiliary tests) unmodified. **Not** a place to put our work.
- **`../puzzles-web/`** (sibling clone). The pre-fork baseline; useful as a diff reference in early phases.

## Work management

We will manage this work via **openspec**. Specs, conventions, and per-seam tasks will be set up at the start of implementation. Treat PLAN.md as the durable strategic context; openspec carries the granular per-task structure.

## What's been done

Recorded here as durable reference, not as a changelog (commit history carries the detail):

- **Project setup**: openspec initialised; layered `LICENSE.md` + `CREDITS.md`; Vitest + a strict pre-commit gate (`tsc -b --noEmit` → `npm run lint` → `npm run test:run`).
- **`random.c` (TS impl half)**: corpus harness in-tree at `puzzles/auxiliary/random-trace.c`; corpus at `src/native/random/__fixtures__/corpus.json` (6 fixtures, 66 calls); TS port in `src/native/{sha1,random}.ts`; replay test passes byte-for-byte.
- **`random.c` (bridge half)**: deferred to follow-up openspec change `wire-random-to-wasm`. Design locked: TS owns canonical state, C holds integer handles, bridge via Emscripten `--js-library`, gated by a `USE_TS_RANDOM` CMake option (default OFF).

## Known unresolved questions

- Whether to keep the WASM in a Web Worker (via Comlink) as TS replacements grow, or migrate logic to the main thread. Likely keep the worker until midend ports, then re-evaluate.
- How long to keep tracking medmunds upstream. Useful in early phases; less useful as our TS layer grows materially. Track upstream Simon Tatham always.
- Performance budget once enough seams have crossed the wasm/JS boundary. Each crossing has fixed cost; at some point it may make sense to batch or to flip whole subsystems at once.

(*The Embind handle-ownership question that lived here originally is resolved: Option A — TS owns, C holds an integer handle. See `port-random-to-typescript/design.md`.*)
