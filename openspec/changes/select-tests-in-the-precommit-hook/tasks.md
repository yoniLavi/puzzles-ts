# select-tests-in-the-precommit-hook — tasks

- [x] 1. `scripts/checks/select-tests.mjs` — union of the import graph
      (`vitest list --changed --filesOnly`) and glob reach, failing closed to
      `ALL`.
- [x] 2. Handle **both** literal forms of `import.meta.glob` — a string and an
      array of strings. The array form spans several lines and was missed by a
      line-oriented first pass; the guard caught it on its first run.
- [x] 3. `src/test-selection.test.ts` — fails on a computed glob pattern or a
      direct `node:fs` read from a test inside the gate's include.
- [x] 4. **Prove the guard fails**: planted a computed pattern in
      `color-scheme-default.test.ts`, watched it go red naming the file,
      restored.
- [x] 5. Wire into `scripts/gate.sh` behind `GATE_PRECOMMIT=1`. CI and
      `npm run gate` untouched.
- [x] 6. Verify end to end: a game `render.ts` change selects 47 files; a
      `help/` page selects 6 where the graph alone selects 0; staging
      `vitest.config.ts` yields `ALL`.
- [x] 7. Spec delta — `ADDED` the hook-selection requirement, `MODIFIED` the
      previous "not adopted" requirement to say the graph is permitted as one
      term of a union. Both its scenarios reproduced.

## Traps recorded at the site

- **A block-comment stripper eats live code in this tree.** A doc comment
  mentioning a glob pattern contains `**/*`, whose first two characters are `*`
  and `/`, so `/\/\*[\s\S]*?\*\//` ends the comment at the pattern. Added as a
  tidy-up to the selector, it silently dropped three help guards from a real
  selection. The selector now parses prose on purpose (it can only
  over-select); the guard strips line by line, which a self-terminating
  delimiter cannot escape.
- **A line-oriented grep cannot see a multi-line construct**, which is how "all
  39 glob calls take a string literal" was established and was wrong.

## Not done

- **No runtime-coverage selector, and no new dependency.** `vitest-affected` is
  the only tool whose mechanism would work here and it has one GitHub star.
  The union above needs neither.
- **Worker-count tuning.** The box this was built on has 16 GB of RAM and sits
  ~24 GB into swap, so six vitest workers each holding a module graph may cost
  more than they save — a one-line change, but a separate question, and it was
  measured only partially before the owner called time on measuring.
