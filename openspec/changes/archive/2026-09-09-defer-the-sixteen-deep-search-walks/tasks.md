# defer-the-sixteen-deep-search-walks — tasks

- [x] 1. Defer the two deep-search walks in `sixteen.test.ts` with `itSlow`, and
      state at the site what the gate keeps and what it gives up.
- [x] 2. **Verify both directions with `TANGLE_COST` zeroed**, rather than
      reasoning about the loss: gate green (57 passed, 2 skipped), slow tier red
      on "four tangles". Mutation restored.
- [x] 3. Correct `hint-resume.test.ts`'s `SEARCH_REACH` entry for Sixteen. The
      audit's commit claimed those walks as the gate's large-board cover, which
      this change makes false — a sentence that had to move in the same commit
      as the behavior it describes.
- [x] 4. Re-measure: `sixteen.test.ts` 109.0 s → **20.8 s CPU**.
- [x] 5. Write a real `Purpose` for `openspec/specs/build-pipeline/spec.md`,
      replacing the archiver's `TBD - update Purpose after archive` placeholder
      left by `remove-docker-emcc-build`.
- [x] 6. Gate green; archive.

## Not in this change

**Test-impact selection** ("run only the tests downstream of a commit") was
investigated at the owner's request and is **deferred to its own change**,
`investigate-test-impact-selection` — it needs an experiment, not a decision,
and `build-pipeline` already requires that experiment before any such scheme is
authorized.
