# Tasks

## 1. New ts-migration capability spec

- [ ] 1.1 Author `specs/ts-migration/spec.md` with requirements +
      scenarios for: top-down order, C-as-reference, dev-time
      differential spot-check (not byte-corpora), per-game hybrid,
      per-game C deletion, deliberate-divergence-allowed, clean TS
      save format / future-ID stability via random.ts.

## 2. build-pipeline spec delta

- [ ] 2.1 MODIFY the umbrella requirement: drop the "future bridges
      ship default-on by inheriting; per-seam proposals SHALL
      document the fidelity bar (corpus replay + property tests)"
      language. Reframe to the per-game-hybrid model. Keep the
      umbrella *mechanics* + coherence-check scenarios (they still
      function).

## 3. AGENTS.md doctrine rewrite

- [ ] 3.1 Rewrite "Goal", "Approach", "Upstream policy", "Test
      discipline", "Seam order", "C is never deleted" to the
      top-down / C-as-reference / per-game model. Point at the
      `ts-migration` spec as authority.
- [ ] 3.2 Add a "What's been done" entry for this pivot; add a
      pointer to the `legacy/seam-by-seam-fidelity` branch + tag.
- [ ] 3.3 Verify the `CLAUDE.md` symlink still resolves (same file).

## 4. openspec/project.md

- [ ] 4.1 Update Important Constraints + strategy framing to match
      the new doctrine (no byte-oracle; top-down; per-game hybrid;
      spot-check not corpus).

## 5. README rewrite

- [ ] 5.1 Rewrite almost entirely: status + structure + contribution
      framing around top-down TS. Keep the play link, bug-report
      guidance, build prerequisites, license. Reframe the build
      section (per-game hybrid; drop per-leaf-umbrella-as-strategy).

## 6. Retire add-benchmark-soak

- [ ] 6.1 Remove `openspec/changes/add-benchmark-soak/`. Note in the
      pivot proposal that a playability soak can be re-proposed in
      the new framing later.

## 7. Verification + hygiene

- [ ] 7.1 `openspec validate pivot-to-top-down-ts --strict` passes.
- [ ] 7.2 `openspec validate --specs --strict` passes after archive.
- [ ] 7.3 `tsc -b --noEmit` + `npm run lint` + `npm run test:run`
      still green (no runtime code touched — sanity only).
- [ ] 7.4 `openspec list` no longer shows `add-benchmark-soak`.
