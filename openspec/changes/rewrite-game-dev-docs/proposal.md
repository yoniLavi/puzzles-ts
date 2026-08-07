# Change: Rewrite the dev guides as docs/games/ + author the framework RDD vision

## Why

The two `docs/porting/` guides were written for a job that is finished: porting
C games. They are organised around the port *lifecycle* ("before → scaffold →
differential → parity gate"), carry a 30-line "there is no C any more" warning
banner as their opening, and interleave four different concerns (mechanics,
input/rendering, solver/generator, testing) inside one 2,658-line file. The
project's actual ongoing job — implementing and maintaining games in a
TypeScript-only codebase, almost entirely via AI sessions — deserves docs
organised by *concern*, with greppable named anchors instead of the positional
§ numbers that ~45 live source files cite today and that shift on every
insertion.

Separately, the owner wants an RDD (readme-driven development) statement of
where the architecture should go: the repo as a *framework* for implementing
most types of puzzle game with as little per-game machinery as possible, where
solver, difficulty grading, hint narration and mistake checking are projections
of one declared deduction engine, and **every game ships a full explained
hint**. Writing those docs first — as if the framework existed — is the
cheapest way to debug the design before any code moves.

## What Changes

- **`docs/porting/` is retired**; its content is redistributed, updated to the
  current architecture, into a new `docs/games/` set organised by concern:
  `README.md` (map + lifecycle + definition of done), `mechanics.md` (params /
  state / moves / codecs / presets / capability hooks), `input.md`,
  `rendering.md`, `solver-and-generator.md`, `hints.md`, `testing.md`,
  `engine-catalog.md` (the shared-helper reference). Nothing hard-won is
  dropped: every lesson, tell and exemplar pointer in the old guides lands in a
  new home or is deliberately dropped with a recorded reason (the coverage map
  is in this change's `design.md`).
- **Named anchors replace § numbers.** Sections get short, distinctive,
  stable headings; citations (code comments, specs, AGENTS.md) reference
  `<file> § "Heading"`. All live citations are repointed in this change.
- `AGENTS.md`, `scripts/new-game-port.sh`, and the three specs that name
  `docs/porting/` paths (`repo-layout`, `ts-engine`, `palisade`) are updated.
- `docs/test-strength.md` stays where it is (not porting-specific; already
  correctly placed).
- **`docs/framework-rdd/` is added**: explicitly-labelled design-fiction docs
  describing the target framework as if it existed — the declarative game
  definition, the unified deduction/narration engine, the derived guarantees
  (grading, mistakes, hints), and the migration path from today's contracts.
  Not normative; each file carries a status banner. Follow-up implementation
  changes will be scoped from it.

## Impact

- Affected specs: `repo-layout` (the "Developer guides" and "scaffolding
  script" requirements name the guide files; a new requirement covers the
  design-fiction directory), `ts-engine` (one requirement cites
  hint-authoring), `palisade` (same).
- Affected code: comment-only edits across ~45 `src/` files repointing guide
  citations; `scripts/new-game-port.sh` checklist text; `AGENTS.md` guide
  pointers. No behaviour changes anywhere.
