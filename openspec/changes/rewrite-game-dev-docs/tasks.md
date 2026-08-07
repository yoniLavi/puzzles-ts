# Tasks

## 1. docs/games/ (the current-architecture guides)

- [x] 1.1 Fix the file set, per-file scope, anchor conventions and coverage
      rule (the drafting blueprint; recorded in `design.md`).
- [x] 1.2 Draft the eight files: `README.md`, `mechanics.md`, `input.md`,
      `rendering.md`, `solver-and-generator.md`, `hints.md`, `testing.md`,
      `engine-catalog.md`.
- [x] 1.3 Adversarial coverage pass: every lesson/tell/exemplar in
      `docs/porting/*` has a destination or a recorded deliberate drop.
- [x] 1.4 Editorial review pass over all eight files (one voice, correct
      cross-links, no restated normative wording — link the owning spec).

## 2. Repoint and retire

- [x] 2.1 Repoint `AGENTS.md` (the "Dev guides" section and any other
      `docs/porting` mentions) at the new set.
- [x] 2.2 Repoint `scripts/new-game-port.sh` checklist text.
- [x] 2.3 Repoint every live `src/` citation (comments citing
      `hint-authoring §x.y` / playbook sections) to `<file> § "Heading"` form;
      verify by grep that no live reference to `docs/porting` or a bare
      positional § citation remains outside archives.
- [x] 2.4 Repoint the two active changes' `tasks.md` references
      (`add-slide-keyboard-control`, `audit-input-mode-parity`).
- [x] 2.5 Delete `docs/porting/`.

## 3. Specs

- [x] 3.1 `repo-layout` delta: "Developer guides" requirement names the new
      set; adds the named-anchor citation convention; adds the design-fiction
      (`docs/framework-rdd/`) carve-out.
- [x] 3.2 `repo-layout` delta: scaffolding-script requirement points at the
      new README/playbook home.
- [x] 3.3 `ts-engine` delta: Latin-narrator requirement's recorded-decision
      pointer moves to `docs/games/hints.md`.
- [x] 3.4 `openspec validate rewrite-game-dev-docs --strict` passes.

## 4. docs/framework-rdd/ (the vision)

- [x] 4.1 Write the RDD doc set as design fiction with status banners:
      README (vision + status + how to read), the game-definition doc, the
      unified deduction/narration engine doc, presentation, derived
      guarantees/testing, and the migration path from today's contracts.
- [x] 4.2 Cross-check the fiction against the real constraints it must honour
      (scene-graph postmortem; exemplar-hint-never-loses-a-word; guess-free
      generation policy; the fixpoint's known no-gos).

## 5. Close out

- [x] 5.1 Full gate via a normal commit (no bypass).
- [ ] 5.2 Owner acceptance of the docs; archive on top.
