# Tasks

## 1. New ts-migration capability spec

- [x] 1.1 Authored `specs/ts-migration/spec.md`: requirements +
      scenarios for top-down order, C-as-reference + dev-time
      differential spot-check (not byte-corpora), per-game hybrid,
      per-game C deletion, deliberate-divergence-allowed, clean TS
      save format / future-ID stability via random.ts.

## 2. build-pipeline spec delta

- [x] 2.1 MODIFIED the umbrella requirement: dropped the
      corpus-fidelity / "future bridges document the fidelity bar"
      language; reframed as runtime mechanics under the per-game
      `ts-migration` strategy; softened the "default build" scenario
      from "byte-identical" to "correct, spot-checked". Umbrella
      mechanics + coherence scenarios retained (they still function).

## 3. AGENTS.md doctrine rewrite

- [x] 3.1 Rewrote Goal / Lineage / Upstream policy / Approach / Test
      discipline / "C deletion" / TS port style / Migration order to
      the top-down, C-as-reference, per-game model. Points at the
      `ts-migration` spec as authority. Also fixed the Code
      conventions C-code bullet, the Constraints DO-NOT bullet, the
      repo-layout `puzzles/` + `src/native/` entries, the special-
      files harness entry, the work-management openspec-cadence
      paragraph, and the build-commands umbrella note.
- [x] 3.2 Added a "What's been done" pivot entry + legacy
      branch/tag pointer; refreshed "Known unresolved questions".
- [x] 3.3 Verified `CLAUDE.md` symlink resolves (identical content).

## 4. openspec/project.md

- [x] 4.1 Updated Purpose, Tech-Stack test note, Code-Style C bullet,
      Architecture Patterns (top-down replaces Feathers seam),
      Testing Strategy (behavioural + spot-check, no corpus),
      Important Constraints, and the upstream-dependency note.

## 5. README rewrite

- [x] 5.1 Rewrote almost entirely: new status + "how the migration
      works" + structure framed around top-down TS / per-game hybrid.
      Kept the play link, puzzles-unreleased credit, bug-report
      guidance, prerequisites, license. Build section reframes the
      umbrella as build-time mechanics, not strategy.

## 6. Retire add-benchmark-soak

- [x] 6.1 Removed `openspec/changes/add-benchmark-soak/` (0/25,
      never started; its byte-diff hybrid-vs-pure premise is dead
      once divergence is intended). A playability soak can be
      re-proposed against the `ts-migration` spec later if wanted.

## 7. Verification + hygiene

- [x] 7.1 `openspec validate pivot-to-top-down-ts --strict` passes.
- [x] 7.2 `openspec validate --specs --strict` passes after archive
      (verified post-archive: 7/7 incl. new `ts-migration`).
- [x] 7.3 `tsc -b --noEmit` clean + `npm run lint` (96 files, no
      fixes) + `npm run test:run` (345/345) — no runtime code touched.
- [x] 7.4 `openspec list` shows only `pivot-to-top-down-ts`;
      `add-benchmark-soak` gone.
